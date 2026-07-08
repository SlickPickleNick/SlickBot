const { Pool } = require('pg');
const { env } = require('../config/env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  closeDatabase
};
