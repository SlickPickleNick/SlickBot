const { EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { SlickBotColors, createBaseEmbed } = require('../ui/uiService');

const DEFAULT_PREFIX = '!';
const cooldowns = new Map();

function cleanTrigger(value, prefix = DEFAULT_PREFIX) {
  let text = String(value || '').trim().toLowerCase();
  const normalizedPrefix = String(prefix || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  if (text.startsWith(normalizedPrefix.toLowerCase())) text = text.slice(normalizedPrefix.length).trim();
  if (text.startsWith('!')) text = text.slice(1).trim();
  text = text.replace(/^\/+/, '').trim();
  text = text.replace(/\s+/g, '-');
  if (!/^[a-z0-9_-]{1,32}$/.test(text)) return null;
  return text;
}

function normalizePrefix(value) {
  const text = String(value || DEFAULT_PREFIX).trim();
  if (!text) return DEFAULT_PREFIX;
  return text.slice(0, 8);
}

function parseColor(value) {
  const text = String(value || '').trim();
  if (!text) return SlickBotColors.PRIMARY;
  const normalized = text.startsWith('#') ? text.slice(1) : text;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return SlickBotColors.PRIMARY;
  return Number.parseInt(normalized, 16);
}

function normalizeColorText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text.startsWith('#') ? text.slice(1) : text;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return `#${normalized.toUpperCase()}`;
}

function truncate(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function replaceVariables(text, message, command) {
  const guildName = message.guild?.name || 'this server';
  return String(text || '')
    .replaceAll('{user}', `<@${message.author.id}>`)
    .replaceAll('{username}', message.author.username)
    .replaceAll('{server}', guildName)
    .replaceAll('{channel}', `<#${message.channelId}>`)
    .replaceAll('{command}', command.name)
    .replaceAll('{trigger}', `${command.prefix || DEFAULT_PREFIX}${command.name}`)
    .replaceAll('{uses}', String(Number(command.usage_count || 0) + 1));
}

function formatRelative(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function isChannelAllowed(command, message) {
  return !command.allowed_channel_id || command.allowed_channel_id === message.channelId;
}

function isRoleAllowed(command, message) {
  if (!command.allowed_role_id) return true;
  return Boolean(message.member?.roles?.cache?.has(command.allowed_role_id));
}

function getCooldownKey(command, userId) {
  return `${command.guild_id}:${command.id}:${userId}`;
}

class CustomCommandService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM custom_command_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];
    const created = await query(
      `INSERT INTO custom_command_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async setPrefix(guildId, prefix) {
    const normalized = normalizePrefix(prefix);
    const result = await query(
      `INSERT INTO custom_command_configs (guild_id, prefix)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET prefix = EXCLUDED.prefix, updated_at = NOW()
       RETURNING *`,
      [guildId, normalized]
    );
    return result.rows[0];
  }

  async listCommands(guildId, { includeDisabled = true, limit = 50 } = {}) {
    const result = await query(
      `SELECT cc.*, ccc.prefix
       FROM custom_commands cc
       LEFT JOIN custom_command_configs ccc ON ccc.guild_id = cc.guild_id
       WHERE cc.guild_id = $1 ${includeDisabled ? '' : 'AND cc.enabled = true'}
       ORDER BY cc.name ASC
       LIMIT $2`,
      [guildId, limit]
    );
    return result.rows.map((row) => ({ ...row, prefix: row.prefix || DEFAULT_PREFIX }));
  }

  async findCommand(guildId, inputName) {
    const config = await this.getConfig(guildId);
    const name = cleanTrigger(inputName, config.prefix);
    if (!name) return null;
    const result = await query(
      `SELECT cc.*, ccc.prefix
       FROM custom_commands cc
       LEFT JOIN custom_command_configs ccc ON ccc.guild_id = cc.guild_id
       WHERE cc.guild_id = $1 AND cc.name = $2
       LIMIT 1`,
      [guildId, name]
    );
    const row = result.rows[0];
    return row ? { ...row, prefix: row.prefix || config.prefix || DEFAULT_PREFIX } : null;
  }

  async createCommand(guildId, input = {}) {
    const config = await this.getConfig(guildId);
    const name = cleanTrigger(input.name || input.trigger, config.prefix);
    if (!name) throw new Error('Command trigger must use only letters, numbers, hyphens, or underscores and be 1-32 characters.');
    const response = String(input.response || '').trim();
    if (!response) throw new Error('A custom command response is required.');

    const result = await query(
      `INSERT INTO custom_commands (
         guild_id, name, response, embed_enabled, embed_title, embed_color,
         cooldown_seconds, allowed_channel_id, allowed_role_id, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       RETURNING *`,
      [
        guildId,
        name,
        response,
        Boolean(input.embedEnabled),
        input.embedTitle || null,
        normalizeColorText(input.embedColor) || null,
        Math.max(0, Math.min(Number(input.cooldownSeconds || 0), 86400)),
        input.allowedChannelId || null,
        input.allowedRoleId || null,
        input.actorUserId || null
      ]
    ).catch((error) => {
      if (error?.code === '23505') throw new Error(`A custom command named ${config.prefix}${name} already exists.`);
      throw error;
    });
    return { ...result.rows[0], prefix: config.prefix || DEFAULT_PREFIX };
  }

  async updateCommand(guildId, currentName, input = {}) {
    const config = await this.getConfig(guildId);
    const existing = await this.findCommand(guildId, currentName);
    if (!existing) throw new Error('That custom command was not found.');

    const nextName = input.newName ? cleanTrigger(input.newName, config.prefix) : existing.name;
    if (!nextName) throw new Error('New trigger must use only letters, numbers, hyphens, or underscores and be 1-32 characters.');

    const nextResponse = input.response == null ? existing.response : String(input.response || '').trim();
    if (!nextResponse) throw new Error('Custom command response cannot be empty.');

    const result = await query(
      `UPDATE custom_commands
       SET name = $3,
           response = $4,
           embed_enabled = $5,
           embed_title = $6,
           embed_color = $7,
           cooldown_seconds = $8,
           allowed_channel_id = $9,
           allowed_role_id = $10,
           enabled = $11,
           updated_by_user_id = $12,
           updated_at = NOW()
       WHERE guild_id = $1 AND id = $2
       RETURNING *`,
      [
        guildId,
        existing.id,
        nextName,
        nextResponse,
        input.embedEnabled == null ? existing.embed_enabled : Boolean(input.embedEnabled),
        input.clearTitle ? null : input.embedTitle == null ? existing.embed_title : input.embedTitle,
        input.clearColor ? null : input.embedColor == null ? existing.embed_color : normalizeColorText(input.embedColor),
        input.cooldownSeconds == null ? existing.cooldown_seconds : Math.max(0, Math.min(Number(input.cooldownSeconds || 0), 86400)),
        input.clearChannel ? null : input.allowedChannelId == null ? existing.allowed_channel_id : input.allowedChannelId,
        input.clearRole ? null : input.allowedRoleId == null ? existing.allowed_role_id : input.allowedRoleId,
        input.enabled == null ? existing.enabled : Boolean(input.enabled),
        input.actorUserId || null
      ]
    ).catch((error) => {
      if (error?.code === '23505') throw new Error(`A custom command named ${config.prefix}${nextName} already exists.`);
      throw error;
    });
    return { ...result.rows[0], prefix: config.prefix || DEFAULT_PREFIX };
  }

  async setEnabled(guildId, name, enabled, actorUserId = null) {
    return this.updateCommand(guildId, name, { enabled, actorUserId });
  }

  async deleteCommand(guildId, name) {
    const existing = await this.findCommand(guildId, name);
    if (!existing) throw new Error('That custom command was not found.');
    await query(`DELETE FROM custom_commands WHERE guild_id = $1 AND id = $2`, [guildId, existing.id]);
    return existing;
  }

  buildResponsePayload(command, message = null, { preview = false } = {}) {
    const responseText = message ? replaceVariables(command.response, message, command) : String(command.response || '');
    const safeMentions = { parse: [] };

    if (command.embed_enabled) {
      const embed = new EmbedBuilder()
        .setColor(parseColor(command.embed_color))
        .setTitle(truncate(command.embed_title || `${command.prefix || DEFAULT_PREFIX}${command.name}`, 256))
        .setDescription(truncate(responseText, 4096))
        .setFooter({ text: preview ? 'SlickBot Custom Command Preview' : 'SlickBot Custom Command' });
      return { embeds: [embed], allowedMentions: safeMentions };
    }

    return { content: truncate(responseText, 2000), allowedMentions: safeMentions };
  }

  async handleMessage(message, logger = null) {
    if (!message.guild || message.author?.bot) return { ok: false, reason: 'ignored' };
    const config = await this.getConfig(message.guild.id);
    if (config.enabled === false) return { ok: false, reason: 'disabled' };

    const prefix = config.prefix || DEFAULT_PREFIX;
    const content = String(message.content || '').trim();
    if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return { ok: false, reason: 'no-trigger' };

    const rawName = content.slice(prefix.length).trim().split(/\s+/)[0];
    const name = cleanTrigger(rawName, prefix);
    if (!name) return { ok: false, reason: 'invalid-trigger' };

    const command = await this.findCommand(message.guild.id, name);
    if (!command || command.enabled === false) return { ok: false, reason: 'not-found' };
    if (!isChannelAllowed(command, message)) return { ok: false, reason: 'wrong-channel' };
    if (!isRoleAllowed(command, message)) return { ok: false, reason: 'missing-role' };

    const cooldownSeconds = Number(command.cooldown_seconds || 0);
    if (cooldownSeconds > 0) {
      const key = getCooldownKey(command, message.author.id);
      const lastUsed = cooldowns.get(key) || 0;
      const now = Date.now();
      if (now - lastUsed < cooldownSeconds * 1000) return { ok: false, reason: 'cooldown' };
      cooldowns.set(key, now);
    }

    const sent = await message.channel.send(this.buildResponsePayload(command, message));
    await query(
      `UPDATE custom_commands
       SET usage_count = usage_count + 1, last_used_at = NOW(), updated_at = NOW()
       WHERE guild_id = $1 AND id = $2`,
      [message.guild.id, command.id]
    );
    await query(
      `INSERT INTO custom_command_usage_logs (guild_id, command_id, user_id, channel_id, message_id, response_message_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [message.guild.id, command.id, message.author.id, message.channelId, message.id, sent.id]
    ).catch(() => {});

    await logger?.log({
      guildId: message.guild.id,
      eventKey: 'custom-command-used',
      title: 'Custom Command Used',
      body: [`Command: **${prefix}${command.name}**`, `User: <@${message.author.id}>`, `Channel: <#${message.channelId}>`].join('\n'),
      metadata: { commandId: command.id, commandName: command.name, userId: message.author.id, channelId: message.channelId }
    }).catch(() => {});

    return { ok: true, command, message: sent };
  }

  async buildManagerPanel(guildId) {
    const config = await this.getConfig(guildId);
    const [total, enabled, used] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM custom_commands WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM custom_commands WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COALESCE(SUM(usage_count), 0)::int AS count FROM custom_commands WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const recent = await query(
      `SELECT name, usage_count, last_used_at, enabled, embed_enabled
       FROM custom_commands
       WHERE guild_id = $1
       ORDER BY COALESCE(last_used_at, created_at) DESC
       LIMIT 8`,
      [guildId]
    ).catch(() => ({ rows: [] }));

    const commandLines = recent.rows.length
      ? recent.rows.map((row) => `• **${config.prefix}${row.name}** — ${row.enabled ? 'Enabled' : 'Disabled'} · ${row.embed_enabled ? 'Embed' : 'Text'} · ${row.usage_count || 0} use(s) · Last used ${formatRelative(row.last_used_at)}`).join('\n')
      : 'No custom commands created yet.';

    return {
      embeds: [createBaseEmbed({
        title: 'Custom Commands Center',
        description: [
          `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
          `Prefix: \`${config.prefix || DEFAULT_PREFIX}\``,
          `Commands: **${enabled.rows[0]?.count || 0}/${total.rows[0]?.count || 0} enabled**`,
          `Total Uses: **${used.rows[0]?.count || 0}**`,
          '',
          '**Recent Commands**',
          commandLines,
          '',
          'Staff can create and edit commands with `/custom-command create` and `/custom-command edit`. Members can trigger enabled commands by typing the configured prefix and trigger, such as `!rules`.'
        ].join('\n'),
        color: config.enabled ? SlickBotColors.INFO : SlickBotColors.WARNING
      })]
    };
  }

  async buildCommandEmbed(guildId, name) {
    const command = await this.findCommand(guildId, name);
    if (!command) throw new Error('That custom command was not found.');
    const lines = [
      `Trigger: \`${command.prefix || DEFAULT_PREFIX}${command.name}\``,
      `Status: **${command.enabled ? 'Enabled' : 'Disabled'}**`,
      `Response Mode: **${command.embed_enabled ? 'Embed' : 'Plain Text'}**`,
      `Cooldown: **${command.cooldown_seconds || 0}s**`,
      `Allowed Channel: ${command.allowed_channel_id ? `<#${command.allowed_channel_id}>` : 'Any'}`,
      `Allowed Role: ${command.allowed_role_id ? `<@&${command.allowed_role_id}>` : 'Any'}`,
      `Uses: **${command.usage_count || 0}**`,
      `Last Used: **${formatRelative(command.last_used_at)}**`,
      '',
      '**Response**',
      truncate(command.response, 900)
    ];
    return createBaseEmbed({
      title: `Custom Command: ${command.prefix || DEFAULT_PREFIX}${command.name}`,
      description: lines.join('\n'),
      color: command.enabled ? SlickBotColors.INFO : SlickBotColors.WARNING
    });
  }

  cleanTrigger(value, prefix = DEFAULT_PREFIX) {
    return cleanTrigger(value, prefix);
  }
}

module.exports = {
  CustomCommandService,
  cleanTrigger,
  normalizePrefix
};
