const { test, before, after, describe } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');

require('reflect-metadata');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-app-tests';
process.env.DB_REMOVE_PASSWORD = process.env.DB_REMOVE_PASSWORD || 'test-remove-password';

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { Test } = require('@nestjs/testing');
const cookieParser = require('cookie-parser');
const { AppModule } = require('../backend/src/app.module');
const { DatabaseService } = require('../backend/src/database/database.service');

// A dedicated test account, provisioned fresh on every run — independent of
// whatever password the seeded default `admin` account currently has (it may
// have been changed, or seeded with a different ADMIN_DEFAULT_PASSWORD, on a
// pre-existing/dev database), so the suite doesn't fail setup against a
// perfectly healthy app + database.
const TEST_ADMIN_USERNAME = '__e2e_test_admin__';
const TEST_ADMIN_PASSWORD = 'e2e-test-admin-password';

let app;
let server;
let dbAvailable = false;
let adminAgent; // supertest agent authenticated as the dedicated test admin

// node:test evaluates a `skip` option at test-registration time, before this
// before() hook has resolved — so tests must check dbAvailable themselves at
// run time via t.skip(), not via a static { skip } option.
function skipIfNoDb(t) {
  if (!dbAvailable) t.skip('PostgreSQL not available');
  return dbAvailable;
}

before(async () => {
  // Probe DB reachability on its own first, so a real regression in app
  // bootstrap/login below isn't swallowed and reported as "DB unavailable".
  const probe = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await probe.query('SELECT 1');
  } catch (err) {
    console.log(`# PostgreSQL not available — DB tests will be skipped (${err.message})`);
    return;
  } finally {
    await probe.end();
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  server = app.getHttpServer();

  const db = moduleRef.get(DatabaseService);
  const hash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
  await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [TEST_ADMIN_USERNAME, hash],
  );

  adminAgent = request.agent(server);
  const res = await adminAgent
    .post('/api/auth/login')
    .send({ username: TEST_ADMIN_USERNAME, password: TEST_ADMIN_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`test admin login failed with status ${res.status}`);
  }
  dbAvailable = true;
});

after(async () => {
  if (!app) return;
  const db = app.get(DatabaseService);
  await db.query('DELETE FROM users WHERE username = $1', [TEST_ADMIN_USERNAME]);
  await app.close();
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
    assert.equal(res.body.user.username, TEST_ADMIN_USERNAME);
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
