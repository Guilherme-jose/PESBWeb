const { Client } = require('pg');

// display_db.js
// Usage: set PGHOST/PGUSER/PGPASSWORD/PGPORT as needed, then: node display_db.js


const DB_NAME = 'pesb';

const baseConfig = {
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: DB_NAME,
};

function safeIdentifier(name) {
    // minimal safety: escape double quotes by doubling them
    return `"${String(name).replace(/"/g, '""')}"`;
}

async function main() {
    const client = new Client(baseConfig);
    await client.connect();

    try {
        // Get all user tables in public schema
        const tblRes = await client.query(
            `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`
        );

        if (tblRes.rowCount === 0) {
            console.log('No tables found in public schema.');
            return;
        }

        for (const row of tblRes.rows) {
            const table = row.tablename;
            console.log(`\n===== Table: ${table} =====`);

            // Query all rows
            const q = `SELECT * FROM public.${safeIdentifier(table)}`;
            try {
                const data = await client.query(q);
                if (data.rowCount === 0) {
                    console.log('(no rows)');
                    continue;
                }

                // Convert possible Buffer values to base64 for better JSON output
                const printable = data.rows.map(r => {
                    const out = {};
                    for (const k of Object.keys(r)) {
                        const v = r[k];
                        if (Buffer.isBuffer(v)) out[k] = v.toString('base64');
                        else out[k] = v;
                    }
                    return out;
                });

                console.log(JSON.stringify(printable, null, 2));
            } catch (err) {
                console.error(`Error reading table "${table}":`, err.message);
            }
        }
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Unexpected error:', err);
    process.exitCode = 1;
});