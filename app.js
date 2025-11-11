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


  
  app.post('/upload', upload.single('picture'), async (req, res) => {
    const file = req.file; // Access the uploaded file
    console.log(file); // Logs metadata about the file
    res.send(`File uploaded: ${file.originalname}`);
    const query = 'INSERT INTO images (filename, mimetype, path, size) VALUES ($1, $2, $3, $4)';
    const values = [file.originalname, file.mimetype, file.path, file.size];

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