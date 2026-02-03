import { FalkorDB } from 'falkordb';
import dotenv from 'dotenv';
dotenv.config();

async function showStructure() {
    try {
        const urlStr = process.env.FALKOR_URL || process.env.FALKORDB_URL;
        const url = new URL(urlStr);
        const client = await FalkorDB.connect({
            username: url.username || 'default',
            password: url.password,
            socket: {
                host: url.hostname,
                port: parseInt(url.port) || 6379,
                tls: url.protocol === 'falkors:' ? {} : undefined,
                rejectUnauthorized: false
            }
        });

        const graph = client.selectGraph('shop');
        const res = await graph.query("MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 1");

        console.log(JSON.stringify(res.data[0], null, 2));
        client.close();
    } catch (err) { console.error(err); }
}
showStructure();
