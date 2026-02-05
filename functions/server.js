// functions/server.js (Option 1: QueryWeaver + Chat Wrapper)
const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { FalkorDB } = require("falkordb");
const { VertexAI } = require("@google-cloud/vertexai");
const pg = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = Fastify({ logger: false });

// CORS (safe even if you later call via hosting rewrites)
app.register(cors, { origin: true });

// ------------------------
// Global connections
// ------------------------
let dbClient = null;
let vertexAI = null;

// FalkorDB client (lazy)
async function getDBClient() {
    if (dbClient) return dbClient;

    const FALKORDB_URL = process.env.FALKORDB_URL || "falkors://localhost:6379";
    const url = new URL(FALKORDB_URL);

    const config = {
        username: url.username || "default",
        password: url.password || "",
        socket: {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            tls: url.protocol === "falkors:" ? {} : undefined
        }
    };

    dbClient = await FalkorDB.connect(config);
    return dbClient;
}

function getVertexAI() {
    if (vertexAI) return vertexAI;

    vertexAI = new VertexAI({
        project: process.env.GCP_PROJECT || "nanoeng-fe538",
        location: process.env.GCP_REGION || "us-central1"
    });
    return vertexAI;
}

// ------------------------
// Register QueryWeaver plugin (ESM) via a loader plugin
// IMPORTANT: QueryWeaver code is now in functions/queryweaver/*
// ------------------------
app.register(async function queryweaverLoader(fastify) {
    // This dynamic import allows CommonJS functions/ to load ESM plugin
    const { default: queryweaverPlugin } = await import("./queryweaver/plugin.js");

    // Config is now inside functions/ so firebase deploy includes it
    const configPath = process.env.QUERYWEAVER_CONFIG_PATH || "./config/queryweaver.config.json";

    const postgresUrl = process.env.POSTGRES_URL;
    const falkorUrl = process.env.FALKOR_URL || process.env.FALKORDB_URL || "redis://localhost:6379";
    const graphName = process.env.GRAPH_NAME || "shop";

    if (!postgresUrl) {
        console.error("CRITICAL: POSTGRES_URL is not defined in environment.");
    }

    try {
        await fastify.register(queryweaverPlugin, {
            configPath,
            postgresUrl,
            falkorUrl,
            graphName
        });
    } catch (err) {
        console.error("FAILED to register QueryWeaver plugin:", err.message);
        throw err;
    }
});

// ------------------------
// Helpers: Parse [ACTIONS: ...] from Gemini answer
// ------------------------
function parseActionsBlock(answerText) {
    let suggestions = [];
    let answer = answerText;

    const actionsStart = answer.indexOf("[ACTIONS:");
    if (actionsStart === -1) return { answer, suggestions };

    let bracketCount = 0;
    const jsonStart = actionsStart + "[ACTIONS:".length;
    let jsonEnd = -1;

    for (let i = jsonStart; i < answer.length; i++) {
        if (answer[i] === "[") bracketCount++;
        if (answer[i] === "]") bracketCount--;
        if (bracketCount === 0 && answer[i] === "]") {
            jsonEnd = i;
            break;
        }
    }

    if (jsonEnd > jsonStart) {
        try {
            const jsonStr = answer.substring(jsonStart, jsonEnd + 1).trim();
            suggestions = JSON.parse(jsonStr);
            answer = (answer.substring(0, actionsStart) + answer.substring(jsonEnd + 2)).trim();
        } catch (_) {
            // ignore parse errors
        }
    }

    // remove any leftover tags
    answer = answer.replace(/\[ACTIONS:\s*[\s\S]*?\]\]/g, "")
        .replace(/\[INFOGRAPHIC:\s*[\s\S]*?\]/g, "")
        .trim();

    return { answer, suggestions };
}

function fallbackSuggestions(question) {
    const qLower = String(question || "").toLowerCase();
    const out = [];

    if (qLower.includes("missing") || qLower.includes("tool")) {
        out.push("Which operations are blocked due to missing tools?");
        out.push("Show tool usage for job J26-00010");
    } else if (qLower.includes("job")) {
        out.push("Show tool usage for job J26-00010");
        out.push("Which machines are most utilized?");
    } else {
        out.push("How many jobs are currently in progress?");
        out.push("Which machines are most utilized?");
    }

    return out.slice(0, 3);
}

// ------------------------
// Gemini: turn raw QueryWeaver JSON into a short actionable answer
// ------------------------
async function summarizeQueryWeaverResult(question, qwResult) {
    const vertexAI = getVertexAI();
    const model = vertexAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-pro" });

    // Keep payload bounded
    const raw = JSON.stringify(qwResult).slice(0, 12000);

    const prompt = `You are an expert Manufacturing Shop Floor Assistant named "Wizechat".
Your job: answer the user clearly, based ONLY on the provided QueryWeaver results.

User Question: "${question}"

QueryWeaver Result (raw JSON):
${raw}

Rules:
1) If data is empty, say so plainly and suggest what to query next.
2) Provide actionable insights (2-4 sentences usually).
3) Use icons:
   ⚠️ warning/issue, ✅ good, 🛑 stop/blocker, 🏭 machine, 💰 cost, 📈/📉 trends
4) Use Markdown (**bold**, bullets).
5) If the result supports it, append ONE single-line infographic block:
   [INFOGRAPHIC: {"type":"gauge|bar|status|kpi","value":number,"label":"string","unit":"%|qty|hrs","status":"green|amber|red"}]
6) Then append ONE single-line actions block (valid JSON array):
   [ACTIONS: [{"icon":"Wrench|AlertTriangle|ArrowRight|CheckCircle2|Database|TrendingUp|ShieldAlert|Box|Zap","label":"Action label","query":"Follow-up question"}]]

Return ONLY the final response text (with optional INFOGRAPHIC + ACTIONS blocks).`;

    const MAX_RETRIES = 5;
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.candidates[0].content.parts[0].text.trim();
        } catch (err) {
            // Check for 429 or other retryable errors
            const isRateLimit = String(err).includes("429") || String(err).includes("RESOURCE_EXHAUSTED");
            if (isRateLimit && attempt < MAX_RETRIES - 1) {
                const waitMs = 1000 * Math.pow(2, attempt) + Math.random() * 500; // Exponential backoff + jitter
                console.warn(`Vertex AI 429 hit. Retrying in ${Math.round(waitMs)}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                attempt++;
                continue;
            }
            // If strictly a 429 and we exhausted retries, return a polite fallback
            if (isRateLimit) {
                return "System is currently experiencing high traffic (429). Please try your query again in a few moments.";
            }
            throw err;
        }
    }
}

// ------------------------
// Endpoints
// ------------------------
app.get("/ping", async () => ({ status: "ok", time: new Date().toISOString() }));

app.get("/testdb", async (req, reply) => {
    try {
        const client = await getDBClient();
        const graph = client.selectGraph(process.env.GRAPH_NAME || "shop");
        const result = await graph.query("MATCH (n) RETURN count(n) as count LIMIT 1");
        return { status: "success", nodeCount: result.data[0]?.count || 0 };
    } catch (err) {
        return reply.code(500).send({ status: "error", message: err.message });
    }
});

// Graph Visualization (keep existing behavior)
app.post("/graph/raw", async (req, reply) => {
    try {
        const { query, limit } = req.body || {};
        const cypher = query || `MATCH (n)-[r]->(m) RETURN n,r,m LIMIT ${limit || 100}`;

        const client = await getDBClient();
        const graph = client.selectGraph(process.env.GRAPH_NAME || "shop");
        const result = await graph.query(cypher);

        const nodes = new Map();
        const links = [];

        result.data.forEach(row => {
            Object.values(row).forEach(entity => {
                if (!entity) return;

                if (entity.labels) {
                    nodes.set(entity.id, {
                        id: entity.id,
                        label: entity.labels[0],
                        group: entity.labels[0],
                        properties: entity.properties
                    });
                } else if (entity.relationshipType) {
                    links.push({
                        id: entity.id,
                        source: entity.sourceId,
                        target: entity.destinationId,
                        type: entity.relationshipType,
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

// ------------------------
// CHAT ENDPOINT (Option 1)
// ------------------------
app.post("/query", async (req, reply) => {
    const started = Date.now();
    try {
        const { question, params } = req.body || {};
        if (!question) return reply.code(400).send({ error: "Missing 'question' in body" });

        // 1) Call QueryWeaver raw endpoint internally
        const qwResp = await app.inject({
            method: "POST",
            url: "/queryweaver/query",
            payload: { question, params: params || {} }
        });

        const qwJson = JSON.parse(qwResp.payload || "{}");
        if (!qwJson.ok) {
            return reply.code(400).send({
                error: "QueryWeaver failed",
                details: qwJson.error || "Unknown error",
                timing: Date.now() - started
            });
        }

        // 2) Summarize raw results into a chat response
        let answerText = await summarizeQueryWeaverResult(question, qwJson);

        // 3) Parse [ACTIONS] into suggestions array
        const parsed = parseActionsBlock(answerText);
        let suggestions = parsed.suggestions;

        // If AI didn't produce suggestions, fallback
        if (!suggestions || suggestions.length === 0) {
            suggestions = fallbackSuggestions(question);
        }

        return reply.code(200).send({
            answer: parsed.answer,
            suggestions,
            debug: {
                route: qwJson.route,
                strategy: qwJson.strategy
            },
            timing: Date.now() - started
        });
    } catch (err) {
        return reply.code(500).send({
            error: "Failed to process question",
            message: err.message,
            timing: Date.now() - started
        });
    }
});

// ------------------------
// ADMIN: Schema Sync (One-time use)
// ------------------------
app.post("/admin/sync-schema", async (req, reply) => {
    const { password } = req.body || {};
    if (password !== "align-schema-2026") {
        return reply.code(403).send({ error: "Unauthorized" });
    }

    try {
        const postgresUrl = process.env.POSTGRES_URL;
        if (!postgresUrl) throw new Error("POSTGRES_URL not set");

        const sqlPath = path.resolve(__dirname, "./create_core_views.sql");
        const sql = fs.readFileSync(sqlPath, "utf8");

        const pool = new pg.Pool({ connectionString: postgresUrl });
        const client = await pool.connect();
        try {
            await client.query(sql);
            const res = await client.query("SELECT schemaname, viewname FROM pg_views WHERE schemaname = 'core'");
            return {
                status: "success",
                message: "Schema alignment COMPLETE",
                views: res.rows.map(r => r.viewname)
            };
        } finally {
            client.release();
            await pool.end();
        }
    } catch (err) {
        return reply.code(500).send({ status: "error", message: err.message });
    }
});

module.exports = app;
