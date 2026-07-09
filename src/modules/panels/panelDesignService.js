const { query } = require('../../services/db');

function normalizeHexColor(color, fallback = '#7869ff') {
  if (!color) return fallback;
  const value = String(color).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`;
  return fallback;
}

function normalizeTarget(value) {
  return String(value || '').trim().toLowerCase();
}

async function updatePanelDesign({ guildId, target, name = null, title = null, description = null, color = null, displayMode = null, createIfMissing = false }) {
  const panelTitle = title && title.trim() ? title.trim() : null;
  const panelDescription = description && description.trim() ? description.trim() : null;
  const panelColor = color && color.trim() ? normalizeHexColor(color.trim()) : null;
  const normalizedDisplayInput = displayMode && String(displayMode).trim() ? String(displayMode).trim().toUpperCase() : null;
  const panelDisplayMode = normalizedDisplayInput
    ? (normalizedDisplayInput.startsWith('REACT') || normalizedDisplayInput === 'EMOJI' || normalizedDisplayInput === 'EMOJIS'
      ? 'REACTIONS'
      : (normalizedDisplayInput.startsWith('DROP') || normalizedDisplayInput === 'SELECT' || normalizedDisplayInput === 'SELECT_MENU' ? 'DROPDOWN' : 'BUTTONS'))
    : null;
  const key = normalizeTarget(target);

  if (key === 'ticket' || key === 'tickets') {
    const result = await query(
      `INSERT INTO ticket_configs (guild_id, panel_title, panel_description, panel_color, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, ticket_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, ticket_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, ticket_configs.panel_color),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, ticket_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, panelDisplayMode]
    );
    return { ok: true, target: 'Ticket Panel', panelType: 'ticket', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'report' || key === 'reports') {
    const result = await query(
      `INSERT INTO report_configs (guild_id, panel_title, panel_description, panel_color, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, report_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, report_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, report_configs.panel_color),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, report_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, panelDisplayMode]
    );
    return { ok: true, target: 'Report Panel', panelType: 'report', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'appeal' || key === 'appeals') {
    const result = await query(
      `INSERT INTO appeal_configs (guild_id, panel_title, panel_description, panel_color, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, appeal_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, appeal_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, appeal_configs.panel_color),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, appeal_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, panelDisplayMode]
    );
    return { ok: true, target: 'Appeal Panel', panelType: 'appeal', panelRef: '*', row: result.rows[0] };
  }


  if (key === 'birthday' || key === 'birthdays') {
    const result = await query(
      `INSERT INTO birthday_configs (guild_id, panel_title, panel_description, panel_color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, birthday_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, birthday_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, birthday_configs.panel_color),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color`,
      [guildId, panelTitle, panelDescription, panelColor]
    );
    return { ok: true, target: 'Birthday Panel', panelType: 'birthday', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'application' || key === 'applications') {
    if (!name) return { ok: false, reason: 'Application panel editing requires the application type name.' };
    let result;
    if (createIfMissing) {
      result = await query(
        `INSERT INTO application_types (guild_id, name, panel_title, panel_description, panel_color, panel_display_mode, enabled)
         VALUES ($1, $2, COALESCE($3, $2), $4, $5, COALESCE($6, 'BUTTONS'), true)
         ON CONFLICT (guild_id, name) DO UPDATE SET
           panel_title = COALESCE(EXCLUDED.panel_title, application_types.panel_title),
           panel_description = COALESCE(EXCLUDED.panel_description, application_types.panel_description),
           panel_color = COALESCE(EXCLUDED.panel_color, application_types.panel_color),
           panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, application_types.panel_display_mode),
           enabled = true,
           updated_at = NOW()
         RETURNING id, panel_title, panel_description, panel_color, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, panelDisplayMode]
      );
      const app = result.rows[0];
      const count = await query(`SELECT COUNT(*)::int AS count FROM application_questions WHERE application_type_id = $1`, [app.id]).catch(() => ({ rows: [{ count: 0 }] }));
      if ((count.rows[0]?.count || 0) === 0) {
        const defaults = ['Why are you applying?', 'What relevant experience do you have?', 'What is your availability?'];
        for (let i = 0; i < defaults.length; i++) {
          await query(`INSERT INTO application_questions (application_type_id, question_text, required, display_order) VALUES ($1, $2, $3, $4)`, [app.id, defaults[i], i < 2, i + 1]).catch(() => {});
        }
      }
    } else {
      result = await query(
        `UPDATE application_types SET
           panel_title = COALESCE($3, panel_title),
           panel_description = COALESCE($4, panel_description),
           panel_color = COALESCE($5, panel_color),
           panel_display_mode = COALESCE($6, panel_display_mode),
           updated_at = NOW()
         WHERE guild_id = $1 AND LOWER(name) = LOWER($2)
         RETURNING id, panel_title, panel_description, panel_color, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, panelDisplayMode]
      );
    }
    if (!result.rows[0]) return { ok: false, reason: `Application type \`${name}\` was not found.` };
    return { ok: true, target: `Application Panel: ${result.rows[0].name}`, panelType: 'application', panelRef: result.rows[0].id || name, altPanelRefs: [name, result.rows[0].name], row: result.rows[0] };
  }

  if (key === 'role' || key === 'roles' || key === 'reaction-role' || key === 'reaction-roles') {
    if (!name) return { ok: false, reason: 'Role panel editing requires the role panel name.' };
    let result;
    if (createIfMissing) {
      result = await query(
        `INSERT INTO role_panels (guild_id, name, title, description, accent_color, mode, panel_display_mode, active)
         VALUES ($1, $2, COALESCE($3, $2), COALESCE($4, 'Select an option below to toggle a role.'), COALESCE($5, '#7869ff'), 'MULTI', COALESCE($6, 'BUTTONS'), true)
         ON CONFLICT (guild_id, name) DO UPDATE SET
           title = COALESCE(EXCLUDED.title, role_panels.title),
           description = COALESCE(EXCLUDED.description, role_panels.description),
           accent_color = COALESCE(EXCLUDED.accent_color, role_panels.accent_color),
           panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, role_panels.panel_display_mode),
           active = true,
           updated_at = NOW()
         RETURNING id, title, description, accent_color, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, panelDisplayMode]
      );
    } else {
      result = await query(
        `UPDATE role_panels SET
           title = COALESCE($3, title),
           description = COALESCE($4, description),
           accent_color = COALESCE($5, accent_color),
           panel_display_mode = COALESCE($6, panel_display_mode),
           updated_at = NOW()
         WHERE guild_id = $1 AND LOWER(name) = LOWER($2) AND active = true
         RETURNING id, title, description, accent_color, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, panelDisplayMode]
      );
    }
    if (!result.rows[0]) return { ok: false, reason: `Role panel \`${name}\` was not found.` };
    return { ok: true, target: `Role Panel: ${result.rows[0].name}`, panelType: 'role', panelRef: result.rows[0].id, altPanelRefs: [name, result.rows[0].name], row: result.rows[0] };
  }

  return { ok: false, reason: 'Unknown panel target. Use ticket, report, birthday, application, appeal, or role.' };
}

module.exports = { updatePanelDesign, normalizeHexColor };
