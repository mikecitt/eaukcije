require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auctions',  require('./routes/auctions'));
app.use('/api/refresh',   require('./routes/refresh'));
app.use('/api/ai-filter', require('./routes/ai-filter'));

require('./scheduler');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  EAukcije: http://localhost:${PORT}\n`);
});
