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
        console.log(`Permissions granted to user "${USERNAME}".`);
    } finally {
        await client.end();
    }
}

async function ensureUsersTable() {
    const client = new Client({ ...baseConfig, database: DB_NAME });
    await client.connect();
    try {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                phone TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        `;
        await client.query(createTableSQL);

        // Ensure a case-insensitive unique constraint on email
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))');

        // Grant basic CRUD permissions on users to the application role
        const grantSQL = `
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO ${USERNAME};
            GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO ${USERNAME};
        `;
        await client.query(grantSQL);

        console.log('Table "users" ensured and permissions granted to user:', USERNAME);
    } finally {
        await client.end();
    }
}

async function ensurePostsTable() {
    const client = new Client({ ...baseConfig, database: DB_NAME });
    await client.connect();
    try {
        const createPostsSQL = `
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
                content TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        `;
        await client.query(createPostsSQL);
        console.log('Table "posts" ensured.');

        const createLikesSQL = `
            CREATE TABLE IF NOT EXISTS post_likes (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (user_id, post_id)
            )
        `;
        await client.query(createLikesSQL);
        console.log('Table "post_likes" ensured.');

        const createCommentsSQL = `
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        `;
        await client.query(createCommentsSQL);
        console.log('Table "comments" ensured.');

        const grantSQL = `
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE posts TO ${USERNAME};
            GRANT USAGE, SELECT ON SEQUENCE posts_id_seq TO ${USERNAME};

            GRANT SELECT, INSERT, DELETE ON TABLE post_likes TO ${USERNAME};

            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comments TO ${USERNAME};
            GRANT USAGE, SELECT ON SEQUENCE comments_id_seq TO ${USERNAME};
        `;
        await client.query(grantSQL);
        console.log(`Permissions granted to user "${USERNAME}" on posts, post_likes and comments.`);
    } finally {
        await client.end();
    }
}


(async () => {
    try {
        await ensureDatabaseExists();
        await ensureImagesTable();
        await ensureUsersTable();
        await ensurePostsTable();
        await grantPermissions();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
        process.exitCode = 1;
    }
})();