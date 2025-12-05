const { Client } = require('pg');

// destroy_db.js
// Usage: set PGHOST/PGUSER/PGPASSWORD/PGPORT as needed, then: node destroy_db.js


const DB_NAME = 'pesb';

const baseConfig = {
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
};

async function dropDatabase() {
    // connect to the default maintenance DB
    const client = new Client({ ...baseConfig, database: 'postgres' });
    await client.connect();
    try {
        const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
        if (exists.rowCount === 0) {
            console.log(`Database "${DB_NAME}" does not exist.`);
            return;
        }

        console.log(`Terminating connections to "${DB_NAME}"...`);
        await client.query(
            `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
             WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [DB_NAME]
        );

        console.log(`Dropping database "${DB_NAME}"...`);
        // DB name is interpolated; ensure DB_NAME is trusted in your environment
        await client.query(`DROP DATABASE "${DB_NAME}"`);
        console.log('Database dropped.');
    } finally {
        await client.end();
    }
}

(async () => {
    try {
        await dropDatabase();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
        process.exitCode = 1;
    }
})();