const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { FalkorDB } = require('falkordb');
const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

const app = Fastify({ logger: false });
const PORT = process.env.PORT || 8080;

app.register(cors, {
    origin: true
});

// Global connections
let dbClient = null;
let vertexAI = null;

// Initialize database connection
async function getDBClient() {
    if (dbClient) return dbClient;

    const FALKORDB_URL = process.env.FALKORDB_URL || 'falkors://localhost:6379';
    const url = new URL(FALKORDB_URL);

    // IMPORTANT: socket config structure is critical for FalkorDB package
    const config = {
        username: url.username || 'default',
        password: url.password || '',
        socket: {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            tls: url.protocol === 'falkors:' ? {} : undefined
        }
    };

    dbClient = await FalkorDB.connect(config);
    return dbClient;
}

// Initialize Vertex AI
function getVertexAI() {
    if (vertexAI) return vertexAI;

    // Vertex AI uses Application Default Credentials automatically in Cloud environment
    vertexAI = new VertexAI({
        project: 'nanoeng-fe538',
        location: 'us-central1'
    });
    return vertexAI;
}

// Get graph schema
async function getGraphSchema(graph) {
    try {
        const labelsRes = await graph.query('CALL db.labels()');
        const nodeLabels = labelsRes.data.map(row => Object.values(row)[0]);

        const relsRes = await graph.query('CALL db.relationshipTypes()');
        const relTypes = relsRes.data.map(row => Object.values(row)[0]);

        return { nodeLabels, relTypes };
    } catch (err) {
        console.error('Schema fetch failed, using fallback:', err);
        return {
            nodeLabels: ['Customer', 'Part', 'Job', 'Machine', 'Employee', 'Operation'],
            relTypes: ['ORDERED', 'CONTAINS', 'ASSIGNED_TO', 'NEXT', 'PERFORMED_BY', 'REQUIRES']
        };
    }
}

// Generate Cypher query using Gemini via Vertex AI
async function generateCypherQuery(question, schema) {
    const vertexAI = getVertexAI();
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-2.5-pro'
    });

    const prompt = `You are a Cypher query generator for a FalkorDB graph database containing manufacturing shop floor data.

Graph Schema:
- Node Labels: ${schema.nodeLabels.join(', ')}
- Relationship Types: ${schema.relTypes.join(', ')}

Node properties:
- Customer: CustomerID, Name, City, Country, Industry, Terms, CreditLimit
- Part: PartNum, Description, UOM, Revision, StdMaterial, StdCycleTimeSec, StdCost, SellPrice
- Job: JobNum, SalesOrder, Revision, JobStatus, Priority, QtyOrdered, QtyCompleted, QtyScrapped, PlannedStart, DueDate, CloseDate
- Machine: MachineName, WorkCenterID, WorkCenterName, Department, RatePerHour
- Employee: EmployeeID, Name, Role, Shift, HourlyRate
- Operation: JobOperKey, OperSeq, OperationDesc, Status
- Cluster: ClusterID, ClusterStart, ClusterEnd, RunSec, CycleCount
- StateEvent: State, StartTS, EndTS, Duration, Operator

Relationship Rules:
- (Customer)-[:PLACED]->(Job)
- (Job)-[:PRODUCES]->(Part)
- (Job)-[:HAS_OPERATION]->(Operation)
- (Operation)-[:USES_MACHINE]->(Machine)
- (Employee)-[:PERFORMED_BY]->(Operation)
- (Machine)-[:HAS_CLUSTER]->(Cluster)
- (Operation)-[:IN_CLUSTER]->(Cluster)
- (Machine)-[:HAS_STATE]->(StateEvent)

Industrial Data Grounding:
- Work Centers / Machine Names: "102 HAAS VF4", "103 HAAS VF4", "104 DOOSAN DNM6700", "22 DMU NLX 2500", "41 DMU NLX2500"
- Departments: "Turning", "Milling", "Support", "Quality"
- Job Examples: "J26-00001", "J26-00010"
- Performance Rule: OEE is not a direct property. To calculate availability/utilization, look at StateEvent nodes where State = 'RUNNING' or use Cluster metrics.



Convert this natural language question to a Cypher query:
"${question}"

Rules:
1. Return ONLY the Cypher query, no explanations
2. Use LIMIT 10 for safety unless the question asks for counts/aggregates
3. Use correct property names exactly as shown above (e.g., JobNum instead of job_id)
4. For counts, use "RETURN count(*) as count"
5. For aggregates, give clear aliases like "total_cost", "avg_hours"
6. DO NOT hallucinate entity names. Use the exact "MachineName" or "Department" provided in the Grounding list if mentioned.

Cypher query:`;

    try {
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini Generation Timeout (60s)')), 60000))
        ]);

        const response = result.response;
        let cypherQuery = response.candidates[0].content.parts[0].text.trim();

        // Clean up the response - remove markdown code blocks if present
        cypherQuery = cypherQuery.replace(/```cypher\n?/g, '').replace(/```\n?/g, '').trim();

        return cypherQuery;
    } catch (error) {
        console.error('Vertex AI Error:', error);
        throw error;
    }
}

// Format query results
function formatResults(queryResult) {
    if (!queryResult.data || queryResult.data.length === 0) {
        return "No results found.";
    }

    // If it's a single count/aggregate (FalkorDB returns data as array of objects)
    if (queryResult.data.length === 1 && Object.keys(queryResult.data[0]).length === 1) {
        const key = Object.keys(queryResult.data[0])[0];
        let value = queryResult.data[0][key];

        // Handle FalkorDB Node/Edge objects
        if (value && typeof value === 'object') {
            if (value.properties) value = value.properties;
            return `Result for ${key}:\n` + Object.entries(value).map(([k, v]) => `${k}: ${v}`).join('\n');
        }
        return `The answer is: ${value}`;
    }

    // For multiple rows, format as a summary
    const count = queryResult.data.length;
    const firstRow = queryResult.data[0];
    const keys = Object.keys(firstRow);

    let text = "";
    if (count <= 3) {
        text = queryResult.data.map(row => {
            return keys.map(key => `${key}: ${row[key]}`).join(', ');
        }).join('\n');
    } else {
        text = `Found ${count} results. First few:\n` +
            queryResult.data.slice(0, 3).map(row => {
                return keys.map(key => {
                    let val = row[key];
                    if (val && typeof val === 'object') {
                        if (val.properties) val = val.properties;
                        return `${key}: {${Object.entries(val).map(([k, v]) => `${k}:${v}`).join(', ')}}`;
                    }
                    return `${key}: ${val}`;
                }).join(', ');
            }).join('\n');
    }
    return text;
}

// Generate Natural Language Response using Gemini
async function generateNaturalLanguageResponse(question, cypherQuery, queryResult) {
    const vertexAI = getVertexAI();
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-2.5-pro'
    });

    const dataString = JSON.stringify(queryResult.data).slice(0, 10000); // Limit data size

    const prompt = `You are an expert Manufacturing Shop Floor Assistant named "Wizechat".
Your goal is to explain production data clearly to factory workers and managers.

User Question: "${question}"
Cypher Query Executed: "${cypherQuery}"
Raw Data Results: ${dataString}

Instructions:
1.  **Analyze the Data**: Look at the raw results. If empty, say so clearly.
2.  ** Actionable Insights**: Don't just list numbers. Tell the user *what to do* or *what it means*.
    *   Example: Instead of "Scrap is 5%", say "⚠️ Scrap rate is 5%. Check material quality on Op 40."
3.  **Use Icons**: specific icons for visual scanning:
    *   ⚠️ for alerts/warnings
    *   ✅ for good status/success
    *   📉 / 📈 for trends
    *   🏭 for machine/factory
    *   💰 for cost/money
    *   🛑 for stops/errors
4.  **Format**:
    *   Use Markdown bolding (**text**) for emphasis.
    *   Use bullet points for lists.
    *   Keep it concise (under 4 sentences usually, unless it's a complex report).
5.  **Industrial Infographics**:
    *   If the data supports it (numbers, percentages, status), YOU MUST include the [INFOGRAPHIC] JSON block at the very end.
    *   Format: [INFOGRAPHIC: {"type": "gauge|bar|status|kpi", "value": number, "label": "string", "unit": "%|qty|hrs", "status": "green|amber|red"}]
6.  **Action Suggestions (Fix the Challenge)**: 
    *   Find the most critical problem in the data (e.g., high scrap, machine down, late job).
    *   Provide 2-3 specific "Next Step Actions" to FIX the problem (e.g., "Schedule Repair", "Verify Calibration", "Check Material Quality").
    *   Format: [ACTIONS: [{"icon": "Wrench|AlertTriangle|ArrowRight|CheckZone|Database|TrendingUp|ShieldAlert|Box|Zap", "label": "Action label", "query": "Clear natural language query to solve the issue"}]]
    *   Icons: Use Wrench for maintenance, AlertTriangle for quality/scrap, Zap for speed/urgency, Database for history lookup.
    *   CRITICAL: The block MUST be valid JSON and on a single line.

Response:`;

    try {
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini Insight Generation Timeout (30s)')), 30000))
        ]);

        const response = result.response;
        let text = response.candidates[0].content.parts[0].text.trim();

        // Ensure double quotes for JSON
        text = text.replace(/'(?=[^"]*")/g, '"');

        return text;
    } catch (error) {
        console.error('Vertex AI Insight Error:', error);
        return formatResults(queryResult); // Fallback to raw formatting
    }
}

// Suggest follow-up questions
function suggestFollowUps(question) {

    const qLower = question.toLowerCase();
    const suggestions = [];

    if (qLower.includes('downtime') || qLower.includes('machine')) {
        suggestions.push("What was the primary cause of downtime?");
        suggestions.push("Which machines have the highest utilization?");
    }
    if (qLower.includes('late') || qLower.includes('overdue') || qLower.includes('job')) {
        suggestions.push("Which customer has the most late jobs?");
        suggestions.push("How many jobs are at risk of being late?");
    }
    if (qLower.includes('customer')) {
        suggestions.push("Which customers have the most orders?");
        suggestions.push("What is the total revenue by customer?");
    }
    if (qLower.includes('cost')) {
        suggestions.push("What is the total downtime cost for last month?");
        suggestions.push("Which job had the highest costs?");
    }

    if (suggestions.length === 0) {
        suggestions.push("How many jobs are currently in progress?");
        suggestions.push("Which machines are most utilized?");
        suggestions.push("Show me customers with overdue jobs");
    }

    return suggestions.slice(0, 3);
}

// Health check
app.get('/ping', async (request, reply) => {
    return { status: 'ok', time: new Date().toISOString() };
});

// Database test
app.get('/testdb', async (request, reply) => {
    try {
        const client = await getDBClient();
        const graph = client.selectGraph('shop');
        const result = await graph.query('MATCH (n) RETURN count(n) as count LIMIT 1');
        const count = result.data[0]?.count || 0;

        return { status: 'success', nodeCount: count };
    } catch (err) {
        console.error('Connection error:', err);
        return reply.code(500).send({ status: 'error', message: err.message });
    }
});

// Main query endpoint
app.post('/query', async (request, reply) => {
    const startTime = Date.now();
    try {
        const { question } = request.body;

        if (!question) {
            return reply.code(400).send({ error: "Missing 'question' in body" });
        }

        // Get database connection
        const client = await getDBClient();
        const graph = client.selectGraph('shop');

        // Get schema
        const schema = await getGraphSchema(graph);

        // Generate Cypher query
        const cypherQuery = await generateCypherQuery(question, schema);

        // Execute query
        const result = await graph.query(cypherQuery);

        // Generate Natural Language Answer
        let answer = await generateNaturalLanguageResponse(question, cypherQuery, result);

        // Parse Action Suggestions [ACTIONS: [...]]
        let suggestions = [];
        const actionsStart = answer.indexOf('[ACTIONS:');
        if (actionsStart !== -1) {
            let bracketCount = 0;
            let jsonStart = actionsStart + '[ACTIONS:'.length;
            let jsonEnd = jsonStart;

            // Find the matching closing bracket by counting
            for (let i = jsonStart; i < answer.length; i++) {
                if (answer[i] === '[') bracketCount++;
                if (answer[i] === ']') bracketCount--;
                if (bracketCount === 0 && answer[i] === ']') {
                    jsonEnd = i;
                    break;
                }
            }

            if (jsonEnd > jsonStart) {
                try {
                    const jsonStr = answer.substring(jsonStart, jsonEnd + 1).trim();
                    suggestions = JSON.parse(jsonStr);
                    // Remove the entire [ACTIONS: ...] block from answer
                    answer = answer.substring(0, actionsStart) + answer.substring(jsonEnd + 2);
                    answer = answer.trim();
                    console.log("✅ Parsed AI Actions:", suggestions);
                } catch (e) {
                    console.error("❌ Failed to parse actions JSON:", e.message);
                }
            }
        }

        // Strip any remaining metadata tags as fallback
        answer = answer.replace(/\[ACTIONS:\s*[\s\S]*?\]\]/g, '').replace(/\[INFOGRAPHIC:\s*[\s\S]*?\]/g, '').trim();

        if (!suggestions || suggestions.length === 0) {
            suggestions = suggestFollowUps(question);
        }

        return {
            answer,
            suggestions,
            cypherQuery,
            timing: Date.now() - startTime
        };
    } catch (err) {
        console.error('Request FAILED:', err);
        return reply.code(500).send({
            error: 'Failed to process question',
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            details: `The system encountered an error: ${err.message}. Please check if the database is reachable.`,
            duration: Date.now() - startTime
        });
    }
});

const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server listening on ${PORT}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

if (require.main === module) {
    start();
}

module.exports = app;
