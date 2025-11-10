import { Client } from 'pg'

const client = new Client()
await client.connect()

const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res) => {
    res.send('Hello World!')
  })
  
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })

app.post('/upload', (req, res) => {
  let uploadStatus = 'Upload successful!';  
  // Logic for handling picture upload would go here
  
  res.send(uploadStatus);
});

app.use(express.static('public'))


await client.end()