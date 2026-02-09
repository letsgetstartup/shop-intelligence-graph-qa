import Fastify from 'fastify';
import cors from '@fastify/cors';
import { FalkorDB } from 'falkordb';
import dotenv from 'dotenv';
import queryweaverPlugin from './queryweaver/plugin.js';
import { chatCompletion, checkLLMHealth } from './offline_llm_client.js';
import { auditLog } from './audit.js';

dotenv.config();

const app = Fastify({ logger: false });
const PORT = process.env.PORT || 8080;
const OFFLINE_ONLY = process.env.OFFLINE_ONLY === 'true';
const LLM_RETRIES = parseInt(process.env.LLM_RETRIES || '2', 10);

app.register(cors, { origin: true });

// ─── Global connections ───
let dbClient = null;
let llmWarmed = false;

async function getDBClient() {
    if (dbClient) return dbClient;

    const FALKORDB_URL = process.env.FALKORDB_URL || process.env.FALKOR_URL || 'redis://localhost:6379';
    let host = 'localhost', port = 6379, password = '';

    try {
        const url = new URL(FALKORDB_URL);
        host = url.hostname || 'localhost';
        port = parseInt(url.port) || 6379;
        password = url.password || '';
    } catch {
        const parts = FALKORDB_URL.split(':');
        if (parts.length >= 2) {
            host = parts[0].replace('redis://', '').replace('//', '');
            port = parseInt(parts[parts.length - 1]) || 6379;
        }
    }

    const config = { socket: { host, port } };
    if (password) config.password = password;

    console.log(`[db] Connecting to FalkorDB at ${host}:${port}...`);
    dbClient = await FalkorDB.connect(config);
    console.log(`[db] Connected.`);
    return dbClient;
}

// ─── Graph schema discovery ───
async function getGraphSchema(graph) {
    try {
        const labelsRes = await graph.query('CALL db.labels()');
        const nodeLabels = labelsRes.data.map(row => Object.values(row)[0]);
        const relsRes = await graph.query('CALL db.relationshipTypes()');
        const relTypes = relsRes.data.map(row => Object.values(row)[0]);
        return { nodeLabels, relTypes };
    } catch (err) {
        console.error('[schema] Fetch failed, using static schema:', err.message);
        return {
            nodeLabels: ['Customer', 'Part', 'Job', 'Machine', 'Employee', 'Operation', 'Cluster'],
            relTypes: ['PLACED', 'PRODUCES', 'HAS_OPERATION', 'USES_MACHINE', 'WORKED_ON', 'HAS_CLUSTER', 'IN_CLUSTER']
        };
    }
}

// ─── SYSTEM PROMPT for Cypher generation ───
const CYPHER_SYSTEM_PROMPT = `You are a Cypher query generator for a FalkorDB graph database containing manufacturing shop floor data.
You MUST return ONLY the raw Cypher query. No explanations. No markdown. No code fences. Just the query.

Graph Schema:
- Node Labels: Customer, Part, Job, Machine, Employee, Operation, Cluster
- Relationship Types: PLACED, PRODUCES, HAS_OPERATION, USES_MACHINE, WORKED_ON, HAS_CLUSTER, IN_CLUSTER

Node properties (use EXACT names):
- Customer: CustomerID, CustomerName, City, Country, Industry, Terms, CreditLimit
- Part: PartNum, Description, UOM, Revision, StdMaterial, StdCycleTimeSec, StdCost, SellPrice
- Job: JobNum, SalesOrder, Revision, JobStatus, Priority, QtyOrdered, QtyCompleted, QtyScrapped, PlannedStart, DueDate, CloseDate, Notes
- Machine: WorkCenterID, WorkCenterName, MachineAlias, Department, RatePerHour
- Employee: EmployeeID, EmployeeName, Role, Shift, HourlyRate
- Operation: JobOperKey, OperSeq, OperationDesc, Status, JobNum, WorkCenterID, MachineAlias, PlannedStart, PlannedEnd, QtyComplete, QtyScrap
- Cluster: ClusterID, ClusterStart, ClusterEnd, RunSec, CycleCount

Relationship patterns:
- (Customer)-[:PLACED]->(Job)
- (Job)-[:PRODUCES]->(Part)
- (Job)-[:HAS_OPERATION]->(Operation)
- (Operation)-[:USES_MACHINE]->(Machine)
- (Employee)-[:WORKED_ON]->(Operation)
- (Machine)-[:HAS_CLUSTER]->(Cluster)
- (Operation)-[:IN_CLUSTER]->(Cluster)

Rules:
1. Return ONLY the Cypher query, nothing else
2. Always use LIMIT 10 unless the question asks for counts or aggregates
3. Use the exact property names listed above (e.g. JobNum NOT job_id, CustomerName NOT name)
4. For counts use: RETURN count(*) as count
5. For aggregates give clear aliases like total_cost, avg_hours
6. JobStatus values include: Active, Complete, Closed
7. Priority values include: Normal, Rush, Urgent, Hot`;

// ─── Cypher generation via LLM (NO FALLBACK) ───
async function generateCypherQuery(question, schema) {
    // Build dynamic system prompt with live schema if available
    let systemPrompt = CYPHER_SYSTEM_PROMPT;
    if (schema.nodeLabels.length > 0) {
        systemPrompt = systemPrompt.replace(
            'Node Labels: Customer, Part, Job, Machine, Employee, Operation, Cluster',
            `Node Labels: ${schema.nodeLabels.join(', ')}`
        );
    }
    if (schema.relTypes.length > 0) {
        systemPrompt = systemPrompt.replace(
            'Relationship Types: PLACED, PRODUCES, HAS_OPERATION, USES_MACHINE, WORKED_ON, HAS_CLUSTER, IN_CLUSTER',
            `Relationship Types: ${schema.relTypes.join(', ')}`
        );
    }

    let lastError = null;

    // Retry loop - NO FALLBACK
    for (let attempt = 0; attempt <= LLM_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[llm] Retry ${attempt}/${LLM_RETRIES}...`);
            }

            let cypherQuery = await chatCompletion({
                system: systemPrompt,
                user: question,
                temperature: 0,
                maxTokens: 512
            });

            // Clean up response
            cypherQuery = cypherQuery.replace(/```cypher\n?/g, '').replace(/```\n?/g, '').trim();

            // Remove any leading explanation text before MATCH/RETURN/WITH/CALL
            const matchIdx = cypherQuery.search(/\b(MATCH|RETURN|WITH|CALL|OPTIONAL)\b/i);
            if (matchIdx > 0) {
                cypherQuery = cypherQuery.substring(matchIdx).trim();
            }

            // Safety: reject write operations
            if (/\b(CREATE|MERGE|DELETE|SET|REMOVE|DROP)\b/i.test(cypherQuery)) {
                throw new Error('SAFETY: LLM generated write operation - rejected');
            }

            // Validate it looks like Cypher
            if (!/\b(MATCH|RETURN|CALL)\b/i.test(cypherQuery)) {
                throw new Error(`LLM did not generate valid Cypher: ${cypherQuery.slice(0, 100)}`);
            }

            return cypherQuery;
        } catch (error) {
            lastError = error;
            console.error(`[llm] Attempt ${attempt + 1} failed:`, error.message);
        }
    }

    // All retries exhausted - throw, do NOT fallback
    throw new Error(`LLM failed after ${LLM_RETRIES + 1} attempts: ${lastError?.message}`);
}

// ─── Pre-warm LLM on startup ───
async function warmUpLLM() {
    console.log('[llm] Pre-warming model...');
    try {
        const result = await chatCompletion({
            system: 'You are a Cypher query generator. Return only the query.',
            user: 'MATCH (n) RETURN count(n) as count',
            temperature: 0,
            maxTokens: 50
        });
        console.log(`[llm] Warm-up complete. Response: ${result.trim().slice(0, 60)}`);
        llmWarmed = true;
    } catch (e) {
        console.error('[llm] Warm-up failed:', e.message);
        console.error('[llm] WARNING: LLM not available. Queries will fail until LLM is online.');
    }
}

// ─── Format results ───
function formatResults(queryResult) {
    if (!queryResult.data || queryResult.data.length === 0) {
        return "No results found for this query.";
    }

    if (queryResult.data.length === 1 && Object.keys(queryResult.data[0]).length === 1) {
        const key = Object.keys(queryResult.data[0])[0];
        let value = queryResult.data[0][key];
        if (value && typeof value === 'object') {
            if (value.properties) value = value.properties;
            return `**${key}:**\n` + Object.entries(value).map(([k, v]) => `- ${k}: ${v}`).join('\n');
        }
        return `**${key}:** ${value}`;
    }

    const count = queryResult.data.length;
    const firstRow = queryResult.data[0];
    const keys = Object.keys(firstRow);

    const formatRow = (row) => keys.map(key => {
        let val = row[key];
        if (val && typeof val === 'object') {
            if (val.properties) val = val.properties;
            return `${key}: ${JSON.stringify(val)}`;
        }
        return `${key}: ${val}`;
    }).join(' | ');

    if (count <= 10) {
        return queryResult.data.map(formatRow).join('\n');
    }
    return `Found ${count} results:\n` + queryResult.data.slice(0, 10).map(formatRow).join('\n') + `\n... and ${count - 10} more`;
}

// ─── Follow-up suggestions ───
function suggestFollowUps(question) {
    const q = question.toLowerCase();
    const suggestions = [];

    if (q.includes('machine') || q.includes('utiliz') || q.includes('downtime')) {
        suggestions.push({ label: "Machine Utilization", query: "Which machines have the most operations?" });
        suggestions.push({ label: "Idle Machines", query: "Which machines have the fewest operations?" });
    }
    if (q.includes('job') || q.includes('late') || q.includes('overdue')) {
        suggestions.push({ label: "Late Jobs", query: "Which jobs have the earliest due dates?" });
        suggestions.push({ label: "Job by Customer", query: "Which customer has the most jobs?" });
    }
    if (q.includes('customer') || q.includes('order')) {
        suggestions.push({ label: "Top Customers", query: "Which customers placed the most orders?" });
        suggestions.push({ label: "Customer Revenue", query: "Show total sell price of parts by customer" });
    }
    if (q.includes('tool') || q.includes('missing') || q.includes('blocked')) {
        suggestions.push({ label: "Blocked Operations", query: "Which operations are blocked due to missing tools?" });
        suggestions.push({ label: "Tool Magazine", query: "Show machines and their loaded magazine status" });
    }
    if (q.includes('employee') || q.includes('operator') || q.includes('labor')) {
        suggestions.push({ label: "Top Workers", query: "Which employees have the most labor hours?" });
        suggestions.push({ label: "Shift Analysis", query: "How many employees are on each shift?" });
    }

    if (suggestions.length === 0) {
        suggestions.push({ label: "Job Count", query: "How many jobs are there?" });
        suggestions.push({ label: "Machine Load", query: "Which machines are most utilized?" });
        suggestions.push({ label: "Customer Orders", query: "Show customers with the most orders" });
    }

    return suggestions.slice(0, 3);
}

// ─── Health check ───
app.get('/ping', async (request, reply) => {
    const llmHealth = await checkLLMHealth().catch(() => ({ ok: false, error: 'unreachable' }));
    return {
        status: llmHealth.ok ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        offline_mode: OFFLINE_ONLY,
        llm: llmHealth,
        llm_warmed: llmWarmed,
        mode: 'production'
    };
});

// ─── Database test ───
app.get('/testdb', async (request, reply) => {
    try {
        const client = await getDBClient();
        const graph = client.selectGraph('shop');
        const result = await graph.query('MATCH (n) RETURN count(n) as count LIMIT 1');
        const count = result.data[0]?.count || 0;
        return { status: 'success', nodeCount: count };
    } catch (err) {
        return reply.code(500).send({ status: 'error', message: err.message });
    }
});

// ─── Graph Visualization ───
app.post('/graph/raw', async (request, reply) => {
    try {
        const { query, limit } = request.body || {};
        const cypher = query || `MATCH (n)-[r]->(m) RETURN n,r,m LIMIT ${limit || 100}`;
        const client = await getDBClient();
        const graph = client.selectGraph('shop');
        const result = await graph.query(cypher);

        const nodes = new Map();
        const links = [];
        result.data.forEach(row => {
            Object.values(row).forEach(entity => {
                if (!entity) return;
                if (entity.labels) {
                    nodes.set(entity.id, {
                        id: entity.id, label: entity.labels[0],
                        group: entity.labels[0], properties: entity.properties
                    });
                } else if (entity.relationshipType) {
                    links.push({
                        id: entity.id, source: entity.sourceId,
                        target: entity.destinationId, type: entity.relationshipType,
                        properties: entity.properties
                    });
                }
            });
        });
        return { nodes: Array.from(nodes.values()), links };
    } catch (err) {
        return reply.code(500).send({ error: err.message });
    }
});

// ─── Main query endpoint (LLM ONLY - NO FALLBACK) ───
app.post('/query', async (request, reply) => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
        const { question } = request.body;
        if (!question) {
            return reply.code(400).send({ error: "Missing 'question' in body" });
        }
        if (question.length > 2000) {
            return reply.code(400).send({ error: 'Question too long (max 2000 chars)' });
        }

        const client = await getDBClient();
        const graph = client.selectGraph('shop');
        const schema = await getGraphSchema(graph);

        // LLM generates Cypher - NO FALLBACK, with error self-correction
        let cypherQuery = await generateCypherQuery(question, schema);
        let result;
        let queryAttempts = 0;
        const MAX_QUERY_RETRIES = 2;

        while (queryAttempts <= MAX_QUERY_RETRIES) {
            try {
                result = await Promise.race([
                    graph.query(cypherQuery),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Graph query timeout (15s)')), 15000))
                ]);
                break; // success
            } catch (queryErr) {
                queryAttempts++;
                if (queryAttempts > MAX_QUERY_RETRIES) throw queryErr;

                // Ask LLM to fix its own query with the error message
                console.log(`[query] Cypher failed (attempt ${queryAttempts}), asking LLM to self-correct...`);
                cypherQuery = await chatCompletion({
                    system: CYPHER_SYSTEM_PROMPT + `\n\nIMPORTANT: Cypher does NOT have GROUP BY. Use aggregation in RETURN directly.\nDo NOT use SQL syntax. This is Cypher for FalkorDB/Neo4j.`,
                    user: `My previous Cypher query failed with this error:\nQuery: ${cypherQuery}\nError: ${queryErr.message}\n\nPlease fix the query for: "${question}"\nReturn ONLY the corrected Cypher query.`,
                    temperature: 0,
                    maxTokens: 512
                });
                cypherQuery = cypherQuery.replace(/```cypher\n?/g, '').replace(/```\n?/g, '').trim();
                const matchIdx = cypherQuery.search(/\b(MATCH|RETURN|WITH|CALL|OPTIONAL)\b/i);
                if (matchIdx > 0) cypherQuery = cypherQuery.substring(matchIdx).trim();
                console.log(`[query] Corrected Cypher: ${cypherQuery.slice(0, 100)}`);
            }
        }

        const answer = formatResults(result);
        const suggestions = suggestFollowUps(question);
        const durationMs = Date.now() - startTime;

        auditLog({
            requestId, question,
            route: 'llm', strategy: 'graph',
            cypher: cypherQuery,
            rowCount: result.data?.length || 0,
            answer, durationMs,
        });

        return {
            answer,
            suggestions,
            cypherQuery,
            timing: durationMs,
            source: 'llm',
            reasoning: {
                thought: `Generated Cypher query from natural language using local LLM (llama3.2).`,
                cypher: cypherQuery
            }
        };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        console.error('[query] FAILED:', err.message);

        auditLog({
            requestId,
            question: request.body?.question,
            error: err.message,
            durationMs,
        });

        return reply.code(500).send({
            error: 'Query failed',
            message: err.message,
            details: `LLM query processing failed: ${err.message}`,
            duration: durationMs
        });
    }
});

// ─── Start ───
const start = async () => {
    try {
        await app.register(queryweaverPlugin, {
            configPath: process.env.QUERYWEAVER_CONFIG_PATH || './config/queryweaver.config.json',
            postgresUrl: process.env.POSTGRES_URL || 'postgresql://shop_user:shop_pass_local@localhost:5432/shop',
            falkorUrl: process.env.FALKOR_URL || process.env.FALKORDB_URL || 'redis://localhost:6379',
            graphName: process.env.GRAPH_NAME || 'shop'
        });

        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`[server] ShopIntel PRODUCTION listening on port ${PORT}`);
        console.log(`[server] Mode: LLM-ONLY (no fallback)`);
        console.log(`[server] Endpoints:`);
        console.log(`  GET  /ping               — health + LLM status`);
        console.log(`  GET  /testdb             — database test`);
        console.log(`  POST /query              — NL→Cypher via LLM (production)`);
        console.log(`  POST /queryweaver/query  — template-based SQL+Cypher`);
        console.log(`  POST /queryweaver/hybrid — LLM hybrid SQL+Cypher (production)`);
        console.log(`  POST /graph/raw          — graph visualization`);

        // Pre-warm LLM after server is listening
        warmUpLLM().catch(() => {});
    } catch (err) {
        console.error('[server] Fatal:', err);
        process.exit(1);
    }
};

start();
