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
      stream_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS log_module_settings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      delivery_mode TEXT NOT NULL DEFAULT 'IMMEDIATE',
      channel_id TEXT,
      batch_interval_seconds INTEGER NOT NULL DEFAULT 300,
      max_batch_items INTEGER NOT NULL DEFAULT 25,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, module_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS log_settings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      delivery_mode TEXT,
      channel_id TEXT,
      batch_interval_seconds INTEGER NOT NULL DEFAULT 300,
      max_batch_items INTEGER NOT NULL DEFAULT 25,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, event_key)
    );
  `);

  await query(`ALTER TABLE log_settings ALTER COLUMN delivery_mode DROP NOT NULL;`).catch(() => {});
  await query(`ALTER TABLE log_settings ALTER COLUMN delivery_mode DROP DEFAULT;`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS log_queue_items (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      module_key TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      flushed_at TIMESTAMPTZ
    );
  `);

  await query(`ALTER TABLE log_queue_items ADD COLUMN IF NOT EXISTS module_key TEXT;`);



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
    CREATE TABLE IF NOT EXISTS ticket_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      category_id TEXT,
      log_channel_id TEXT,
      staff_role_id TEXT,
      staff_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL,
      escalated_role_id TEXT,
      escalated_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL,
      ticket_limit INTEGER NOT NULL DEFAULT 1,
      transcript_enabled BOOLEAN NOT NULL DEFAULT true,
      panel_title TEXT,
      panel_description TEXT,
      panel_color TEXT,
      panel_header_image_url TEXT,
      close_delete_seconds INTEGER NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      ticket_number INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      opener_user_id TEXT NOT NULL,
      opener_user_tag TEXT,
      claimed_by_user_id TEXT,
      type TEXT NOT NULL DEFAULT 'Admin Support',
      subject TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      close_reason TEXT,
      closed_by_user_id TEXT,
      transcript_sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      control_message_id TEXT,
      UNIQUE(guild_id, ticket_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS report_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      review_channel_id TEXT,
      panel_title TEXT,
      panel_description TEXT,
      panel_color TEXT,
      panel_header_image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      report_number INTEGER NOT NULL,
      reporter_user_id TEXT NOT NULL,
      reporter_user_tag TEXT,
      target_user_id TEXT,
      target_user_tag TEXT,
      report_type TEXT NOT NULL DEFAULT 'General Report',
      message_link TEXT,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      reviewed_by_user_id TEXT,
      reviewed_at TIMESTAMPTZ,
      decision_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, report_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS application_types (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      review_channel_id TEXT,
      pending_role_id TEXT,
      approved_role_id TEXT,
      auto_assign_approved_role BOOLEAN NOT NULL DEFAULT false,
      panel_header_image_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS application_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      submission_number INTEGER NOT NULL,
      application_type_id TEXT NOT NULL REFERENCES application_types(id) ON DELETE CASCADE,
      application_name TEXT NOT NULL,
      applicant_user_id TEXT NOT NULL,
      applicant_user_tag TEXT,
      answers JSONB,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewed_by_user_id TEXT,
      reviewed_at TIMESTAMPTZ,
      review_reason TEXT,
      review_channel_id TEXT,
      review_message_id TEXT,
      review_thread_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, submission_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS appeal_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      review_channel_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS appeals (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      appeal_number INTEGER NOT NULL,
      appellant_user_id TEXT NOT NULL,
      appellant_user_tag TEXT,
      case_number INTEGER,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewed_by_user_id TEXT,
      reviewed_at TIMESTAMPTZ,
      decision_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, appeal_number)
    );
  `);



  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS naming_format TEXT NOT NULL DEFAULT 'ticket-{username}-{number}';`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS staff_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS escalated_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS escalated_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS ticket_types (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      label TEXT,
      description TEXT,
      category_id TEXT,
      log_channel_id TEXT,
      staff_role_id TEXT,
      staff_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL,
      escalated_role_id TEXT,
      escalated_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL,
      ticket_limit INTEGER NOT NULL DEFAULT 1,
      transcript_enabled BOOLEAN NOT NULL DEFAULT true,
      naming_format TEXT NOT NULL DEFAULT 'ticket-{username}-{number}',
      questions JSONB,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
  `);

  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reviewer_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_by_user_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;`).catch(() => {});
  await query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS control_message_id TEXT;`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS ticket_added_users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      added_by_user_id TEXT,
      add_reason TEXT,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removed_by_user_id TEXT,
      remove_reason TEXT,
      removed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(ticket_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ticket_review_indexes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      status_filter TEXT NOT NULL DEFAULT 'OPEN',
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ticket_review_indexes_guild_active ON ticket_review_indexes(guild_id, active);`).catch(() => {});

  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS ping_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS ping_team_id TEXT REFERENCES permission_teams(id) ON DELETE SET NULL;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS claimed_by_user_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_notes TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS linked_ticket_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS review_message_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS linked_ticket_opened_by_user_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS linked_ticket_opened_at TIMESTAMPTZ;`).catch(() => {});
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS decision_reason TEXT;`).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS report_review_indexes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      status_filter TEXT NOT NULL DEFAULT 'OPEN',
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_report_review_indexes_guild_active ON report_review_indexes(guild_id, active);`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS application_questions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      application_type_id TEXT NOT NULL REFERENCES application_types(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      required BOOLEAN NOT NULL DEFAULT true,
      display_order INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS application_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      application_type_id TEXT NOT NULL REFERENCES application_types(id) ON DELETE CASCADE,
      applicant_user_id TEXT NOT NULL,
      applicant_user_tag TEXT,
      current_index INTEGER NOT NULL DEFAULT 0,
      answers JSONB,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS dm_decision_enabled BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await query(`ALTER TABLE appeals ADD COLUMN IF NOT EXISTS decision_reason TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeals ADD COLUMN IF NOT EXISTS review_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeals ADD COLUMN IF NOT EXISTS review_message_id TEXT;`).catch(() => {});


  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS panel_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS panel_description TEXT;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS panel_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS close_delete_seconds INTEGER NOT NULL DEFAULT 10;`).catch(() => {});
  await query(`ALTER TABLE ticket_configs ADD COLUMN IF NOT EXISTS panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS';`).catch(() => {});

  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS panel_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS panel_description TEXT;`).catch(() => {});
  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS panel_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS';`).catch(() => {});
  await query(`ALTER TABLE report_configs ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});

  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS submission_confirmation_message TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS panel_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS panel_description TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS panel_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS';`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_types ADD COLUMN IF NOT EXISTS question_timeout_seconds INTEGER NOT NULL DEFAULT 180;`).catch(() => {});
  await query(`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS review_reason TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS review_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS review_message_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS review_thread_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE application_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`).catch(() => {});
  await query(`UPDATE application_sessions SET expires_at = updated_at + INTERVAL '180 seconds' WHERE status = 'ACTIVE' AND expires_at IS NULL;`).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS application_review_indexes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      application_type_id TEXT REFERENCES application_types(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      status_filter TEXT NOT NULL DEFAULT 'PENDING',
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_review_indexes_guild_type ON application_review_indexes(guild_id, application_type_id, active);`).catch(() => {});
  await query(`DELETE FROM application_types WHERE name = 'Moderator' AND description = 'Apply to help moderate the SlickPickleNick community.'`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS appeal_review_indexes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      status_filter TEXT NOT NULL DEFAULT 'PENDING',
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_appeal_review_indexes_guild_active ON appeal_review_indexes(guild_id, active);`).catch(() => {});

  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS panel_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS panel_description TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS panel_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS';`).catch(() => {});
  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});
  await query(`ALTER TABLE appeal_configs ADD COLUMN IF NOT EXISTS dm_include_submission BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});



  await query(`
    CREATE TABLE IF NOT EXISTS welcome_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      message_template TEXT NOT NULL DEFAULT 'Welcome {user} to **{server}**.',
      embed_title TEXT NOT NULL DEFAULT 'Welcome to {server}',
      embed_description TEXT NOT NULL DEFAULT 'Glad to have you here, {user}. Grab your roles and check out the server information to get started.',
      embed_color TEXT NOT NULL DEFAULT '#7869ff',
      dm_enabled BOOLEAN NOT NULL DEFAULT false,
      dm_message_template TEXT NOT NULL DEFAULT 'Welcome to {server}, {username}!',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS welcome_auto_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      added_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, role_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_panels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      accent_color TEXT NOT NULL DEFAULT '#7869ff',
      mode TEXT NOT NULL DEFAULT 'MULTI',
      panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS',
      panel_header_image_url TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_panel_options (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      panel_id TEXT NOT NULL REFERENCES role_panels(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      role_ids JSONB,
      label TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      button_color TEXT NOT NULL DEFAULT '#5865f2',
      display_order INTEGER NOT NULL DEFAULT 1,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(panel_id, role_id)
    );
  `);


  await query(`ALTER TABLE role_panels ADD COLUMN IF NOT EXISTS panel_display_mode TEXT NOT NULL DEFAULT 'BUTTONS';`).catch(() => {});
  await query(`ALTER TABLE role_panels ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});
  await query(`ALTER TABLE role_panel_options ALTER COLUMN label DROP NOT NULL;`).catch(() => {});
  await query(`ALTER TABLE role_panel_options ADD COLUMN IF NOT EXISTS role_ids JSONB;`).catch(() => {});
  await query(`UPDATE role_panel_options SET role_ids = jsonb_build_array(role_id) WHERE role_ids IS NULL;`).catch(() => {});

  // v0.6.1: allow a standalone role option and a bundle containing that same role
  // to coexist. Earlier versions uniquely keyed options by the first role ID,
  // which caused adding a bundle to overwrite the standalone option.
  await query(`ALTER TABLE role_panel_options ADD COLUMN IF NOT EXISTS option_key TEXT;`).catch(() => {});
  await query(`
    UPDATE role_panel_options AS option
    SET option_key = CASE
      WHEN jsonb_array_length(COALESCE(option.role_ids, jsonb_build_array(option.role_id))) > 1
        THEN 'bundle:' || (
          SELECT string_agg(role_value, ',' ORDER BY role_value)
          FROM jsonb_array_elements_text(COALESCE(option.role_ids, jsonb_build_array(option.role_id))) AS roles(role_value)
        )
      ELSE 'role:' || option.role_id
    END
    WHERE option.option_key IS NULL
       OR option.option_key = ''
       OR option.option_key LIKE 'bundle:legacy:%';
  `).catch(() => {});
  await query(`ALTER TABLE role_panel_options DROP CONSTRAINT IF EXISTS role_panel_options_panel_id_role_id_key;`).catch(() => {});
  await query(`ALTER TABLE role_panel_options ALTER COLUMN option_key SET NOT NULL;`).catch(() => {});
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_role_panel_options_panel_option_key ON role_panel_options(panel_id, option_key);`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS panel_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      panel_type TEXT NOT NULL,
      panel_ref TEXT NOT NULL DEFAULT '*',
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, message_id)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_panel_messages_lookup ON panel_messages(guild_id, panel_type, panel_ref, active);`);

  await query(`
    CREATE TABLE IF NOT EXISTS giveaway_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      default_channel_id TEXT,
      host_role_id TEXT,
      ping_role_id TEXT,
      panel_color TEXT NOT NULL DEFAULT '#7869ff',
      panel_header_image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      giveaway_number INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      prize TEXT NOT NULL,
      description TEXT,
      winner_count INTEGER NOT NULL DEFAULT 1,
      host_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      ends_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      winners JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, giveaway_number)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(giveaway_id, user_id)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_giveaways_due ON giveaways(status, ends_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_giveaway_entries_lookup ON giveaway_entries(giveaway_id);`);
  await query(`ALTER TABLE giveaway_configs ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});


  await query(`
    CREATE TABLE IF NOT EXISTS birthday_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT,
      birthday_role_id TEXT,
      announcement_template TEXT NOT NULL DEFAULT 'Happy birthday, {user}! 🎉',
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      panel_title TEXT,
      panel_description TEXT,
      panel_color TEXT,
      panel_header_image_url TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS birthday_profiles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      birth_month INTEGER NOT NULL,
      birth_day INTEGER NOT NULL,
      timezone TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS birthday_active_grants (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      role_id TEXT,
      announced BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id, local_date)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_birthday_profiles_lookup ON birthday_profiles(guild_id, active);`);

  await query(`ALTER TABLE birthday_configs ADD COLUMN IF NOT EXISTS panel_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE birthday_configs ADD COLUMN IF NOT EXISTS panel_description TEXT;`).catch(() => {});
  await query(`ALTER TABLE birthday_configs ADD COLUMN IF NOT EXISTS panel_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE birthday_configs ADD COLUMN IF NOT EXISTS panel_header_image_url TEXT;`).catch(() => {});



  await query(`
    CREATE TABLE IF NOT EXISTS server_stats_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      member_channel_id TEXT,
      human_channel_id TEXT,
      bot_channel_id TEXT,
      voice_channel_id TEXT,
      member_template TEXT NOT NULL DEFAULT 'Members: {members}',
      human_template TEXT NOT NULL DEFAULT 'Humans: {humans}',
      bot_template TEXT NOT NULL DEFAULT 'Bots: {bots}',
      voice_template TEXT NOT NULL DEFAULT 'In Voice: {voice}',
      last_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS human_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS bot_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS voice_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS member_template TEXT NOT NULL DEFAULT 'Members: {members}';`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS human_template TEXT NOT NULL DEFAULT 'Humans: {humans}';`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS bot_template TEXT NOT NULL DEFAULT 'Bots: {bots}';`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS voice_template TEXT NOT NULL DEFAULT 'In Voice: {voice}';`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;`).catch(() => {});
  await query(`ALTER TABLE server_stats_configs ADD COLUMN IF NOT EXISTS last_error TEXT;`).catch(() => {});


  await query(`
    CREATE TABLE IF NOT EXISTS bot_update_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      channel_id TEXT,
      ping_roles_enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bot_update_ping_roles (
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, role_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bot_update_announcements (
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      announced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, version)
    );
  `);


  await query(`
    CREATE TABLE IF NOT EXISTS join_create_hubs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      source_channel_id TEXT NOT NULL,
      category_id TEXT,
      hub_name TEXT NOT NULL DEFAULT 'Join to Create',
      enabled BOOLEAN NOT NULL DEFAULT true,
      name_template TEXT NOT NULL DEFAULT '{username}''s Voice',
      user_limit INTEGER NOT NULL DEFAULT 0,
      bitrate INTEGER,
      private_enabled BOOLEAN NOT NULL DEFAULT false,
      owner_controls_enabled BOOLEAN NOT NULL DEFAULT true,
      delete_when_empty BOOLEAN NOT NULL DEFAULT true,
      empty_delete_delay_seconds INTEGER NOT NULL DEFAULT 30,
      staff_role_id TEXT,
      created_by_user_id TEXT,
      updated_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, source_channel_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS join_create_temp_channels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      hub_id TEXT REFERENCES join_create_hubs(id) ON DELETE SET NULL,
      channel_id TEXT UNIQUE NOT NULL,
      owner_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      name TEXT,
      locked BOOLEAN NOT NULL DEFAULT false,
      user_limit INTEGER NOT NULL DEFAULT 0,
      control_message_id TEXT,
      control_message_error TEXT,
      last_empty_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS category_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS hub_name TEXT NOT NULL DEFAULT 'Join to Create';`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS name_template TEXT NOT NULL DEFAULT '{username}''s Voice';`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS user_limit INTEGER NOT NULL DEFAULT 0;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS bitrate INTEGER;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS private_enabled BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS owner_controls_enabled BOOLEAN NOT NULL DEFAULT true;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS delete_when_empty BOOLEAN NOT NULL DEFAULT true;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS empty_delete_delay_seconds INTEGER NOT NULL DEFAULT 30;`).catch(() => {});
  await query(`ALTER TABLE join_create_hubs ADD COLUMN IF NOT EXISTS staff_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE join_create_temp_channels ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await query(`ALTER TABLE join_create_temp_channels ADD COLUMN IF NOT EXISTS user_limit INTEGER NOT NULL DEFAULT 0;`).catch(() => {});
  await query(`ALTER TABLE join_create_temp_channels ADD COLUMN IF NOT EXISTS control_message_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE join_create_temp_channels ADD COLUMN IF NOT EXISTS control_message_error TEXT;`).catch(() => {});
  await query(`ALTER TABLE join_create_temp_channels ADD COLUMN IF NOT EXISTS last_empty_at TIMESTAMPTZ;`).catch(() => {});


  await query(`
    CREATE TABLE IF NOT EXISTS custom_command_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      prefix TEXT NOT NULL DEFAULT '!',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      response TEXT NOT NULL,
      embed_enabled BOOLEAN NOT NULL DEFAULT false,
      embed_title TEXT,
      embed_color TEXT,
      cooldown_seconds INTEGER NOT NULL DEFAULT 0,
      allowed_channel_id TEXT,
      allowed_role_id TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_by_user_id TEXT,
      updated_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, name)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS custom_command_usage_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      command_id TEXT REFERENCES custom_commands(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      response_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`ALTER TABLE custom_command_configs ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;`).catch(() => {});
  await query(`ALTER TABLE custom_command_configs ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT '!';`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS embed_enabled BOOLEAN NOT NULL DEFAULT false;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS embed_title TEXT;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS embed_color TEXT;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER NOT NULL DEFAULT 0;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS allowed_channel_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS allowed_role_id TEXT;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;`).catch(() => {});
  await query(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS scheduled_message_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      default_channel_id TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      schedule_number INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      send_at TIMESTAMPTZ NOT NULL,
      repeat_mode TEXT NOT NULL DEFAULT 'NONE',
      created_by_user_id TEXT,
      cancelled_by_user_id TEXT,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, schedule_number)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages(status, send_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_scheduled_messages_guild ON scheduled_messages(guild_id, status, send_at);`);



  await query(`
    CREATE TABLE IF NOT EXISTS leveling_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      xp_min INTEGER NOT NULL DEFAULT 15,
      xp_max INTEGER NOT NULL DEFAULT 25,
      cooldown_seconds INTEGER NOT NULL DEFAULT 60,
      minimum_message_length INTEGER NOT NULL DEFAULT 3,
      level_up_channel_id TEXT,
      level_up_message TEXT NOT NULL DEFAULT 'Congratulations {user}! You reached level **{level}**.',
      ignored_channel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      ignored_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS leveling_profiles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      xp BIGINT NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_xp_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS leveling_role_rewards (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, level, role_id)
    );
  `);

  await query(`ALTER TABLE leveling_configs ADD COLUMN IF NOT EXISTS level_up_announce_mode TEXT NOT NULL DEFAULT 'ALL_LEVELS';`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS leveling_multiplier_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      multiplier NUMERIC(8,3) NOT NULL DEFAULT 1.000,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, role_id)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_leveling_profiles_rank ON leveling_profiles(guild_id, xp DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leveling_rewards ON leveling_role_rewards(guild_id, level, active);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leveling_multipliers ON leveling_multiplier_roles(guild_id, active, multiplier DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS community_game_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      game_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT false,
      channel_id TEXT,
      win_xp INTEGER NOT NULL DEFAULT 50,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, game_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS counting_game_configs (
      guild_id TEXT PRIMARY KEY REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT,
      starting_number BIGINT NOT NULL DEFAULT 1,
      current_number BIGINT NOT NULL DEFAULT 0,
      record_number BIGINT NOT NULL DEFAULT 0,
      last_user_id TEXT,
      reset_on_incorrect BOOLEAN NOT NULL DEFAULT true,
      prevent_consecutive BOOLEAN NOT NULL DEFAULT true,
      reset_on_edit BOOLEAN NOT NULL DEFAULT true,
      reset_on_delete BOOLEAN NOT NULL DEFAULT true,
      ignore_non_number_messages BOOLEAN NOT NULL DEFAULT true,
      allow_expressions BOOLEAN NOT NULL DEFAULT false,
      delete_invalid_messages BOOLEAN NOT NULL DEFAULT false,
      reset_message TEXT NOT NULL DEFAULT '{user} reset the count. The next number is **{next}**.',
      milestone_interval INTEGER NOT NULL DEFAULT 100,
      milestone_message TEXT NOT NULL DEFAULT 'The server reached **{number}** in <#{channel}>. New counting record: **{record}**.',
      milestone_xp INTEGER NOT NULL DEFAULT 0,
      normal_message_xp BOOLEAN NOT NULL DEFAULT false,
      accepted_reaction_emoji TEXT NOT NULL DEFAULT '✅',
      failed_reaction_emoji TEXT NOT NULL DEFAULT '🚫',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  await query(`ALTER TABLE community_game_configs ADD COLUMN IF NOT EXISTS win_xp INTEGER NOT NULL DEFAULT 50;`);
  await query(`ALTER TABLE counting_game_configs ADD COLUMN IF NOT EXISTS reset_on_edit BOOLEAN NOT NULL DEFAULT true;`);
  await query(`ALTER TABLE counting_game_configs ADD COLUMN IF NOT EXISTS reset_on_delete BOOLEAN NOT NULL DEFAULT true;`);
  await query(`ALTER TABLE counting_game_configs ADD COLUMN IF NOT EXISTS accepted_reaction_emoji TEXT NOT NULL DEFAULT '✅';`);
  await query(`ALTER TABLE counting_game_configs ADD COLUMN IF NOT EXISTS failed_reaction_emoji TEXT NOT NULL DEFAULT '🚫';`);

  await query(`
    CREATE TABLE IF NOT EXISTS counting_game_entries (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      number_value BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS counting_game_ignored_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, role_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS counting_game_ignored_users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS counting_game_stats (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      valid_counts BIGINT NOT NULL DEFAULT 0,
      resets_caused BIGINT NOT NULL DEFAULT 0,
      highest_number BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_game_sessions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      game_key TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      player_one_id TEXT NOT NULL,
      player_two_id TEXT NOT NULL,
      current_player_id TEXT,
      winner_user_id TEXT,
      board JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'PENDING',
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS community_game_stats (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      game_key TEXT NOT NULL,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id, game_key)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_community_game_configs_guild ON community_game_configs(guild_id, game_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_counting_game_entries_guild ON counting_game_entries(guild_id, channel_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_counting_game_stats_rank ON counting_game_stats(guild_id, valid_counts DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_community_game_sessions_active ON community_game_sessions(guild_id, game_key, status, expires_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_community_game_sessions_players ON community_game_sessions(guild_id, game_key, player_one_id, player_two_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_community_game_stats_user ON community_game_stats(guild_id, user_id, game_key);`);

  await query(`
    CREATE TABLE IF NOT EXISTS community_game_panels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      title TEXT NOT NULL DEFAULT 'Community Games',
      description TEXT NOT NULL DEFAULT 'Choose a game below to start playing.',
      header_image_url TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_community_game_panels_guild_active ON community_game_panels(guild_id, active);`);

  await query(`
    CREATE TABLE IF NOT EXISTS role_permission_levels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      permission_level TEXT NOT NULL DEFAULT 'MODERATOR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, role_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS team_permission_levels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES permission_teams(id) ON DELETE CASCADE,
      permission_level TEXT NOT NULL DEFAULT 'MODERATOR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, team_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS command_permission_levels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      required_level TEXT NOT NULL DEFAULT 'SENIOR_MODERATOR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, action_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS module_permission_levels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      required_level TEXT NOT NULL DEFAULT 'SENIOR_MODERATOR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, module_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permission_default_versions (
      guild_id TEXT PRIMARY KEY REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      seeded_version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permission_ignored_users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      reason TEXT,
      added_by_user_id TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, user_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_action_permissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      allow BOOLEAN NOT NULL DEFAULT true,
      channel_scope TEXT NOT NULL DEFAULT '*',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, role_id, action_key, channel_scope)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS public_action_permissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, action_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS module_permission_targets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      module_key TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      allow BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, module_key, target_type, target_id)
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_ignored_users_guild_user ON permission_ignored_users(guild_id, user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_role_action_permissions ON role_action_permissions(guild_id, action_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_public_action_permissions ON public_action_permissions(guild_id, action_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_module_permission_targets ON module_permission_targets(guild_id, module_key);`);


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
  await query(`CREATE INDEX IF NOT EXISTS idx_log_module_settings_guild ON log_module_settings(guild_id, module_key);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_log_queue_pending ON log_queue_items(guild_id, event_key, flushed_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_bot_update_roles_guild ON bot_update_ping_roles(guild_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_bot_update_announcements_guild ON bot_update_announcements(guild_id, announced_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_create_hubs_guild ON join_create_hubs(guild_id, enabled);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_create_hubs_source ON join_create_hubs(guild_id, source_channel_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_create_temp_active ON join_create_temp_channels(guild_id, status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_create_temp_owner ON join_create_temp_channels(guild_id, owner_user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_custom_commands_guild_name ON custom_commands(guild_id, name);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_custom_commands_guild_enabled ON custom_commands(guild_id, enabled);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_custom_command_usage_guild_created ON custom_command_usage_logs(guild_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created ON audit_logs(guild_id, created_at);`);
  
  await query(`ALTER TABLE bot_presence_settings ADD COLUMN IF NOT EXISTS stream_url TEXT;`);

await query(`CREATE INDEX IF NOT EXISTS idx_bot_presence_guild ON bot_presence_settings(guild_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target ON moderation_cases(guild_id, target_user_id, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_number ON moderation_cases(guild_id, case_number);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_notes_guild_target ON user_notes(guild_id, target_user_id, created_at DESC);`);


  await query(`CREATE INDEX IF NOT EXISTS idx_ticket_types_guild ON ticket_types(guild_id, name);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_questions_type ON application_questions(application_type_id, display_order);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_sessions_active ON application_sessions(applicant_user_id, status, updated_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_sessions_expires ON application_sessions(status, expires_at);`).catch(() => {});

  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(guild_id, channel_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reports_guild_status ON reports(guild_id, status, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_types_guild ON application_types(guild_id, name);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_application_submissions_guild_status ON application_submissions(guild_id, status, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_appeals_guild_status ON appeals(guild_id, status, created_at DESC);`);

  await query(`CREATE INDEX IF NOT EXISTS idx_welcome_auto_roles_guild ON welcome_auto_roles(guild_id, active);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_role_panels_guild ON role_panels(guild_id, name, active);`);
  await query(`ALTER TABLE role_panel_options ADD COLUMN IF NOT EXISTS button_color TEXT NOT NULL DEFAULT '#5865f2';`).catch(() => {});

  await query(`CREATE INDEX IF NOT EXISTS idx_role_panel_options_panel ON role_panel_options(panel_id, active);`);

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
