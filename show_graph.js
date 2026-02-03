import { FalkorDB } from 'falkordb';
import dotenv from 'dotenv';
dotenv.config();

async function showGraph() {
    try {
        const urlStr = process.env.FALKOR_URL || process.env.FALKORDB_URL;
        if (!urlStr) throw new Error("FALKOR_URL not found in env");

        const url = new URL(urlStr);
        console.log(`Connecting to: ${url.protocol}//${url.username}:****@${url.hostname}:${url.port}`);

        const config = {
            username: url.username || 'default',
            password: url.password,
            socket: {
                host: url.hostname,
                port: parseInt(url.port) || 6379,
                tls: url.protocol === 'falkors:' ? {} : undefined,
                rejectUnauthorized: false
            }
        };

        const client = await FalkorDB.connect(config);
        const graph = client.selectGraph('shop');

        console.log("\n--- Graph Node Counts ---");
        const nodeRes = await graph.query("MATCH (n) RETURN labels(n)[0] AS Label, count(n) AS Count ORDER BY Count DESC");
        // Format explicit table
        if (nodeRes.data && nodeRes.data.length > 0) {
            console.table(nodeRes.data.map(r => ({ Label: r.Label, Count: Number(r.Count) })));
        } else {
            console.log("No nodes found.");
        }

        console.log("\n--- Graph Edge Counts ---");
        const edgeRes = await graph.query("MATCH ()-[r]->() RETURN type(r) AS Type, count(r) AS Count ORDER BY Count DESC");
        if (edgeRes.data && edgeRes.data.length > 0) {
            console.table(edgeRes.data.map(r => ({ Type: r.Type, Count: Number(r.Count) })));
        } else {
            console.log("No edges found.");
        }

        client.close();
    } catch (err) {
        console.error("Connection Error Information:");
        console.error(err);
    }
}

showGraph();
