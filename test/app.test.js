const { test, before, after, describe } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');

require('reflect-metadata');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-app-tests';
process.env.DB_REMOVE_PASSWORD = process.env.DB_REMOVE_PASSWORD || 'test-remove-password';
process.env.ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'test-admin-password';

const { Test } = require('@nestjs/testing');
const cookieParser = require('cookie-parser');
const { AppModule } = require('../backend/src/app.module');

let app;
let server;
let dbAvailable = false;
let adminAgent; // supertest agent authenticated as the seeded admin

// node:test evaluates a `skip` option at test-registration time, before this
// before() hook has resolved — so tests must check dbAvailable themselves at
// run time via t.skip(), not via a static { skip } option.
function skipIfNoDb(t) {
  if (!dbAvailable) t.skip('PostgreSQL not available');
  return dbAvailable;
}

before(async () => {
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    server = app.getHttpServer();

    adminAgent = request.agent(server);
    const res = await adminAgent
      .post('/api/auth/login')
      .send({ username: 'admin', password: process.env.ADMIN_DEFAULT_PASSWORD });
    if (res.status !== 200) {
      throw new Error(`seeded admin login failed with status ${res.status}`);
    }
    dbAvailable = true;
  } catch (err) {
    console.log(`# PostgreSQL not available — DB tests will be skipped (${err.message})`);
  }
});

after(async () => {
  if (app) await app.close();
});

describe('GET /health', () => {
  test('returns { ok: true } without auth', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await request(server).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});

describe('Auth guard', () => {
  test('rejects unauthenticated requests to protected routes with 401', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await request(server).get('/api/auctions');
    assert.equal(res.status, 401);
  });

  test('rejects login with wrong credentials with 401', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });
    assert.equal(res.status, 401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the logged-in admin user', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'admin');
    assert.equal(res.body.user.role, 'admin');
  });
});

describe('GET /api/auctions', () => {
  test('returns auctions array and lastRefresh field', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent.get('/api/auctions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.auctions), 'auctions should be an array');
    assert.ok('lastRefresh' in res.body, 'lastRefresh field should be present');
  });
});

describe('GET /api/favorites', () => {
  test('returns an array', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent.get('/api/favorites');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('POST /api/ai-filter', () => {
  test('returns 400 when body is missing', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent.post('/api/ai-filter').send({});
    assert.equal(res.status, 400);
  });

  test('returns 400 when ids list is empty', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent
      .post('/api/ai-filter')
      .send({ description: 'kuća', ids: [] });
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/auctions', () => {
  test('rejects missing password with 403', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent.delete('/api/auctions').send({});
    assert.equal(res.status, 403);
  });

  test('rejects wrong password with 403', async t => {
    if (!skipIfNoDb(t)) return;
    const res = await adminAgent
      .delete('/api/auctions')
      .send({ password: '__wrong__' });
    assert.equal(res.status, 403);
  });
});
