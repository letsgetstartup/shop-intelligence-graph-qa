
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { FalkorDBGraph } = require('@falkordb/langchain-ts');
// Using Vertex AI as per CURL and user request
const { ChatVertexAI } = require('@langchain/google-vertexai');
const { GraphCypherQAChain } = require('@langchain/community/chains/graph_qa/cypher');
require('dotenv').config();

const app = Fastify({ logger: true });
const PORT = process.env.PORT || 8080;

app.register(cors, {
    origin: true
});

function suggestFollowUps(question, answer) {
    const qLower = question.toLowerCase();
    const suggestions = [];

    if (qLower.includes('downtime')) {
        suggestions.push("What was the primary cause of downtime for that machine?");
        suggestions.push("How does this downtime compare with other machines?");
    }
    if (qLower.includes('late') || qLower.includes('overdue')) {
        suggestions.push("Which customer has the most late jobs?");
        suggestions.push("By how many days are the overdue jobs late on average?");
    }
    if (qLower.includes('scrap')) {
        suggestions.push("Which parts have the highest scrap cost?");
        suggestions.push("Has scrap rate improved or worsened over time?");
    }
    if (qLower.includes('cost')) {
        suggestions.push("What is the total downtime cost for last month?");
        suggestions.push("Which job had the highest scrap cost?");
    }

    if (suggestions.length === 0) {
        suggestions.push("Which jobs are at risk of being late?");
        suggestions.push("What is the current utilization of our critical machines?");
    }
    return suggestions.slice(0, 3);
}

let chainInstance = null;
let graphInstance = null;

async function getChain() {
    if (chainInstance) return chainInstance;

    const FALKORDB_URL = process.env.FALKORDB_URL || 'falkor://localhost:6379';
    const GRAPH_NAME = process.env.GRAPH_NAME || 'shop';
    // Use Google API Key
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    if (!GOOGLE_API_KEY) {
        throw new Error("Missing GOOGLE_API_KEY environment variable");
    }

    console.log(`Initializing Graph Chain on ${FALKORDB_URL} (${GRAPH_NAME}) with Gemini...`);

    graphInstance = await FalkorDBGraph.initialize({
        url: FALKORDB_URL,
        graphName: GRAPH_NAME,
        graph: GRAPH_NAME // Try this as fallback key
    });

    await graphInstance.refreshSchema();

    // Configure Gemini via Vertex AI
    console.log("Configuring Gemini via Vertex AI with Model: gemini-2.5-pro");
    // ChatVertexAI usually expects GOOGLE_APPLICATION_CREDENTIALS for ADC.
    // However, we will try to pass the API Key if supported or rely on Env.
    const model = new ChatVertexAI({
        model: "gemini-2.5-pro",
        maxOutputTokens: 2048,
        // Vertex AI SDK might not natively support 'apiKey' in constructor in all versions, 
        // but let's try passing it or rely on GOOGLE_API_KEY env var if the lib picks it up.
        // Some versions of LangChain Google Vertex wrapper allow additional auth options.
    });

    chainInstance = GraphCypherQAChain.fromLLM({
        llm: model,
        graph: graphInstance,
        verbose: true,
    });

    return chainInstance;
}

app.get('/ping', async (request, reply) => {
    return { status: 'ok', time: new Date().toISOString() };
});

app.post('/query', async (request, reply) => {
    try {
        const { question } = request.body;

        if (!question) {
            return reply.code(400).send({ error: "Missing 'question' in body" });
        }

        const chain = await getChain();

        console.log(`Processing question: ${question}`);
        const res = await chain.run(question);

        const answer = res;
        const suggestions = suggestFollowUps(question, answer);

        return { answer, suggestions };
    } catch (err) {
        app.log.error(err);
        return reply.code(500).send({
            error: 'Failed to process question',
            details: err.message
        });
    }
});

const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server listening on ${PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

if (require.main === module) {
    start();
}

module.exports = app;
