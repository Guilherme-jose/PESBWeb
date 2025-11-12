const { Client } = require('pg');
const express = require('express');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' }); // Temporary storage directory
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const main = async () => {
  const client = new Client({
    user: 'guilherme', // Replace with an existing role
    password: '31415962', // Replace with the role's password
    host: 'localhost',
    port: 5432,
    database: 'pesb',
  });
  await client.connect();

  try {
    await client.query('SELECT 1');
    console.log('Database connection successful');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
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

};

main().catch((error) => {
  console.error('Error in main function:', error);
  process.exit(1);
});