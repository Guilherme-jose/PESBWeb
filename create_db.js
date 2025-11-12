const { Client } = require('pg');

// create_db.js
// Usage: set PGHOST/PGUSER/PGPASSWORD/PGPORT as needed, then: node create_db.js

const DB_NAME = 'pesb';
const USERNAME = 'guilherme';

const baseConfig = {
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    // database will be supplied per-connection
};

async function ensureDatabaseExists() {
    const client = new Client({ ...baseConfig, database: 'postgres' });
    await client.connect();
    try {
        const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
        if (res.rowCount === 0) {
            console.log(`Creating database "${DB_NAME}"...`);
            await client.query(`CREATE DATABASE "${DB_NAME}"`);
            console.log('Database created.');
        } else {
            console.log(`Database "${DB_NAME}" already exists.`);
        }
    } finally {
        await client.end();
    }
}

async function ensureImagesTable() {
    const client = new Client({ ...baseConfig, database: DB_NAME });
    await client.connect();
    try {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS images (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                mimetype TEXT,
                path TEXT,
                size BIGINT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        `;
        await client.query(createTableSQL);
        console.log('Table "images" ensured.');
    } finally {
        await client.end();
    }
}

async function grantPermissions() {
    const client = new Client({ ...baseConfig, database: DB_NAME });
    await client.connect();
    try {
        const grantSQL = `
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE images TO ${USERNAME};
            GRANT USAGE, SELECT ON SEQUENCE images_id_seq TO ${USERNAME};
        `;
        await client.query(grantSQL);
        console.log('Permissions granted to user "guilherme".');
    } finally {
        await client.end();
    }
}

(async () => {
    try {
        await ensureDatabaseExists();
        await ensureImagesTable();
        await grantPermissions();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
        process.exitCode = 1;
    }
})();