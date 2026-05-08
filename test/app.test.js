const { test, before, describe } = require('node:test');
const assert   = require('node:assert/strict');
const request  = require('supertest');
const app      = require('../backend/app');
const { pool, initDb } = require('../backend/db');

// Check once if PostgreSQL is reachable
let dbAvailable = false;
before(async () => {
  try {
    await initDb();
    dbAvailable = true;
  } catch (_) {
    console.log('# PostgreSQL not available — DB tests will be skipped');
  }
});

// ── Tests that do NOT require a DB connection ─────────────────────────────────

describe('GET /health', () => {
  test('returns { ok: true }', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});

describe('POST /api/ai-filter', () => {
  test('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/ai-filter').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('returns 400 when auctions list is empty', async () => {
    const res = await request(app)
      .post('/api/ai-filter')
      .send({ description: 'kuća', auctions: [] });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('returns 500 when ANTHROPIC_API_KEY is not set', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await request(app)
        .post('/api/ai-filter')
        .send({ description: 'kuća', auctions: [{ id: '1', opis: 'test' }] });
      assert.equal(res.status, 500);
      assert.ok(res.body.error);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe('POST /api/refresh', () => {
  test('responds with SSE content-type', async () => {
    const res = await request(app)
      .post('/api/refresh')
      .timeout({ response: 10000 });
    assert.ok(
      res.headers['content-type'].includes('text/event-stream'),
      'should stream SSE'
    );
  });
});

// ── Tests that require a live PostgreSQL connection ───────────────────────────

describe('GET /api/auctions', () => {
  test('returns auctions array and lastRefresh field', { skip: !dbAvailable && 'PostgreSQL not available' }, async () => {
    const res = await request(app).get('/api/auctions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.auctions), 'auctions should be an array');
    assert.ok('lastRefresh' in res.body, 'lastRefresh field should be present');
  });
});

describe('DELETE /api/auctions', () => {
  before(() => { process.env.DB_REMOVE_PASSWORD = 'test-secret'; });

  test('rejects missing password with 403', { skip: !dbAvailable && 'PostgreSQL not available' }, async () => {
    const res = await request(app)
      .delete('/api/auctions')
      .send({});
    assert.equal(res.status, 403);
  });

  test('rejects wrong password with 403', { skip: !dbAvailable && 'PostgreSQL not available' }, async () => {
    const res = await request(app)
      .delete('/api/auctions')
      .send({ password: '__wrong__' });
    assert.equal(res.status, 403);
  });
});
