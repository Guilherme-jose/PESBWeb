const { Client } = require('pg');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const upload = multer({ dest: 'uploads/' }); // Temporary storage directory
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const main = async () => {
  let client;
  try {
    client = new Client({
      user: 'guilherme', // Replace with an existing role
      password: 'Ash&314ka2', // Replace with the role's password
      host: 'localhost',
      port: 5432,
      database: 'pesb',
    });
    await client.connect();
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    //process.exit(1);
  }
  

  try {
    await client.query('SELECT 1');
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database connection failed:', error);
    //process.exit(1);
  }

  app.get('/pictures', async (req, res) => {
    try {
      const query = 'SELECT latitude, longitude, path FROM images';
      const result = await client.query(query);
      console.log(result.rows);
      res.json(result.rows); // Send the rows as a JSON response
    } catch (error) {
      console.error('Failed to fetch pictures from database:', error);
      res.status(500).send('Failed to fetch pictures');
    }
  });


  app.get('/posts', async (req, res) => {
    try {
      const query = `
        SELECT 
            p.id,
            p.content,
            p.created_at,
            u.full_name,
            i.path,
            i.latitude,
            i.longitude,
            COALESCE(lc.count, 0)::int AS likes,
            json_agg(
                json_build_object(
                    'id', c.id,
                    'content', c.content,
                    'created_at', c.created_at,
                    'author', cu.full_name
                )
                ORDER BY c.created_at
            ) FILTER (WHERE c.id IS NOT NULL) AS comments
        FROM posts p
        JOIN users u ON u.id = p.user_id
        JOIN images i ON i.id = p.image_id
        LEFT JOIN (
          SELECT post_id, COUNT(*) AS count
          FROM post_likes
          GROUP BY post_id
        ) lc ON lc.post_id = p.id
        LEFT JOIN comments c ON c.post_id = p.id
        LEFT JOIN users cu ON cu.id = c.user_id
        GROUP BY p.id, u.full_name, i.path, i.latitude, i.longitude, lc.count
        ORDER BY p.created_at DESC;
      `;
      const result = await client.query(query);
      res.json(result.rows); // Send the rows as a JSON response
    } catch (error) {
      console.error('Failed to fetch uploads from database:', error);
      res.status(500).send('Failed to fetch uploads');
    }
  });

  app.get('/likes', async (req, res) => {
    try {
      const query = 'SELECT * FROM post_likes';
      const result = await client.query(query);
      res.json(result.rows); // Send the rows as a JSON response
    } catch (error) {
      console.error('Failed to fetch likes from database:', error);
      res.status(500).send('Failed to fetch likes');
    }
  });

  app.get('likes/count', async (req, res) => {
    try {
      const postIdRaw = req.query.post_id || req.query.postId || req.query.id;
      if (!postIdRaw) {
        return res.status(400).json({ message: 'Missing post id (use ?post_id=...)' });
      }

      const postId = Number(postIdRaw);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ message: 'Invalid post id' });
      }

      if (!client) {
        return res.status(500).json({ message: 'Database not available' });
      }

      const sql = 'SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1';
      const result = await client.query(sql, [postId]);
      const count = (result.rows[0] && result.rows[0].count) || 0;

      return res.status(200).json({ postId, likes: count });
    } catch (err) {
      console.error('Failed to fetch like count:', err);
      return res.status(500).json({ message: 'Failed to fetch like count' });
    }
  });

  app.get('/posts/:id/liked', async (req, res) => {
    try {
      const postIdRaw = req.params && req.params.id;
      if (!postIdRaw) return res.status(400).json({ message: 'Missing post id in URL' });

      const postId = Number(postIdRaw);
      if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

      if (!client) return res.status(500).json({ message: 'Database not available' });

      const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
      }
      const token = authHeader.slice(7);

      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
      } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      const userId = payload && payload.id;
      if (!userId) return res.status(401).json({ message: 'Invalid token payload' });

      const postCheck = await client.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
      if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

      const likeRes = await client.query(
        'SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1',
        [userId, postId]
      );
      const liked = likeRes.rowCount > 0;

      return res.status(200).json({ postId, liked });
    } catch (err) {
      console.error('Failed to check liked status:', err);
      return res.status(500).json({ message: 'Failed to check liked status' });
    }
  });

  app.post('/posts/:id/like', async (req, res) => {
    try {
      const postIdRaw = req.params && req.params.id;
      if (!postIdRaw) return res.status(400).json({ message: 'Missing post id in URL' });

      const postId = Number(postIdRaw);
      if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

      if (!client) return res.status(500).json({ message: 'Database not available' });

      // Extract token from Authorization header (Bearer ...)
      const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
      }
      const token = authHeader.slice(7);
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
      } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      const userId = payload && payload.id;
      if (!userId) return res.status(401).json({ message: 'Invalid token payload' });

      // Ensure post exists
      const postCheck = await client.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
      if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

      try {
        await client.query('BEGIN');

        const existRes = await client.query(
          'SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1',
          [userId, postId]
        );

        let liked;
        if (existRes.rowCount > 0) {
          // already liked -> remove like (toggle off)
          await client.query('DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
          liked = false;
        } else {
          // not liked -> insert like
          await client.query('INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
          liked = true;
        }

        const countRes = await client.query('SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1', [postId]);
        const likes = (countRes.rows[0] && countRes.rows[0].count) || 0;

        await client.query('COMMIT');
        return res.status(200).json({ postId, liked, likes });
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        console.error('Failed to toggle like:', err);
        return res.status(500).json({ message: 'Failed to toggle like' });
      }
    } catch (err) {
      console.error('Unexpected error in like handler:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
 
  });

  app.post('/posts/:id/comment', async (req, res) => {
    try {
      const postIdRaw = req.params && req.params.id;
      if (!postIdRaw) return res.status(400).json({ message: 'Missing post id in URL' });
      const comment = req.body.content;
      if (!comment) return res.status(400).json({ message: 'Missing comment content' });

      const postId = Number(postIdRaw);
      if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

      if (!client) return res.status(500).json({ message: 'Database not available' });

      // Extract token from Authorization header (Bearer ...)
      const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid Authorization header' });
      }
      const token = authHeader.slice(7);
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
      } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      const userId = payload && payload.id;
      if (!userId) return res.status(401).json({ message: 'Invalid token payload' });

      // Ensure post exists
      const postCheck = await client.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
      if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

      await client.query('INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3)', [userId, postId, comment]);
      return res.status(200).json({ message: 'Posted comment successfully' });
    } catch (err) {
      console.error('Unexpected error in like handler:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/upload', upload.single('picture'), async (req, res) => {
    const file = req.file;
    const { location, description } = req.body || {};

    if (!file) {
      console.error('No file uploaded');
      return res.status(400).send('No file uploaded');
    }

    if (!location || !location.includes(',')) {
      console.error('Invalid location format');
      return res.status(400).send('Invalid location format. Expected "latitude,longitude".');
    }

    const [latPart, longPart] = location.split(',');
    const latitude = parseFloat(latPart.split(':')[1].trim());
    const longitude = parseFloat(longPart.split(':')[1].trim());

    if (!client) {
      console.error('Database client not available');
      return res.status(500).send('Database not available');
    }

    // Require authentication to associate the upload with a user
    // Accept token from Authorization header, x-access-token header, or a form field (multipart/form-data)
    let token = null;
    if (req.headers && req.headers.cookie) {
      console.log('Cookie header:', req.headers.cookie);
      try {
        const parsed = Object.fromEntries(
          req.headers.cookie.split(';').map(cookie => {
            const idx = cookie.indexOf('=');
            const name = decodeURIComponent(cookie.slice(0, idx).trim());
            const val = decodeURIComponent(cookie.slice(idx + 1).trim());
            return [name, val];
          })
        );
        console.log('Parsed cookies:', parsed);
      } catch (e) {
        console.warn('Failed to parse cookies header:', e);
      }
    } else {
      console.log('No Cookie header present');
    }

    if (req.cookies) {
      console.log('req.cookies object:', req.cookies);
    }
    const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.headers && req.headers['x-access-token']) {
      token = req.headers['x-access-token'];
    } else if (req.body && (req.body.token || req.body.authToken || req.body._token)) {
      // multer parses form fields into req.body for multipart/form-data
      token = req.body.token || req.body.authToken || req.body._token;
    } else if (req.cookies && (req.cookies.authToken || (req.headers && req.headers.authorization && req.headers.authorization.split(' ')[1]))) {
      token = (req.cookies && req.cookies.authToken) || (req.headers && req.headers.authorization && req.headers.authorization.split(' ')[1]);
    }

    if (!token) {
      return res.status(401).send('Missing authentication token');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_to_a_secure_secret');
    } catch (err) {
      console.error('Invalid token:', err);
      return res.status(401).send('Invalid or expired token');
    }

    const userId = payload && payload.id;
    if (!userId) {
      return res.status(401).send('Invalid token payload');
    }

    // Verify that the user referenced by the token actually exists to avoid FK violations
    try {
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
      if (userCheck.rowCount === 0) {
        console.warn('Upload attempted by non-existent user id:', userId);
        return res.status(401).send('User not found');
      }
    } catch (err) {
      console.error('Failed to verify user existence:', err);
      return res.status(500).send('Failed to verify user');
    }

    try {
      await client.query('BEGIN');

      const insertImageSQL = `
      INSERT INTO images (filename, mimetype, path, size, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `;
      const imageResult = await client.query(insertImageSQL, [
        file.originalname,
        file.mimetype,
        file.path,
        file.size,
        latitude,
        longitude,
      ]);
      const imageId = imageResult.rows[0].id;

      const insertUploadSQL = `
      INSERT INTO posts (user_id, image_id, content, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id
      `;
      const postResult = await client.query(insertUploadSQL, [userId, imageId, description ? String(description).trim() : null]);
      const postId = postResult.rows[0].id;

      // Handle tags (expects a comma-separated string in req.body.tags)
      const tagsRaw = (req.body && (req.body.tags || req.body.tags_hidden || req.body.tagsHidden || req.body['tags'])) || '';
      if (tagsRaw && String(tagsRaw).trim().length > 0) {
        // Normalize, lowercase, split by comma, remove empties and duplicates
        const tagNames = Array.from(
          new Set(
            String(tagsRaw)
              .split(',')
              .map(t => String(t).trim().toLowerCase())
              .filter(Boolean)
          )
        );

        for (const tagName of tagNames) {
          // Insert tag if missing and get id (ON CONFLICT returns the existing/updated row)
          const tagInsertSQL = `
            INSERT INTO tags (name)
            VALUES ($1)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
          `;
          const tagRes = await client.query(tagInsertSQL, [tagName]);
          const tagId = tagRes.rows[0].id;

          // Link post and tag (ignore if already linked)
          await client.query(
            'INSERT INTO posts_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [postId, tagId]
          );
        }
      }

      await client.query('COMMIT');

      console.log('File uploaded:', file.originalname, 'imageId:', imageId, 'postId:', postId, 'userId:', userId);

      // Redirect to map page after successful upload
      if (!res.headersSent && !res.finished) {
        return res.redirect('/map.html');
      } else {
        console.warn('Cannot redirect: response already sent');
        return res.status(200).send('Upload successful');
      }
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (e) { /* ignore rollback errors */ }
      console.error('Failed to save image/upload to database:', error);
      return res.status(500).send('Failed to save upload');
    }

  });

  app.get('/posts/:id/tags', async (req, res) => {
    try {
      const postIdRaw = req.params && req.params.id;
      if (!postIdRaw) return res.status(400).json({ message: 'Missing post id in URL' });

      const postId = Number(postIdRaw);
      if (!Number.isFinite(postId) || postId <= 0) return res.status(400).json({ message: 'Invalid post id' });

      if (!client) return res.status(500).json({ message: 'Database not available' });

      const postCheck = await client.query('SELECT id FROM posts WHERE id = $1 LIMIT 1', [postId]);
      if (postCheck.rowCount === 0) return res.status(404).json({ message: 'Post not found' });

      const sql = `
        SELECT t.id, t.name
        FROM tags t
        JOIN posts_tags pt ON pt.tag_id = t.id
        WHERE pt.post_id = $1
        ORDER BY t.name
      `;
      const result = await client.query(sql, [postId]);

      const tags = (result.rows || []).map(r => ({ id: r.id, name: r.name }));
      return res.status(200).json({ postId, tags });
    } catch (err) {
      console.error('Failed to fetch tags for post:', err);
      return res.status(500).json({ message: 'Failed to fetch tags' });
    }
  });

  app.get('/tags/:tag/posts', async (req, res) => {
    try {
      const tagRaw = req.params && req.params.tag || req.query.tag || req.query.name;
      if (!tagRaw) return res.status(400).json({ message: 'Missing tag (use /tags/:tag/posts or ?tag=...)' });

      const tagName = String(tagRaw).trim().toLowerCase();
      if (tagName.length === 0) return res.status(400).json({ message: 'Invalid tag' });

      if (!client) return res.status(500).json({ message: 'Database not available' });

      const sql = `
        SELECT
          p.id,
          p.content,
          p.created_at,
          u.full_name,
          i.path,
          i.latitude,
          i.longitude,
          COALESCE(lc.count, 0)::int AS likes,
          -- comments aggregated
          json_agg(
            json_build_object(
              'id', c.id,
              'content', c.content,
              'created_at', c.created_at,
              'author', cu.full_name
            )
            ORDER BY c.created_at
          ) FILTER (WHERE c.id IS NOT NULL) AS comments,
          -- tags for each post
          (SELECT COALESCE(json_agg(json_build_object('id', t2.id, 'name', t2.name) ORDER BY t2.name), '[]'::json)
           FROM tags t2
           JOIN posts_tags pt2 ON pt2.tag_id = t2.id
           WHERE pt2.post_id = p.id
          ) AS tags
        FROM posts p
        JOIN users u ON u.id = p.user_id
        JOIN images i ON i.id = p.image_id
        LEFT JOIN (
          SELECT post_id, COUNT(*) AS count
          FROM post_likes
          GROUP BY post_id
        ) lc ON lc.post_id = p.id
        LEFT JOIN comments c ON c.post_id = p.id
        LEFT JOIN users cu ON cu.id = c.user_id
        WHERE EXISTS (
          SELECT 1 FROM tags t0
          JOIN posts_tags pt0 ON pt0.tag_id = t0.id
          WHERE pt0.post_id = p.id AND LOWER(t0.name) = $1
        )
        GROUP BY p.id, u.full_name, i.path, i.latitude, i.longitude, lc.count
        ORDER BY p.created_at DESC
      `;
      const result = await client.query(sql, [tagName]);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error('Failed to fetch posts by tag:', err);
      return res.status(500).json({ message: 'Failed to fetch posts by tag' });
    }
  });
  
  app.post('/clearimagesdb', async (req, res) => {
    try {
      const deleteQuery = 'DELETE FROM images';
      await client.query(deleteQuery);
      console.log('All records deleted from images table');
      res.send('All records deleted from images table');
    } catch (error) {
      console.error('Failed to clear images table:', error);
      res.status(500).send('Failed to clear images table');
    }
  });

  app.post('/api/register', async (req, res) => {
    const { fullName, email, password, phone } = req.body || {};
    const errors = {};

    // Basic validation
    if (!fullName || String(fullName).trim().length < 2) {
      errors.fullName = 'Please enter your full name.';
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password || String(password).length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(String(phone))) {
      errors.phone = 'Invalid phone format.';
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    if (!client) {
      return res.status(500).json({ message: 'Database not available' });
    }

    const emailNorm = String(email).trim().toLowerCase();

    try {
      // Check for existing account
      const exists = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailNorm]);
      if (exists.rowCount > 0) {
        return res.status(400).json({ message: 'Email already registered', errors: { email: 'Email is already in use.' } });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(String(password), 10);

      // Insert user (adjust column names if your schema differs)
      const insertQuery = `
        INSERT INTO users (full_name, email, password_hash, phone, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
      `;
      const values = [String(fullName).trim(), emailNorm, passwordHash, phone ? String(phone).trim() : null];

      const result = await client.query(insertQuery, values);

      return res.status(201).json({ message: 'Account created successfully', userId: result.rows[0].id });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ message: 'Registration failed. Try again later.' });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    if (!client) {
      return res.status(500).json({ message: 'Database not available' });
    }

    const emailNorm = String(email).trim().toLowerCase();

    try {
      const query = 'SELECT id, full_name, email, password_hash, phone, created_at FROM users WHERE email = $1 LIMIT 1';
      const result = await client.query(query, [emailNorm]);

      if (result.rowCount === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const passwordMatches = await bcrypt.compare(String(password), user.password_hash);

      if (!passwordMatches) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Remove sensitive data before sending
      delete user.password_hash;

      const jwtSecret = process.env.JWT_SECRET || 'change_this_to_a_secure_secret';
      const token = jwt.sign(
        { id: user.id, email: user.email, fullName: user.full_name },
        jwtSecret,
        { expiresIn: '7d' }
      );
      user.token = token;
      

      return res.status(200).json({ message: 'Login successful', user });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Login failed. Try again later.' });
    }
  });

  app.get('/api/status', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ authenticated: false, message: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const jwtSecret = process.env.JWT_SECRET || 'change_this_to_a_secure_secret';

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ authenticated: false, message: 'Invalid or expired token' });
    }

    if (!client) {
      return res.status(500).json({ authenticated: false, message: 'Database not available' });
    }

    try {
      const query = 'SELECT id, full_name, email, phone, created_at FROM users WHERE id = $1 LIMIT 1';
      const result = await client.query(query, [payload.id]);

      if (result.rowCount === 0) {
        return res.status(401).json({ authenticated: false, message: 'User not found' });
      }

      const user = result.rows[0];
      return res.status(200).json({ authenticated: true, user });
    } catch (err) {
      console.error('Status check error:', err);
      return res.status(500).json({ authenticated: false, message: 'Failed to verify user' });
    }
  });


};

app.post('/api/admin/grant', async (req, res) => {
  try {
    // Helper to parse JSON body if express.json() hasn't been applied yet
    const parseJsonBody = (req) =>
      new Promise((resolve) => {
        try {
          if (req.body && Object.keys(req.body).length > 0) return resolve(req.body);
        } catch (e) { /* ignore */ }

        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
          if (!data) return resolve({});
          try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
        });
      });

    const body = await parseJsonBody(req);

    // Accept target username/email from several possible fields (matches grant.html)
    const targetEmailRaw = body.username || body.targetEmail || body.email || req.query.username || req.query.email;
    const password = body.password || req.body && req.body.password;

    if (!targetEmailRaw) {
      return res.status(400).json({ message: 'target username/email is required (use "username" or "email")' });
    }
    if (!password) {
      return res.status(400).json({ message: 'password is required' });
    }

    // Simple shared password check (consider moving to env var and stronger auth)
    const ADMIN_GRANT_PASSWORD = process.env.ADMIN_GRANT_PASSWORD || '123456';
    if (String(password) !== ADMIN_GRANT_PASSWORD) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Ensure we have a DB client for this handler (create local client so this route works even if main's client is out-of-scope)
    const tempClient = new Client({
      user: process.env.PG_USER || 'guilherme',
      password: process.env.PG_PASSWORD || '31415962',
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
      database: process.env.PG_DATABASE || 'pesb',
    });

    await tempClient.connect();

    try {
      const targetEmail = String(targetEmailRaw).trim().toLowerCase();
      const updateRes = await tempClient.query(
        'UPDATE users SET is_admin = TRUE WHERE email = $1 RETURNING id, full_name, email, is_admin',
        [targetEmail]
      );

      if (updateRes.rowCount === 0) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      return res.status(200).json({ message: 'Admin granted', user: updateRes.rows[0] });
    } finally {
      try { await tempClient.end(); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.error('Failed to grant admin status:', err);
    return res.status(500).json({ message: 'Failed to grant admin status' });
  }
});

main().catch((error) => {
  console.error('Error in main function:', error);
  process.exit(1);
});