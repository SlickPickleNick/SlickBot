const { query, closeDatabase } = require('./db');

async function initDatabase() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await query(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL,
      guild_name TEXT,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      default_log_channel_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS module_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      log_channel_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, module_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permission_teams (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      is_system_team BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permission_team_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      team_id TEXT NOT NULL REFERENCES permission_teams(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, role_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permission_team_users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      team_id TEXT NOT NULL REFERENCES permission_teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS command_permissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES permission_teams(id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      allow BOOLEAN NOT NULL DEFAULT true,
      channel_scope TEXT NOT NULL DEFAULT '*',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(team_id, action_key, channel_scope)
    );
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS bot_presence_settings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'online',
      activity_type TEXT NOT NULL DEFAULT 'NONE',
      activity_text TEXT,
      activity_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS log_settings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      delivery_mode TEXT NOT NULL DEFAULT 'BATCHED',
      channel_id TEXT,
      batch_interval_seconds INTEGER NOT NULL DEFAULT 300,
      max_batch_items INTEGER NOT NULL DEFAULT 25,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, event_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS log_queue_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      flushed_at TIMESTAMPTZ
    );
  `);



  await query(`
    CREATE TABLE IF NOT EXISTS moderation_cases (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      case_number INTEGER NOT NULL,
      target_user_id TEXT NOT NULL,
      target_user_tag TEXT,
      actor_user_id TEXT,
      action_type TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      duration_seconds INTEGER,
      expires_at TIMESTAMPTZ,
      evidence TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, case_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      note_number INTEGER NOT NULL,
      target_user_id TEXT NOT NULL,
      target_user_tag TEXT,
      actor_user_id TEXT,
      note TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, note_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      actor_user_id TEXT,
      action_key TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      severity TEXT NOT NULL DEFAULT 'INFO',
      summary TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_module_configs_guild ON module_configs(guild_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_command_permissions_action ON command_permissions(guild_id, action_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_log_queue_pending ON log_queue_items(guild_id, event_key, flushed_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created ON audit_logs(guild_id, created_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_bot_presence_guild ON bot_presence_settings(guild_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target ON moderation_cases(guild_id, target_user_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_number ON moderation_cases(guild_id, case_number);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_notes_guild_target ON user_notes(guild_id, target_user_id, created_at DESC);`);
}

if (require.main === module) {
  initDatabase()
    .then(async () => {
      console.log('Database initialized.');
      await closeDatabase();
    })
    .catch(async (error) => {
      console.error('Database initialization failed:', error);
      await closeDatabase().catch(() => {});
      process.exit(1);
    });
}

module.exports = { initDatabase };
