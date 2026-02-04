const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const app = require("./server");

// Define secrets for best practice (can also be provided via .env)
const POSTGRES_URL = defineSecret("POSTGRES_URL");
const FALKORDB_URL = defineSecret("FALKORDB_URL");

console.log("Initializing Cloud Function Wrapper...");

exports.api = onRequest({
    cors: true,
    invoker: "public",
    timeoutSeconds: 300,
    memory: "1GiB",
    vpcConnector: "shop-intel-connector",
    vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
    secrets: [POSTGRES_URL, FALKORDB_URL]
}, async (req, res) => {
    try {
        console.error(`[WRAPPER] Processing ${req.method} ${req.url}`);

        await app.ready();

        const headers = { ...req.headers };
        delete headers['content-length'];
        delete headers['transfer-encoding'];

        // Use inject to handle the request. This avoids issues with consumed body streams.
        const response = await app.inject({
            method: req.method,
            url: req.url,
            query: req.query,
            headers: headers,
            payload: req.body
        });

        // Send back the response
        res.status(response.statusCode);

        // Copy headers, excluding some that might cause issues
        Object.entries(response.headers).forEach(([key, value]) => {
            if (key !== 'transfer-encoding' && key !== 'content-length') {
                res.set(key, value);
            }
        });

        res.send(response.payload);
        console.error(`[WRAPPER] Completed ${req.method} ${req.url} with status ${response.statusCode}`);
    } catch (err) {
        console.error(`[WRAPPER] ERROR:`, err);
        res.status(500).send({ error: "Internal Server Error", details: err.message });
    }
});
