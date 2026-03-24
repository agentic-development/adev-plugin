// Main application file - monolithic
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Hello'));
app.get('/users', (req, res) => res.json([]));
app.get('/items', (req, res) => res.json([]));

app.listen(3000);
