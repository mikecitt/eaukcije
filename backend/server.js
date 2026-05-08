require('dotenv').config();
const express = require('express');
const path    = require('path');
const { initDb } = require('./db');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auctions',  require('./routes/auctions'));
app.use('/api/refresh',   require('./routes/refresh'));
app.use('/api/ai-filter', require('./routes/ai-filter'));

const PORT = process.env.PORT || 3000;

initDb().then(() => {
  require('./scheduler');
  app.listen(PORT, () => {
    console.log(`\n  EAukcije: http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
