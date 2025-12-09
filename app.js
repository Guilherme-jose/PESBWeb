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

const main = async () => {
  let client;
  try {
    client = new Client({
      user: 'guilherme', // Replace with an existing role
      password: '31415962', // Replace with the role's password
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
        posts.id,
        posts.content,
        posts.created_at,
        images.path,
        images.latitude,
        images.longitude,
        COALESCE(lc.count, 0)::int AS likes
      FROM posts
      JOIN images ON posts.image_id = images.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count
        FROM post_likes
        GROUP BY post_id
      ) lc ON lc.post_id = posts.id
      ORDER BY posts.created_at DESC
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
      `;
      await client.query(insertUploadSQL, [userId, imageId, description ? String(description).trim() : null]);

      await client.query('COMMIT');

      console.log('File uploaded:', file.originalname, 'imageId:', imageId, 'userId:', userId);

      // Redirect to map page after suAccountccessful upload
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

  app.use(express.json());

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

main().catch((error) => {
  console.error('Error in main function:', error);
  process.exit(1);
});