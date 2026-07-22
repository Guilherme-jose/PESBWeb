const { Pool } = require('pg');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { put } = require('@vercel/blob');

// Ensure required environment variables exist in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

const app = express();

// --- MIDDLEWARE CONFIGURATION ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Neon Database Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

// --- HELPER FUNCTIONS & MIDDLEWARES ---

// Helper: Handle database transactions safely
async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper: Parse latitude and longitude safely from arbitrary string formats
function parseCoordinates(locationStr) {
  if (!locationStr) return null;
  const matches = String(locationStr).match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  
  const latitude = parseFloat(matches[0]);
  const longitude = parseFloat(matches[1]);
  
  if (isNaN(latitude) || isNaN(longitude)) return null;
  return { latitude, longitude };
}

// Middleware: Authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.body?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev_fallback_secret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Middleware: Verify Admin Access
async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    if (result.rows[0]?.is_admin) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden: Admin access required' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to verify admin privileges' });
  }
}

// --- ROUTES ---

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/pictures', async (req, res, next) => {
  try {
    const query = 'SELECT latitude, longitude, path FROM images';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/posts', async (req, res, next) => {
  try {
    const query = `
      SELECT 
          p.id, p.content, p.created_at, u.full_name,
          i.path, i.latitude, i.longitude,
          COALESCE(lc.count, 0)::int AS likes,
          json_agg(
              json_build_object(
                  'id', c.id, 'content', c.content,
                  'created_at', c.created_at, 'author', cu.full_name
              )
              ORDER BY c.created_at
          ) FILTER (WHERE c.id IS NOT NULL) AS comments
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN images i ON i.id = p.image_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM post_likes GROUP BY post_id
      ) lc ON lc.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id
      LEFT JOIN users cu ON cu.id = c.user_id
      GROUP BY p.id, u.full_name, i.path, i.latitude, i.longitude, lc.count
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get('/likes/count', async (req, res, next) => {
  try {
    const postId = Number(req.query.post_id || req.query.postId || req.query.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ message: 'Invalid or missing post ID' });
    }

    const sql = 'SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1';
    const result = await pool.query(sql, [postId]);
    const count = result.rows[0]?.count || 0;

    return res.status(200).json({ postId, likes: count });
  } catch (err) {
    next(err);
  }
});

app.get('/posts/:id/liked', authenticateToken, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    const likeRes = await pool.query(
      'SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1',
      [req.user.id, postId]
    );
    return res.status(200).json({ postId, liked: likeRes.rowCount > 0 });
  } catch (err) {
    next(err);
  }
});

app.post('/posts/:id/like', authenticateToken, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    const result = await withTransaction(pool, async (client) => {
      const existRes = await client.query(
        'SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1',
        [req.user.id, postId]
      );

      let liked = false;
      if (existRes.rowCount > 0) {
        await client.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]);
      } else {
        await client.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [req.user.id, postId]);
        liked = true;
      }

      const countRes = await client.query('SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1', [postId]);
      return { liked, likes: countRes.rows[0]?.count || 0 };
    });

    return res.status(200).json({ postId, ...result });
  } catch (err) {
    next(err);
  }
});

app.post('/posts/:id/comment', authenticateToken, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const { content } = req.body || {};

    if (!content || !Number.isFinite(postId)) {
      return res.status(400).json({ message: 'Invalid input data' });
    }

    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    await pool.query(
      'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3)',
      [req.user.id, postId, content.trim()]
    );
    return res.status(201).json({ message: 'Comment posted successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/upload', upload.single('picture'), authenticateToken, async (req, res, next) => {
  try {
    const file = req.file;
    const { location, description, tags } = req.body || {};

    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const coords = parseCoordinates(location);
    if (!coords) {
      return res.status(400).json({ message: 'Invalid location format. Expected numeric latitude and longitude.' });
    }

    // Direct blob upload to Vercel
    const uniqueFilename = `uploads/${Date.now()}-${file.originalname}`;
    const blob = await put(uniqueFilename, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });

    await withTransaction(pool, async (client) => {
      const imageResult = await client.query(
        `INSERT INTO images (filename, mimetype, path, size, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [file.originalname, file.mimetype, blob.url, file.size, coords.latitude, coords.longitude]
      );
      const imageId = imageResult.rows[0].id;

      const postResult = await client.query(
        `INSERT INTO posts (user_id, image_id, content, created_at)
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [req.user.id, imageId, description ? String(description).trim() : null]
      );
      const postId = postResult.rows[0].id;

      if (tags && String(tags).trim().length > 0) {
        const tagNames = Array.from(new Set(String(tags).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)));
        for (const tagName of tagNames) {
          const tagRes = await client.query(
            `INSERT INTO tags (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [tagName]
          );
          await client.query(
            'INSERT INTO posts_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [postId, tagRes.rows[0].id]
          );
        }
      }
    });

    return res.redirect('/map.html');
  } catch (error) {
    next(error);
  }
});

app.get('/posts/:id/tags', async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    const sql = `
      SELECT t.id, t.name FROM tags t
      JOIN posts_tags pt ON pt.tag_id = t.id
      WHERE pt.post_id = $1 ORDER BY t.name
    `;
    const result = await pool.query(sql, [postId]);
    return res.status(200).json({ postId, tags: result.rows });
  } catch (err) {
    next(err);
  }
});

app.get('/tags/:tag/posts', async (req, res, next) => {
  try {
    const tagName = String(req.params.tag).trim().toLowerCase();
    const sql = `
      SELECT p.id, p.content, p.created_at, u.full_name, i.path, i.latitude, i.longitude,
        COALESCE(lc.count, 0)::int AS likes,
        json_agg(json_build_object('id', c.id, 'content', c.content, 'created_at', c.created_at, 'author', cu.full_name) ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL) AS comments,
        (SELECT COALESCE(json_agg(json_build_object('id', t2.id, 'name', t2.name) ORDER BY t2.name), '[]'::json) FROM tags t2 JOIN posts_tags pt2 ON pt2.tag_id = t2.id WHERE pt2.post_id = p.id) AS tags
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN images i ON i.id = p.image_id
      LEFT JOIN (SELECT post_id, COUNT(*) AS count FROM post_likes GROUP BY post_id) lc ON lc.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id
      LEFT JOIN users cu ON cu.id = c.user_id
      WHERE EXISTS (SELECT 1 FROM tags t0 JOIN posts_tags pt0 ON pt0.tag_id = t0.id WHERE pt0.post_id = p.id AND LOWER(t0.name) = $1)
      GROUP BY p.id, u.full_name, i.path, i.latitude, i.longitude, lc.count ORDER BY p.created_at DESC
    `;
    const result = await pool.query(sql, [tagName]);
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Secured administrative endpoint
app.post('/clearimagesdb', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM images');
    res.json({ message: 'All records deleted from images table' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/register', async (req, res, next) => {
  try {
    const { fullName, email, password, phone } = req.body || {};
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const exists = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailNorm]);
    if (exists.rowCount > 0) return res.status(400).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const insertQuery = `INSERT INTO users (full_name, email, password_hash, phone, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id`;
    const result = await pool.query(insertQuery, [String(fullName).trim(), emailNorm, passwordHash, phone ? String(phone).trim() : null]);

    return res.status(201).json({ message: 'Account created successfully', userId: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const emailNorm = String(email).trim().toLowerCase();
    const result = await pool.query('SELECT id, full_name, email, password_hash FROM users WHERE email = $1 LIMIT 1', [emailNorm]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordMatches) return res.status(401).json({ message: 'Invalid credentials' });

    delete user.password_hash;
    user.token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET || 'dev_fallback_secret', { expiresIn: '7d' });

    return res.status(200).json({ message: 'Login successful', user });
  } catch (err) {
    next(err);
  }
});

app.get('/api/status', authenticateToken, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, full_name, email FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    if (result.rowCount === 0) return res.status(401).json({ authenticated: false });

    return res.status(200).json({ authenticated: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/grant', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { targetEmail } = req.body || {};
    if (!targetEmail) return res.status(400).json({ message: 'Missing target email' });

    const target = String(targetEmail).trim().toLowerCase();
    const updateRes = await pool.query('UPDATE users SET is_admin = TRUE WHERE email = $1 RETURNING id, email, is_admin', [target]);
    if (updateRes.rowCount === 0) return res.status(404).json({ message: 'Target user not found' });

    return res.status(200).json({ message: 'Admin granted', user: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// --- CONDITIONAL LOCAL RUNNER ---
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Local runner active on port ${port}`));
}

module.exports = app;