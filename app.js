const { Client } = require('pg');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');

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
  
  app.post('/upload', upload.single('picture'), async (req, res) => {
    const file = req.file; // Access the uploaded file
    const { location } = req.body; // Access latitude and longitude from the request body

    if (!location || !location.includes(',')) {
      console.error('Invalid location format');
      return res.status(400).send('Invalid location format. Expected "latitude,longitude".');
    }

    const [latPart, longPart] = location.split(',');
    const latitude = parseFloat(latPart.split(':')[1].trim());
    const longitude = parseFloat(longPart.split(':')[1].trim());

    const values = [file.originalname, file.mimetype, file.path, file.size, latitude, longitude];
    const query = 'INSERT INTO images (filename, mimetype, path, size, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)';
    console.log(file); // Logs metadata about the file
    res.send(`File uploaded: ${file.originalname}`);

    try {
      await client.query(query, values);
      console.log('Image metadata saved to database');
    } catch (error) {
      console.error('Failed to save image metadata to database:', error);
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

      return res.status(200).json({ message: 'Login successful', user });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Login failed. Try again later.' });
    }
  });

};

main().catch((error) => {
  console.error('Error in main function:', error);
  process.exit(1);
});