const { initDb } = require('./db');
const app = require('./app');

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
