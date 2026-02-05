const pg = require('pg');
const fs = require('fs');
require('dotenv').config();

const postgresUrl = process.env.POSTGRES_URL || 'postgresql://shop_user:shop_pass@10.128.0.2:5432/shop';
const sql = fs.readFileSync('../create_core_views.sql', 'utf8');

async function run() {
    const client = new pg.Client({ connectionString: postgresUrl });
    try {
        console.log("Connecting to Postgres at:", postgresUrl.replace(/:([^@:]+)@/, ':****@'));
        await client.connect();
        console.log("Connected. Running schema alignment SQL...");
        await client.query(sql);
        console.log("Schema alignment COMPLETE.");

        const res = await client.query("SELECT schemaname, viewname FROM pg_views WHERE schemaname = 'core'");
        console.log("Verified views in 'core':", res.rows.map(r => r.viewname).join(', '));
    } catch (err) {
        console.error("ERROR running schema alignment:", err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
