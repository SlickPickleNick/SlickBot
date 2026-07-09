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

async function updatePanelDesign({ guildId, target, name = null, title = null, description = null, color = null, displayMode = null }) {
  const panelTitle = title && title.trim() ? title.trim() : null;
  const panelDescription = description && description.trim() ? description.trim() : null;
  const panelColor = color && color.trim() ? normalizeHexColor(color.trim()) : null;
  const panelDisplayMode = displayMode && String(displayMode).trim() ? (String(displayMode).trim().toUpperCase().startsWith('DROP') || String(displayMode).trim().toUpperCase() === 'SELECT' ? 'DROPDOWN' : 'BUTTONS') : null;
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

  if (key === 'application' || key === 'applications') {
    if (!name) return { ok: false, reason: 'Application panel editing requires the application type name.' };
    const result = await query(
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
    if (!result.rows[0]) return { ok: false, reason: `Application type \`${name}\` was not found.` };
    return { ok: true, target: `Application Panel: ${result.rows[0].name}`, panelType: 'application', panelRef: result.rows[0].id || name, row: result.rows[0] };
  }

  if (key === 'role' || key === 'roles' || key === 'reaction-role' || key === 'reaction-roles') {
    if (!name) return { ok: false, reason: 'Role panel editing requires the role panel name.' };
    const result = await query(
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
    if (!result.rows[0]) return { ok: false, reason: `Role panel \`${name}\` was not found.` };
    return { ok: true, target: `Role Panel: ${result.rows[0].name}`, panelType: 'role', panelRef: result.rows[0].id, row: result.rows[0] };
  }

  return { ok: false, reason: 'Unknown panel target. Use ticket, report, application, appeal, or role.' };
}

module.exports = { updatePanelDesign, normalizeHexColor };
