require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api/auctions', require('./routes/auctions'));
app.use('/api/refresh',  require('./routes/refresh'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  EAukcije: http://localhost:${PORT}\n`);
});
