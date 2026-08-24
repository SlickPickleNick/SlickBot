const { Pool } = require('pg');
const { env } = require('../config/env');

const isLocalDb = Boolean(
  env.DATABASE_URL &&
  (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1'))
);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.warn('[Database] Unexpected error on idle client:', err.message);
});

let customQueryHandler = null;

function setQueryHandler(handler) {
  customQueryHandler = handler;
}

function resetQueryHandler() {
  customQueryHandler = null;
}

async function query(text, params = []) {
  if (customQueryHandler) {
    return customQueryHandler(text, params);
  }
  return pool.query(text, params);
}

async function withTransaction(callback) {
  if (customQueryHandler && typeof customQueryHandler.withTransaction === 'function') {
    return customQueryHandler.withTransaction(callback);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  await pool.end().catch(() => {});
}

module.exports = {
  pool,
  query,
  withTransaction,
  closeDatabase,
  setQueryHandler,
  resetQueryHandler
};

