const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

function normalizeHexColor(color, fallback = '#7869ff') {
  if (!color) return fallback;
  const value = String(color).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

function parseColor(color) {
  const value = normalizeHexColor(color);
  return Number.parseInt(value.slice(1), 16);
}

function buttonStyleFromHex(color) {
  // Discord buttons do not support arbitrary hex colors. SlickBot stores the
  // requested hex value, then maps it to the closest native Discord button style.
  const value = normalizeHexColor(color, '#5865f2').toLowerCase();
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  if (green > 150 && red < 150) return ButtonStyle.Success;
  if (red > 180 && green < 150 && blue < 150) return ButtonStyle.Danger;
  if (Math.max(red, green, blue) - Math.min(red, green, blue) < 30) return ButtonStyle.Secondary;
  return ButtonStyle.Primary;
}

function emojiFromHex(color) {
  const value = normalizeHexColor(color, '#5865f2').toLowerCase();
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);

  if (red > 210 && green > 210 && blue > 210) return '⬜';
  if (red < 70 && green < 70 && blue < 70) return '⬛';
  if (red > 190 && green < 120 && blue < 120) return '🟥';
  if (red > 200 && green > 120 && green < 200 && blue < 100) return '🟧';
  if (red > 190 && green > 170 && blue < 110) return '🟨';
  if (green > 150 && red < 160 && blue < 160) return '🟩';
  if (blue > 150 && red < 160) return '🟦';
  if (red > 120 && blue > 120) return '🟪';
  return '⬛';
}


async function createPanel({ guildId, name, title, description, color, mode = 'MULTI' }) {
  const result = await query(
    `INSERT INTO role_panels (guild_id, name, title, description, accent_color, mode)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (guild_id, name)
     DO UPDATE SET title = EXCLUDED.title,
                   description = EXCLUDED.description,
                   accent_color = EXCLUDED.accent_color,
                   mode = EXCLUDED.mode,
                   active = true,
                   updated_at = NOW()
     RETURNING *`,
    [guildId, name, title || name, description || 'Select a button below to toggle a role.', normalizeHexColor(color), mode]
  );
  return result.rows[0];
}

async function deletePanel(guildId, name) {
  const result = await query(`UPDATE role_panels SET active = false, updated_at = NOW() WHERE guild_id = $1 AND name = $2 RETURNING *`, [guildId, name]);
  return result.rows[0] || null;
}

async function getPanelByName(guildId, name) {
  const result = await query(`SELECT * FROM role_panels WHERE guild_id = $1 AND name = $2 AND active = true LIMIT 1`, [guildId, name]);
  return result.rows[0] || null;
}

async function getPanelById(guildId, panelId) {
  const result = await query(`SELECT * FROM role_panels WHERE guild_id = $1 AND id = $2 AND active = true LIMIT 1`, [guildId, panelId]);
  return result.rows[0] || null;
}

async function listPanels(guildId) {
  const result = await query(
    `SELECT rp.*, COUNT(rpo.id)::int AS option_count
     FROM role_panels rp
     LEFT JOIN role_panel_options rpo ON rpo.panel_id = rp.id AND rpo.active = true
     WHERE rp.guild_id = $1 AND rp.active = true
     GROUP BY rp.id
     ORDER BY rp.created_at ASC`,
    [guildId]
  );
  return result.rows;
}

async function addOption({ guildId, panelName, roleId, label = '', emoji = null, description = null, buttonColor = null }) {
  const normalizedButtonColor = normalizeHexColor(buttonColor, '#5865f2');
  const normalizedLabel = String(label || '').trim();
  const normalizedEmoji = emoji || (!normalizedLabel ? emojiFromHex(normalizedButtonColor) : null);
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const count = await query(`SELECT COUNT(*)::int AS count FROM role_panel_options WHERE panel_id = $1 AND active = true`, [panel.id]);
  const displayOrder = (count.rows[0]?.count || 0) + 1;
  const result = await query(
    `INSERT INTO role_panel_options (panel_id, role_id, label, emoji, description, button_color, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (panel_id, role_id)
     DO UPDATE SET label = EXCLUDED.label,
                   emoji = EXCLUDED.emoji,
                   description = EXCLUDED.description,
                   button_color = EXCLUDED.button_color,
                   active = true,
                   updated_at = NOW()
     RETURNING *`,
    [panel.id, roleId, normalizedLabel, normalizedEmoji, description, normalizedButtonColor, displayOrder]
  );
  return { panel, option: result.rows[0] };
}


async function bulkAddOptions({ guildId, panelName, entries }) {
  const results = [];
  for (const entry of entries) {
    const result = await addOption({
      guildId,
      panelName,
      roleId: entry.roleId,
      label: entry.label,
      emoji: entry.emoji || null,
      description: entry.description || null,
      buttonColor: entry.buttonColor || null
    });
    if (result) results.push(result.option);
  }
  return results;
}

function parseBulkEntries(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, 25).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const roleRaw = parts[0] || '';
    const roleId = (roleRaw.match(/\d{15,25}/) || [])[0];
    return {
      roleId,
      label: parts.length > 1 ? parts[1] : '',
      emoji: parts[2] || null,
      buttonColor: parts[3] || null,
      description: parts[4] || null,
      valid: Boolean(roleId)
    };
  });
}

async function removeOption({ guildId, panelName, roleId }) {
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const result = await query(`UPDATE role_panel_options SET active = false, updated_at = NOW() WHERE panel_id = $1 AND role_id = $2 RETURNING *`, [panel.id, roleId]);
  return result.rows[0] || null;
}

async function getPanelOptions(panelId) {
  const result = await query(`SELECT * FROM role_panel_options WHERE panel_id = $1 AND active = true ORDER BY display_order ASC, created_at ASC`, [panelId]);
  return result.rows;
}

async function buildRolePanelMessage(panel) {
  const options = await getPanelOptions(panel.id);
  const embed = createBaseEmbed({
    title: panel.title || panel.name,
    description: panel.description || 'Select a button below to toggle a role.',
    color: parseColor(panel.accent_color) || SlickBotColors.PRIMARY,
    footer: `SlickBot Role Panel · ${panel.mode === 'SINGLE' ? 'Single role' : 'Multi role'}`
  });

  const rows = [];
  for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
    options.slice(i, i + 5).forEach((option) => {
      const button = new ButtonBuilder()
        .setCustomId(`slickbot:rolepanel:${panel.id}:${option.id}`)
        .setStyle(buttonStyleFromHex(option.button_color || '#5865f2'));
      if (option.label && option.label.trim()) button.setLabel(option.label.trim());
      if (option.emoji) button.setEmoji(option.emoji);
      if (!option.label && !option.emoji) button.setEmoji(emojiFromHex(option.button_color || '#5865f2'));
      row.addComponents(button);
    });
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

async function toggleRole({ interaction, panelId, optionId, logger }) {
  const panel = await getPanelById(interaction.guildId, panelId);
  if (!panel) return { ok: false, reason: 'This role panel is no longer available.' };
  const options = await getPanelOptions(panel.id);
  const option = options.find((item) => item.id === optionId);
  if (!option) return { ok: false, reason: 'This role option is no longer available.' };

  const member = interaction.member;
  if (!member || !member.roles) return { ok: false, reason: 'Could not resolve your server member profile.' };
  const hasRole = member.roles.cache.has(option.role_id);

  if (panel.mode === 'SINGLE' && !hasRole) {
    for (const other of options) {
      if (other.role_id !== option.role_id && member.roles.cache.has(other.role_id)) {
        await member.roles.remove(other.role_id, 'SlickBot single-select role panel').catch(() => {});
      }
    }
  }

  if (hasRole) {
    await member.roles.remove(option.role_id, 'SlickBot role panel toggle');
  } else {
    await member.roles.add(option.role_id, 'SlickBot role panel toggle');
  }

  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'reaction-role-toggle',
    title: 'Role Panel Used',
    body: [`User: <@${interaction.user.id}>`, `Panel: **${panel.name}**`, `Role: <@&${option.role_id}>`, `Action: **${hasRole ? 'Removed' : 'Added'}**`].join('\n'),
    actorUserId: interaction.user.id,
    metadata: { panelId, optionId, roleId: option.role_id, added: !hasRole }
  }).catch(() => {});

  return { ok: true, added: !hasRole, roleId: option.role_id, panel };
}

async function buildRoleManagerPanel(guildId) {
  const panels = await listPanels(guildId);
  const lines = panels.length
    ? panels.map((panel) => `• **${panel.name}** — ${panel.option_count} option(s), ${panel.mode}`).join('\n')
    : 'No role panels configured.';
  const embed = createBaseEmbed({
    title: 'SlickBot Role Panel Center',
    description: [
      lines,
      '',
      'Use `/roles panel-wizard`, `/roles bulk-add-wizard`, and `/roles post-panel` for guided setup-channel creation.'
    ].join('\n'),
    color: panels.length ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
  });
  return { embeds: [embed] };
}

module.exports = {
  createPanel,
  deletePanel,
  getPanelByName,
  listPanels,
  addOption,
  bulkAddOptions,
  parseBulkEntries,
  removeOption,
  buildRolePanelMessage,
  toggleRole,
  buildRoleManagerPanel
};
