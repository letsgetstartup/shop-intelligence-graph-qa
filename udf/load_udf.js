
const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
require('dotenv').config();

const FALKORDB_URL = process.env.FALKORDB_URL || 'redis://localhost:6379';
const GRAPH_NAME = process.env.GRAPH_NAME || 'shop';
const UDF_PATH = path.join(__dirname, 'shopintel.udf.js');

async function main() {
    // Determine connection details from FALKORDB_URL
    // falkor://user:pass@host:port
    // redis client needs redis://...
    // We'll just replace falkor:// with redis:// if present
    const redisUrl = FALKORDB_URL.replace(/^falkor:/, 'redis:');

    console.log(`Connecting to Redis at ${redisUrl}...`);

    const client = createClient({ url: redisUrl });

    client.on('error', (err) => console.log('Redis Client Error', err));

    await client.connect();

    if (!fs.existsSync(UDF_PATH)) {
        console.error(`UDF file not found: ${UDF_PATH}`);
        process.exit(1);
    }

    const udfCode = fs.readFileSync(UDF_PATH, 'utf-8');
    console.log("Loading UDF...");

    try {
        // GRAPH.UDF LOAD <graph> <libname> <code_or_url>
        // Note: Using 'REPLACE' is usually good to overwrite
        // Command signature: GRAPH.UDF LOAD <graph> <lib_name> <impl_func_name>... ?? 
        // No, documentation says: GRAPH.UDF LOAD <graph_id> <lib_name> <file_content>
        // But some versions might need UDF (singular/plural).
        // Let's check docs or standard usage.
        // Usually: GRAPH.UDF <graph> LOAD <lib-name> <code>
        // No, older was explicit.
        // FalkorDB docs say: `GRAPH.QUERY graph "CALL ..."`
        // But to LOAD?
        // `GRAPH.UDF LOAD graph name code` is correct pattern for RedisGraph. FalkorDB is fork.
        // Let's try sending the command.

        // Wait, argument order: 'GRAPH.UDF', 'LOAD', graphName, libName, code
        // Or is it: 'GRAPH.UDF', graphName, 'LOAD', libName, code ?
        // Usually modules follow: MODULE_COMMAND KEY ARGS...
        // so `GRAPH.UDF` is the command. key is likely the graph?
        // Let's check FalkorDB docs from context if possible or assume standard.
        // Standard RedisGraph: GRAPH.RO_QUERY <key> ...
        // I'll try: `GRAPH.UDF LOAD <graph> <libname> <code>` and if that fails try putting graph first.

        // Actually, most sources say: `GRAPH.UDF` is not a command, it's `GRAPH.QUERY` that calls UDFs? 
        // No, you must register them.
        // Doc says `falkor.register` inside the UDF file.
        // But how to upload?
        // `sw.redis.call('GRAPH.UDF', 'LOAD', 'shop', 'ShopIntel', code)` seems plausible.

        await client.sendCommand(['GRAPH.UDF', 'LOAD', GRAPH_NAME, 'ShopIntel', udfCode]);
        console.log("UDF 'ShopIntel' loaded successfully.");

    } catch (err) {
        console.error("Error loading UDF:", err);
    }

    await client.quit();
}

main();
