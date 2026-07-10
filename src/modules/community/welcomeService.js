const { ChannelType } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');

function applyPlaceholders(template, member) {
  const guild = member.guild;
  return String(template || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{tag}', member.user.tag)
    .replaceAll('{server}', guild.name)
    .replaceAll('{memberCount}', String(guild.memberCount || ''))
    .replaceAll('{createdAt}', member.user.createdAt ? member.user.createdAt.toDateString() : 'Unknown');
}

async function getWelcomeConfig(guildId) {
  const result = await query(`SELECT * FROM welcome_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
  return result.rows[0] || null;
}

async function upsertWelcomeConfig({ guildId, channelId = undefined, enabled = undefined, message = undefined, title = undefined, description = undefined, color = undefined, dmEnabled = undefined, dmMessage = undefined }) {
  const existing = await getWelcomeConfig(guildId);
  const next = {
    channel_id: channelId !== undefined ? channelId : existing?.channel_id || null,
    enabled: enabled !== undefined ? enabled : existing?.enabled ?? true,
    message_template: message !== undefined ? message : existing?.message_template || 'Welcome {user} to **{server}**.',
    embed_title: title !== undefined ? title : existing?.embed_title || 'Welcome to {server}',
    embed_description: description !== undefined ? description : existing?.embed_description || 'Glad to have you here, {user}. Grab your roles and check out the server information to get started.',
    embed_color: color !== undefined ? normalizeHexColor(color) : existing?.embed_color || '#7869ff',
    dm_enabled: dmEnabled !== undefined ? dmEnabled : existing?.dm_enabled ?? false,
    dm_message_template: dmMessage !== undefined ? dmMessage : existing?.dm_message_template || 'Welcome to {server}, {username}!'
  };

  const result = await query(
    `INSERT INTO welcome_configs (guild_id, channel_id, enabled, message_template, embed_title, embed_description, embed_color, dm_enabled, dm_message_template)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (guild_id)
     DO UPDATE SET channel_id = EXCLUDED.channel_id,
                   enabled = EXCLUDED.enabled,
                   message_template = EXCLUDED.message_template,
                   embed_title = EXCLUDED.embed_title,
                   embed_description = EXCLUDED.embed_description,
                   embed_color = EXCLUDED.embed_color,
                   dm_enabled = EXCLUDED.dm_enabled,
                   dm_message_template = EXCLUDED.dm_message_template,
                   updated_at = NOW()
     RETURNING *`,
    [guildId, next.channel_id, next.enabled, next.message_template, next.embed_title, next.embed_description, next.embed_color, next.dm_enabled, next.dm_message_template]
  );
  return result.rows[0];
}

async function setWelcomeEnabled(guildId, enabled) {
  await query(
    `INSERT INTO welcome_configs (guild_id, enabled)
     VALUES ($1, $2)
     ON CONFLICT (guild_id)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [guildId, enabled]
  );
}

async function addAutoRole(guildId, roleId, addedByUserId = null) {
  await query(
    `INSERT INTO welcome_auto_roles (guild_id, role_id, added_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, role_id)
     DO UPDATE SET active = true, added_by_user_id = EXCLUDED.added_by_user_id, updated_at = NOW()`,
    [guildId, roleId, addedByUserId]
  );
}

async function removeAutoRole(guildId, roleId) {
  await query(`UPDATE welcome_auto_roles SET active = false, updated_at = NOW() WHERE guild_id = $1 AND role_id = $2`, [guildId, roleId]);
}

async function listAutoRoles(guildId) {
  const result = await query(`SELECT role_id FROM welcome_auto_roles WHERE guild_id = $1 AND active = true ORDER BY created_at ASC`, [guildId]);
  return result.rows.map((row) => row.role_id);
}

async function handleMemberJoin(member, logger) {
  const [config, roleIds] = await Promise.all([getWelcomeConfig(member.guild.id), listAutoRoles(member.guild.id)]);

  for (const roleId of roleIds) {
    await member.roles.add(roleId, 'SlickBot auto role on join').catch((error) => {
      console.error(`Failed to assign auto role ${roleId} to ${member.id}:`, error.message);
    });
  }

  if (config?.enabled && config.channel_id) {
    const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
    if (channel && channel.type !== ChannelType.DM && typeof channel.send === 'function') {
      const embed = createBaseEmbed({
        title: applyPlaceholders(config.embed_title || 'Welcome to {server}', member),
        description: applyPlaceholders(config.embed_description || 'Glad to have you here, {user}.', member),
        color: parseColor(config.embed_color) || SlickBotColors.PRIMARY,
        footer: 'SlickBot Welcome System'
      });
      const content = config.message_template ? applyPlaceholders(config.message_template, member) : null;
      await channel.send({ content, embeds: [embed] }).catch((error) => console.error('Failed to send welcome message:', error.message));
    }
  }

  if (config?.enabled && config.dm_enabled && config.dm_message_template) {
    await member.send(applyPlaceholders(config.dm_message_template, member)).catch(() => {});
  }

  if ((roleIds.length || config?.enabled) && logger) {
    await logger.log({
      guildId: member.guild.id,
      eventKey: 'welcome-member',
      title: 'Welcome Flow Completed',
      body: [`Member: ${member.user.tag} (${member.id})`, roleIds.length ? `Auto Roles: ${roleIds.map((roleId) => `<@&${roleId}>`).join(', ')}` : 'Auto Roles: None'].join('\n'),
      metadata: { userId: member.id, autoRoleIds: roleIds }
    }).catch(() => {});
  }
}

async function buildWelcomePanel(guildId) {
  const [config, roles] = await Promise.all([getWelcomeConfig(guildId), listAutoRoles(guildId)]);
  const ready = Boolean(config?.enabled && config?.channel_id);
  const embed = createBaseEmbed({
    title: 'SlickBot Welcome Center',
    description: [
      `Status: **${ready ? 'Configured' : config?.enabled === false ? 'Disabled' : 'Needs Configuration'}**`,
      `Welcome Channel: ${config?.channel_id ? `<#${config.channel_id}>` : 'Not set'}`,
      `DM Welcome: **${config?.dm_enabled ? 'Enabled' : 'Disabled'}**`,
      `Auto Roles: **${roles.length}**`,
      roles.length ? roles.map((roleId) => `• <@&${roleId}>`).join('\n') : 'No auto roles configured.',
      '',
      'Use `/welcome setup`, `/welcome auto-role-add`, and `/welcome test` to configure this module.'
    ].join('\n'),
    color: ready ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
  });
  return { embeds: [embed] };
}

function normalizeHexColor(color) {
  if (!color) return undefined;
  const value = String(color).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return undefined;
}

function parseColor(color) {
  const value = normalizeHexColor(color);
  if (!value) return null;
  return Number.parseInt(value.slice(1), 16);
}

module.exports = {
  getWelcomeConfig,
  upsertWelcomeConfig,
  setWelcomeEnabled,
  addAutoRole,
  removeAutoRole,
  listAutoRoles,
  handleMemberJoin,
  buildWelcomePanel,
  applyPlaceholders,
  parseColor
};
