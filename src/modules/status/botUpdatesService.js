const { EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { SlickBotColors } = require('../ui/uiService');
const { ModuleKeys } = require('../moduleRegistry');
const packageInfo = require('../../../package.json');
const releases = require('../../data/releases.json');

function normalizeVersion(version) {
  return String(version || packageInfo.version || '').trim().replace(/^v/i, '');
}

function normalizeRoleIds(roleIds = []) {
  return [...new Set(roleIds.map((roleId) => String(roleId || '').trim()).filter(Boolean))].slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'Never';
  try {
    return `<t:${Math.floor(new Date(value).getTime() / 1000)}:R>`;
  } catch (_error) {
    return 'Unknown';
  }
}

class BotUpdatesService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM bot_update_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];
    const created = await query(
      `INSERT INTO bot_update_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async getRoleIds(guildId) {
    const result = await query(
      `SELECT role_id FROM bot_update_ping_roles WHERE guild_id = $1 ORDER BY created_at ASC`,
      [guildId]
    );
    return result.rows.map((row) => row.role_id);
  }

  async getConfigWithRoles(guildId) {
    const [config, roleIds] = await Promise.all([this.getConfig(guildId), this.getRoleIds(guildId)]);
    return { config, roleIds };
  }

  getRelease(version = packageInfo.version) {
    const normalized = normalizeVersion(version);
    return releases[normalized] || {
      title: `SlickBot v${normalized}`,
      summary: 'SlickBot has been updated to a new version.',
      notes: ['No structured patch notes were found for this version.'],
      commands: []
    };
  }

  async setup(guildId, input = {}) {
    const result = await query(
      `INSERT INTO bot_update_configs (guild_id, enabled, channel_id, ping_roles_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         channel_id = COALESCE(EXCLUDED.channel_id, bot_update_configs.channel_id),
         ping_roles_enabled = EXCLUDED.ping_roles_enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        typeof input.enabled === 'boolean' ? input.enabled : true,
        input.channelId || null,
        typeof input.pingRolesEnabled === 'boolean' ? input.pingRolesEnabled : true
      ]
    );

    const roleIds = normalizeRoleIds(input.roleIds || []);
    for (const roleId of roleIds) {
      await this.addRole(guildId, roleId);
    }

    return { config: result.rows[0], roleIds: await this.getRoleIds(guildId) };
  }

  async setChannel(guildId, channelId) {
    const result = await query(
      `INSERT INTO bot_update_configs (guild_id, channel_id, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()
       RETURNING *`,
      [guildId, channelId]
    );
    return result.rows[0];
  }

  async setEnabled(guildId, enabled) {
    const result = await query(
      `INSERT INTO bot_update_configs (guild_id, enabled)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
       RETURNING *`,
      [guildId, Boolean(enabled)]
    );
    return result.rows[0];
  }

  async setPingRolesEnabled(guildId, enabled) {
    const result = await query(
      `INSERT INTO bot_update_configs (guild_id, ping_roles_enabled)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET ping_roles_enabled = EXCLUDED.ping_roles_enabled, updated_at = NOW()
       RETURNING *`,
      [guildId, Boolean(enabled)]
    );
    return result.rows[0];
  }

  async addRole(guildId, roleId) {
    await query(
      `INSERT INTO bot_update_ping_roles (guild_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, role_id) DO NOTHING`,
      [guildId, roleId]
    );
    return this.getRoleIds(guildId);
  }

  async removeRole(guildId, roleId) {
    await query(`DELETE FROM bot_update_ping_roles WHERE guild_id = $1 AND role_id = $2`, [guildId, roleId]);
    return this.getRoleIds(guildId);
  }

  async clearRoles(guildId) {
    await query(`DELETE FROM bot_update_ping_roles WHERE guild_id = $1`, [guildId]);
    return [];
  }

  async getAnnouncement(guildId, version = packageInfo.version) {
    const result = await query(
      `SELECT * FROM bot_update_announcements WHERE guild_id = $1 AND version = $2 LIMIT 1`,
      [guildId, normalizeVersion(version)]
    );
    return result.rows[0] || null;
  }

  buildPayload({ version = packageInfo.version, config, roleIds = [], preview = false } = {}) {
    const normalized = normalizeVersion(version);
    const release = this.getRelease(normalized);
    const mentionRoleIds = config?.ping_roles_enabled === false ? [] : normalizeRoleIds(roleIds);
    const content = mentionRoleIds.length ? mentionRoleIds.map((roleId) => `<@&${roleId}>`).join(' ') : undefined;

    const noteLines = Array.isArray(release.notes) && release.notes.length
      ? release.notes.slice(0, 12).map((note) => `• ${note}`)
      : ['• No patch notes were provided for this release.'];
    const commandLines = Array.isArray(release.commands) && release.commands.length
      ? ['','**Updated Commands**', ...release.commands.slice(0, 10).map((command) => `• ${command}`)]
      : [];

    const embed = new EmbedBuilder()
      .setColor(SlickBotColors.INFO)
      .setTitle(release.title || `SlickBot v${normalized}`)
      .setDescription([
        preview ? '**Preview Only**' : '**SlickBot has been updated.**',
        release.summary || 'A new SlickBot version is now running.',
        '',
        '**Patch Notes**',
        ...noteLines,
        ...commandLines
      ].join('\n'))
      .setFooter({ text: `SlickBot Updates • v${normalized}` })
      .setTimestamp(new Date());

    return {
      content,
      embeds: [embed],
      allowedMentions: mentionRoleIds.length ? { roles: mentionRoleIds } : { parse: [] }
    };
  }

  async buildStatusPanel(guildId) {
    const { config, roleIds } = await this.getConfigWithRoles(guildId);
    const currentAnnouncement = await this.getAnnouncement(guildId, packageInfo.version);
    const lines = [
      `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
      `Update Channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not set'}`,
      `Role Pings: **${config.ping_roles_enabled ? 'Enabled' : 'Disabled'}**`,
      `Ping Roles: ${roleIds.length ? roleIds.map((roleId) => `<@&${roleId}>`).join(', ') : 'None'}`,
      `Current Version: **v${packageInfo.version}**`,
      `Current Version Announced: **${currentAnnouncement ? 'Yes' : 'No'}**${currentAnnouncement ? ` · ${formatDate(currentAnnouncement.announced_at)}` : ''}`,
      '',
      'Use `/bot-updates setup` to set the update channel and optional ping roles. Use `/bot-updates preview` before sending a release message manually.'
    ];
    return {
      embeds: [new EmbedBuilder()
        .setColor(config.enabled && config.channel_id ? SlickBotColors.SUCCESS : SlickBotColors.WARNING)
        .setTitle('SlickBot Updates Center')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'SlickBot Control Panel' })
        .setTimestamp(new Date())]
    };
  }

  async sendUpdate(guild, logger = null, options = {}) {
    const version = normalizeVersion(options.version || packageInfo.version);
    const { config, roleIds } = await this.getConfigWithRoles(guild.id);

    if (!config.enabled) return { ok: false, reason: 'Bot update announcements are disabled.' };
    if (!config.channel_id) return { ok: false, reason: 'No bot update channel is configured.' };

    const existing = await this.getAnnouncement(guild.id, version);
    if (existing && !options.force) {
      return { ok: false, reason: `SlickBot v${version} was already announced in this server.` };
    }

    const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased() || typeof channel.send !== 'function') {
      return { ok: false, reason: 'Configured bot update channel could not be found or is not sendable.' };
    }

    const message = await channel.send(this.buildPayload({ version, config, roleIds }));
    await query(
      `INSERT INTO bot_update_announcements (guild_id, version, channel_id, message_id, announced_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (guild_id, version) DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         message_id = EXCLUDED.message_id,
         announced_at = NOW()`,
      [guild.id, version, channel.id, message.id]
    );

    await logger?.log({
      guildId: guild.id,
      eventKey: 'bot-update-announcement',
      title: 'Bot Update Announced',
      body: [`Version: **v${version}**`, `Channel: <#${channel.id}>`, `Forced: **${options.force ? 'Yes' : 'No'}**`].join('\n'),
      metadata: { version, channelId: channel.id, messageId: message.id, force: Boolean(options.force) }
    }).catch(() => {});

    return { ok: true, version, channelId: channel.id, messageId: message.id };
  }

  async announceStartup(client, logger = null) {
    const results = [];
    for (const guild of client.guilds.cache.values()) {
      try {
        const moduleResult = await query(
          `SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`,
          [guild.id, ModuleKeys.BOT_UPDATES]
        );
        if (moduleResult.rows[0]?.enabled === false) {
          results.push({ guildId: guild.id, ok: false, skipped: true, reason: 'module disabled' });
          continue;
        }
        const result = await this.sendUpdate(guild, logger, { version: packageInfo.version, force: false, reason: 'startup' });
        results.push({ guildId: guild.id, ...result });
      } catch (error) {
        results.push({ guildId: guild.id, ok: false, reason: error instanceof Error ? error.message : String(error) });
        await logger?.log({
          guildId: guild.id,
          eventKey: 'bot-update-announcement-failed',
          title: 'Bot Update Announcement Failed',
          body: error instanceof Error ? error.message : String(error),
          metadata: { version: packageInfo.version }
        }).catch(() => {});
      }
    }
    return results;
  }
}

module.exports = { BotUpdatesService };
