const { onRequest } = require("firebase-functions/v2/https");
const app = require("./server");

// Fastify needs to be ready before processing requests
// We wrap it in the onRequest handler
exports.api = onRequest({ cors: true, invoker: "public", timeoutSeconds: 300, memory: "1GiB" }, async (req, res) => {
    await app.ready();
    app.server.emit('request', req, res);
});
