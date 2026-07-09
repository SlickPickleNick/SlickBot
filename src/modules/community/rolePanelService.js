const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

function normalizeHexColor(color) {
  if (!color) return '#7869ff';
  const value = String(color).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return '#7869ff';
}

function parseColor(color) {
  const value = normalizeHexColor(color);
  return Number.parseInt(value.slice(1), 16);
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

async function addOption({ guildId, panelName, roleId, label, emoji = null, description = null }) {
  const panel = await getPanelByName(guildId, panelName);
  if (!panel) return null;
  const count = await query(`SELECT COUNT(*)::int AS count FROM role_panel_options WHERE panel_id = $1 AND active = true`, [panel.id]);
  const displayOrder = (count.rows[0]?.count || 0) + 1;
  const result = await query(
    `INSERT INTO role_panel_options (panel_id, role_id, label, emoji, description, display_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (panel_id, role_id)
     DO UPDATE SET label = EXCLUDED.label,
                   emoji = EXCLUDED.emoji,
                   description = EXCLUDED.description,
                   active = true,
                   updated_at = NOW()
     RETURNING *`,
    [panel.id, roleId, label, emoji, description, displayOrder]
  );
  return { panel, option: result.rows[0] };
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
        .setLabel(option.label || 'Toggle Role')
        .setStyle(ButtonStyle.Secondary);
      if (option.emoji) button.setEmoji(option.emoji);
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
      'Use `/roles create-panel`, `/roles add-option`, and `/roles post-panel` to create self-assignable button role panels.'
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
  removeOption,
  buildRolePanelMessage,
  toggleRole,
  buildRoleManagerPanel
};
