const { Pool } = require('pg');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { put } = require('@vercel/blob'); // Added Vercel Blob SDK

// Configured Multer to use memory storage instead of the local filesystem
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }); 

const app = express();

// Middleware configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// REMOVED: Local ephemeral static route fallback, as assets are now served directly from Vercel's CDN URL.

// Initialize Neon Database Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true, // Neon requires SSL connections
  },
});

// Root Route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// --- API ROUTES ---

app.get('/pictures', async (req, res) => {
  try {
    const query = 'SELECT latitude, longitude, path FROM images';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch pictures from database:', error);
    res.status(500).send('Failed to fetch pictures');
  }
});

app.get('/posts', async (req, res) => {
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
    console.error('Failed to fetch uploads from database:', error);
    res.status(500).send('Failed to fetch uploads');
  }
});

app.get('/likes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM post_likes');
    res.json(result.rows);
  } catch (error) {
    res.status(500).send('Failed to fetch likes');
  }
});

app.get('/likes/count', async (req, res) => {
  try {
    const postIdRaw = req.query.post_id || req.query.postId || req.query.id;
    if (!postIdRaw) return res.status(400).json({ message: 'Missing post id' });

    const postId = Number(postIdRaw);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

    const sql = 'SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1';
    const result = await pool.query(sql, [postId]);
    const count = (result.rows[0] && result.rows[0].count) || 0;

    return res.status(200).json({ postId, likes: count });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch like count' });
  }
});

app.get('/posts/:id/liked', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = authHeader.slice(7);

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    const userId = payload?.id;
    if (!userId) return res.status(401).json({ message: 'Invalid token payload' });

    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    const likeRes = await pool.query('SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1', [userId, postId]);
    return res.status(200).json({ postId, liked: likeRes.rowCount > 0 });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to check liked status' });
  }
});

app.post('/posts/:id/like', async (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    const userId = payload?.id;

    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const existRes = await dbClient.query('SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1', [userId, postId]);

      let liked;
      if (existRes.rowCount > 0) {
        await dbClient.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        liked = false;
      } else {
        await dbClient.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
        liked = true;
      }

      const countRes = await dbClient.query('SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1', [postId]);
      const likes = countRes.rows[0]?.count || 0;

      await dbClient.query('COMMIT');
      return res.status(200).json({ postId, liked, likes });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error processing like toggle' });
  }
});

app.post('/posts/:id/comment', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const comment = req.body.content;
    if (!comment || !Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid input data' });

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
    const token = authHeader.slice(7);

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    
    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
    if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

    await pool.query('INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3)', [payload.id, postId, comment]);
    return res.status(200).json({ message: 'Posted comment successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Refactored upload route to stream directly to Vercel Blob
app.post('/upload', upload.single('picture'), async (req, res) => {
  const file = req.file;
  const { location, description } = req.body || {};

  if (!file) return res.status(400).send('No file uploaded');
  if (!location || !location.includes(',')) return res.status(400).send('Invalid location format.');

  const [latPart, longPart] = location.split(',');
  const latitude = parseFloat(latPart.split(':')[1].trim());
  const longitude = parseFloat(longPart.split(':')[1].trim());

  let token = null;
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.body?.token) {
    token = req.body.token;
  }

  if (!token) return res.status(401).send('Missing authentication token');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    const userId = payload?.id;

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (userCheck.rowCount === 0) return res.status(401).send('User not found');

    // Generate a unique file name to avoid collisions in storage
    const uniqueFilename = `uploads/${Date.now()}-${file.originalname}`;

    // Upload the file buffer directly to Vercel Blob
    const blob = await put(uniqueFilename, file.buffer, {
      access: 'public', // Allows the image to be readable via its public CDN URL
      contentType: file.mimetype
    });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // The 'path' column now stores the persistent absolute URL (blob.url) instead of a local path string
      const imageResult = await dbClient.query(
        `INSERT INTO images (filename, mimetype, path, size, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [file.originalname, file.mimetype, blob.url, file.size, latitude, longitude]
      );
      const imageId = imageResult.rows[0].id;

      const postResult = await dbClient.query(
        `INSERT INTO posts (user_id, image_id, content, created_at)
         VALUES ($1, $2, $3, NOW()) RETURNING id`,
        [userId, imageId, description ? String(description).trim() : null]
      );
      const postId = postResult.rows[0].id;

      const tagsRaw = req.body?.tags || '';
      if (tagsRaw && String(tagsRaw).trim().length > 0) {
        const tagNames = Array.from(new Set(String(tagsRaw).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)));
        for (const tagName of tagNames) {
          const tagRes = await dbClient.query(
            `INSERT INTO tags (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [tagName]
          );
          await dbClient.query('INSERT INTO posts_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, tagRes.rows[0].id]);
        }
      }

      await dbClient.query('COMMIT');
      return res.redirect('/map.html');
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Failed to save upload');
  }
});

app.get('/posts/:id/tags', async (req, res) => {
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
    return res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

app.get('/tags/:tag/posts', async (req, res) => {
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
    return res.status(500).json({ message: 'Failed to fetch posts by tag' });
  }
});

app.post('/clearimagesdb', async (req, res) => {
  try {
    await pool.query('DELETE FROM images');
    res.send('All records deleted from images table');
  } catch (error) {
    res.status(500).send('Failed to clear images table');
  }
});

app.post('/api/register', async (req, res) => {
  const { fullName, email, password, phone } = req.body || {};
  const emailNorm = String(email).trim().toLowerCase();

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailNorm]);
    if (exists.rowCount > 0) return res.status(400).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const insertQuery = `INSERT INTO users (full_name, email, password_hash, phone, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id`;
    const result = await pool.query(insertQuery, [String(fullName).trim(), emailNorm, passwordHash, phone ? String(phone).trim() : null]);

    return res.status(201).json({ message: 'Account created successfully', userId: result.rows[0].id });
  } catch (err) {
    return res.status(500).json({ message: 'Registration failed.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email).trim().toLowerCase();

  try {
    const result = await pool.query('SELECT id, full_name, email, password_hash FROM users WHERE email = $1 LIMIT 1', [emailNorm]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordMatches) return res.status(401).json({ message: 'Invalid credentials' });

    delete user.password_hash;
    user.token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'change_this_to_a_secure_secret', { expiresIn: '7d' });

    return res.status(200).json({ message: 'Login successful', user });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed.' });
  }
});

app.get('/api/status', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ authenticated: false });

  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    const result = await pool.query('SELECT id, full_name, email FROM users WHERE id = $1 LIMIT 1', [payload.id]);
    if (result.rowCount === 0) return res.status(401).json({ authenticated: false });

    return res.status(200).json({ authenticated: true, user: result.rows[0] });
  } catch (err) {
    return res.status(401).json({ authenticated: false });
  }
});

app.post('/api/admin/grant', async (req, res) => {
  const { username, email, password, targetEmail } = req.body || {};
  const targetEmailRaw = username || targetEmail || email || req.query.username || req.query.email;
  const providedPassword = password || req.body?.password;

  if (!targetEmailRaw || !providedPassword) return res.status(400).json({ message: 'Missing target email or password' });

  if (String(providedPassword) !== (process.env.ADMIN_GRANT_PASSWORD || '123456')) {
    return res.status(401).json({ message: 'Invalid password' });
  }

  try {
    const target = String(targetEmailRaw).trim().toLowerCase();
    const updateRes = await pool.query('UPDATE users SET is_admin = TRUE WHERE email = $1 RETURNING id, email, is_admin', [target]);
    if (updateRes.rowCount === 0) return res.status(404).json({ message: 'Target user not found' });

    return res.status(200).json({ message: 'Admin granted', user: updateRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to grant admin status' });
  }
});

// --- CONDITIONAL LOCAL RUNNER ---
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Local runner active on port ${port}`));
}

module.exports = app;