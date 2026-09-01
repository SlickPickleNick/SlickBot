# Database & Migrations Guidelines

This rule defines the conventions for PostgreSQL database access, connection management, schema initialization, and transactional integrity in SlickBot.

---

## 1. Database Access Layer (`src/services/db.js`)

All database interactions must use the exported methods from `src/services/db.js`:

```javascript
const { query, withTransaction } = require('../services/db');

// Standard parameterized query
async function getGuildSettings(guildId) {
  const result = await query(
    'SELECT * FROM guild_settings WHERE guild_id = $1 LIMIT 1',
    [guildId]
  );
  return result.rows[0] || null;
}

// Atomic multi-statement transaction
async function transferCoins(guildId, senderId, receiverId, amount) {
  return withTransaction(async (client) => {
    await client.query(
      'UPDATE economy SET balance = balance - $1 WHERE guild_id = $2 AND user_id = $3',
      [amount, guildId, senderId]
    );
    await client.query(
      'UPDATE economy SET balance = balance + $1 WHERE guild_id = $2 AND user_id = $3',
      [amount, guildId, receiverId]
    );
  });
}
```

---

## 2. Parameterized Queries (Zero SQL Injection)

> [!IMPORTANT]
> **Always use Parameterized Placeholders**
> Never concatenate or interpolate user input or IDs directly into SQL strings. Always pass variables via the params array (`$1, $2, ...`).

---

## 3. Schema Initialization & Migrations (`src/services/initDatabase.js`)

All database tables and column additions must be declared idempotently in `src/services/initDatabase.js`:

```javascript
// Idempotent Table Creation
await client.query(`
  CREATE TABLE IF NOT EXISTS feature_table (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
  );
`);

// Idempotent Column Additions
await client.query(`
  ALTER TABLE feature_table 
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
`);

// Idempotent Indexes
await client.query(`
  CREATE INDEX IF NOT EXISTS idx_feature_guild_created 
  ON feature_table (guild_id, created_at DESC);
`);
```

---

## 4. Multi-Guild Isolation
- Every table containing guild-specific data must include `guild_id`.
- Composite primary keys or unique constraints (e.g., `PRIMARY KEY (guild_id, id)`) must be used to ensure total data isolation between Discord servers.

---

## 5. Unit Test Mocking

For unit tests in `test/unit/`, do not connect to a live database. Use `setQueryHandler` and `resetQueryHandler` from `src/services/db.js` to mock SQL execution:

```javascript
const { setQueryHandler, resetQueryHandler } = require('../../src/services/db');

// In test setup:
setQueryHandler(async (text, params) => {
  if (text.includes('SELECT * FROM guild_settings')) {
    return { rows: [{ guild_id: '12345', enabled: true }] };
  }
  return { rows: [] };
});

// In test teardown:
resetQueryHandler();
```
