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

async function updatePanelDesign({ guildId, target, name = null, title = null, description = null, color = null, headerImageUrl = null, displayMode = null, createIfMissing = false }) {
  const panelTitle = title && title.trim() ? title.trim() : null;
  const panelDescription = description && description.trim() ? description.trim() : null;
  const panelColor = color && color.trim() ? normalizeHexColor(color.trim()) : null;
  const normalizedHeaderImageUrl = headerImageUrl && String(headerImageUrl).trim() ? String(headerImageUrl).trim() : null;
  const normalizedDisplayInput = displayMode && String(displayMode).trim() ? String(displayMode).trim().toUpperCase() : null;
  const panelDisplayMode = normalizedDisplayInput
    ? (normalizedDisplayInput.startsWith('REACT') || normalizedDisplayInput === 'EMOJI' || normalizedDisplayInput === 'EMOJIS'
      ? 'REACTIONS'
      : (normalizedDisplayInput.startsWith('DROP') || normalizedDisplayInput === 'SELECT' || normalizedDisplayInput === 'SELECT_MENU' ? 'DROPDOWN' : 'BUTTONS'))
    : null;
  const key = normalizeTarget(target);

  if (key === 'ticket' || key === 'tickets') {
    const result = await query(
      `INSERT INTO ticket_configs (guild_id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, ticket_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, ticket_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, ticket_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, ticket_configs.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, ticket_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
    );
    return { ok: true, target: 'Ticket Panel', panelType: 'ticket', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'report' || key === 'reports') {
    const result = await query(
      `INSERT INTO report_configs (guild_id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, report_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, report_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, report_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, report_configs.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, report_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
    );
    return { ok: true, target: 'Report Panel', panelType: 'report', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'appeal' || key === 'appeals') {
    const result = await query(
      `INSERT INTO appeal_configs (guild_id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, appeal_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, appeal_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, appeal_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, appeal_configs.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, appeal_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode`,
      [guildId, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
    );
    return { ok: true, target: 'Appeal Panel', panelType: 'appeal', panelRef: '*', row: result.rows[0] };
  }


  if (key === 'birthday' || key === 'birthdays') {
    const result = await query(
      `INSERT INTO birthday_configs (guild_id, panel_title, panel_description, panel_color, panel_header_image_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         panel_title = COALESCE(EXCLUDED.panel_title, birthday_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, birthday_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, birthday_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, birthday_configs.panel_header_image_url),
         updated_at = NOW()
       RETURNING panel_title, panel_description, panel_color, panel_header_image_url`,
      [guildId, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl]
    );
    return { ok: true, target: 'Birthday Panel', panelType: 'birthday', panelRef: '*', row: result.rows[0] };
  }

  if (key === 'application' || key === 'applications') {
    if (!name) return { ok: false, reason: 'Application panel editing requires the application type name.' };
    let result;
    if (createIfMissing) {
      result = await query(
        `INSERT INTO application_types (guild_id, name, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode, enabled)
         VALUES ($1, $2, COALESCE($3, $2), $4, $5, $6, COALESCE($7, 'BUTTONS'), true)
         ON CONFLICT (guild_id, name) DO UPDATE SET
           panel_title = COALESCE(EXCLUDED.panel_title, application_types.panel_title),
           panel_description = COALESCE(EXCLUDED.panel_description, application_types.panel_description),
           panel_color = COALESCE(EXCLUDED.panel_color, application_types.panel_color),
           panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, application_types.panel_header_image_url),
           panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, application_types.panel_display_mode),
           enabled = true,
           updated_at = NOW()
         RETURNING id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
      );
    } else {
      result = await query(
        `UPDATE application_types SET
           panel_title = COALESCE($3, panel_title),
           panel_description = COALESCE($4, panel_description),
           panel_color = COALESCE($5, panel_color),
           panel_header_image_url = COALESCE($6, panel_header_image_url),
           panel_display_mode = COALESCE($7, panel_display_mode),
           updated_at = NOW()
         WHERE guild_id = $1 AND LOWER(name) = LOWER($2)
         RETURNING id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
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
        `INSERT INTO role_panels (guild_id, name, title, description, accent_color, mode, panel_header_image_url, panel_display_mode, active)
         VALUES ($1, $2, COALESCE($3, $2), COALESCE($4, 'Select an option below to toggle a role.'), COALESCE($5, '#7869ff'), 'MULTI', $6, COALESCE($7, 'BUTTONS'), true)
         ON CONFLICT (guild_id, name) DO UPDATE SET
           title = COALESCE(EXCLUDED.title, role_panels.title),
           description = COALESCE(EXCLUDED.description, role_panels.description),
           accent_color = COALESCE(EXCLUDED.accent_color, role_panels.accent_color),
           panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, role_panels.panel_header_image_url),
           panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, role_panels.panel_display_mode),
           active = true,
           updated_at = NOW()
         RETURNING id, title, description, accent_color, panel_header_image_url, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
      );
    } else {
      result = await query(
        `UPDATE role_panels SET
           title = COALESCE($3, title),
           description = COALESCE($4, description),
           accent_color = COALESCE($5, accent_color),
           panel_header_image_url = COALESCE($6, panel_header_image_url),
           panel_display_mode = COALESCE($7, panel_display_mode),
           updated_at = NOW()
         WHERE guild_id = $1 AND LOWER(name) = LOWER($2) AND active = true
         RETURNING id, title, description, accent_color, panel_header_image_url, panel_display_mode, name`,
        [guildId, name, panelTitle, panelDescription, panelColor, normalizedHeaderImageUrl, panelDisplayMode]
      );
    }
    if (!result.rows[0]) return { ok: false, reason: `Role panel \`${name}\` was not found.` };
    return { ok: true, target: `Role Panel: ${result.rows[0].name}`, panelType: 'role', panelRef: result.rows[0].id, altPanelRefs: [name, result.rows[0].name], row: result.rows[0] };
  }

  return { ok: false, reason: 'Unknown panel target. Use ticket, report, birthday, application, appeal, or role.' };
}

module.exports = { updatePanelDesign, normalizeHexColor };
