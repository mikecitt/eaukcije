const express = require('express');
const router  = express.Router();
const { runRefresh } = require('../services/refresh');

router.post('/', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await runRefresh((message, pct) => {
      const type = pct < 10 ? 'status' : 'progress';
      send(pct < 10
        ? { type, message }
        : { type, message, current: pct, total: 100 }
      );
    });

    send({ type: 'done', ...result });
  } catch (err) {
    console.error('Refresh route error:', err);
    send({ type: 'error', message: err.message });
  }

  res.end();
});

module.exports = router;
