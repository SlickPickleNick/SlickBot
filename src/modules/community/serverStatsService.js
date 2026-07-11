const { ChannelType, PermissionsBitField } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

function renderTemplate(template, counts) {
  return String(template || '')
    .replaceAll('{members}', String(counts.members))
    .replaceAll('{humans}', String(counts.humans))
    .replaceAll('{bots}', String(counts.bots))
    .replaceAll('{voice}', String(counts.voice));
}

function channelSupportsStatsName(channel) {
  return channel && typeof channel.setName === 'function';
}

class ServerStatsService {
  constructor() {
    this.pendingUpdates = new Map();
    this.runningUpdates = new Map();
  }

  async getConfig(guildId) {
    const result = await query(`SELECT * FROM server_stats_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];
    const created = await query(
      `INSERT INTO server_stats_configs (guild_id) VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async setup(guildId, input = {}) {
    const result = await query(
      `INSERT INTO server_stats_configs (
        guild_id, enabled, member_channel_id, human_channel_id, bot_channel_id, voice_channel_id,
        member_template, human_template, bot_template, voice_template
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (guild_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         member_channel_id = COALESCE(EXCLUDED.member_channel_id, server_stats_configs.member_channel_id),
         human_channel_id = COALESCE(EXCLUDED.human_channel_id, server_stats_configs.human_channel_id),
         bot_channel_id = COALESCE(EXCLUDED.bot_channel_id, server_stats_configs.bot_channel_id),
         voice_channel_id = COALESCE(EXCLUDED.voice_channel_id, server_stats_configs.voice_channel_id),
         member_template = COALESCE(EXCLUDED.member_template, server_stats_configs.member_template),
         human_template = COALESCE(EXCLUDED.human_template, server_stats_configs.human_template),
         bot_template = COALESCE(EXCLUDED.bot_template, server_stats_configs.bot_template),
         voice_template = COALESCE(EXCLUDED.voice_template, server_stats_configs.voice_template),
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        typeof input.enabled === 'boolean' ? input.enabled : true,
        input.memberChannelId || null,
        input.humanChannelId || null,
        input.botChannelId || null,
        input.voiceChannelId || null,
        input.memberTemplate || 'Members: {members}',
        input.humanTemplate || 'Humans: {humans}',
        input.botTemplate || 'Bots: {bots}',
        input.voiceTemplate || 'In Voice: {voice}'
      ]
    );
    return result.rows[0];
  }

  shouldFetchMembers(config, options = {}) {
    if (options.forceMemberFetch) return true;
    if (options.skipMemberFetch) return false;
    return false;
  }

  async counts(guild, options = {}) {
    const config = options.config || {};
    if (this.shouldFetchMembers(config, options)) {
      await guild.members.fetch().catch(() => null);
    }

    const members = Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size;
    const cachedHumans = guild.members.cache.filter((member) => !member.user.bot).size;
    const cachedBots = guild.members.cache.filter((member) => member.user.bot).size;
    const humans = cachedHumans || Math.max(members - cachedBots, 0);
    const bots = cachedBots;
    const voice = guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
      .reduce((total, channel) => total + (channel.members?.filter((member) => !member.user.bot).size || 0), 0);
    return { members, humans, bots, voice };
  }

  scheduleUpdate(guild, logger = null, reason = 'event', delayMs = 5000, options = {}) {
    if (!guild?.id) return false;
    const existing = this.pendingUpdates.get(guild.id);
    if (existing) clearTimeout(existing.timeout);

    const timeout = setTimeout(() => {
      this.pendingUpdates.delete(guild.id);
      this.updateStats(guild, logger, reason, { ...options, skipMemberFetch: options.skipMemberFetch ?? true })
        .catch((error) => console.error(`Failed scheduled server stats update for ${guild.id}:`, error));
    }, Math.max(1000, delayMs));

    this.pendingUpdates.set(guild.id, { timeout, reason, options });
    return true;
  }

  async updateStats(guild, logger = null, reason = 'manual', options = {}) {
    if (!guild?.id) return { ok: false, reason: 'Guild is not available.' };

    const alreadyRunning = this.runningUpdates.get(guild.id);
    if (alreadyRunning) return alreadyRunning;

    const run = this._updateStats(guild, logger, reason, options).finally(() => {
      this.runningUpdates.delete(guild.id);
    });
    this.runningUpdates.set(guild.id, run);
    return run;
  }

  async _updateStats(guild, logger = null, reason = 'manual', options = {}) {
    const config = await this.getConfig(guild.id);
    if (!config.enabled) return { ok: false, reason: 'Server stats are disabled.' };
    const counts = await this.counts(guild, { ...options, config });
    const updates = [
      { id: config.member_channel_id, name: renderTemplate(config.member_template || 'Members: {members}', counts), key: 'members' },
      { id: config.human_channel_id, name: renderTemplate(config.human_template || 'Humans: {humans}', counts), key: 'humans' },
      { id: config.bot_channel_id, name: renderTemplate(config.bot_template || 'Bots: {bots}', counts), key: 'bots' },
      { id: config.voice_channel_id, name: renderTemplate(config.voice_template || 'In Voice: {voice}', counts), key: 'voice' }
    ].filter((item) => item.id);

    if (!updates.length) {
      return { ok: true, updated: 0, attempted: 0, skipped: 0, failed: 0, failures: [], counts, config, reason: 'No server stat channels are configured yet.' };
    }

    let updated = 0;
    let attempted = 0;
    let skipped = 0;
    const failures = [];
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);

    for (const item of updates) {
      const channel = await guild.channels.fetch(item.id).catch((error) => {
        failures.push({ key: item.key, channelId: item.id, reason: `Fetch failed: ${error instanceof Error ? error.message : String(error)}` });
        return null;
      });
      if (!channel) continue;
      if (!channelSupportsStatsName(channel)) {
        failures.push({ key: item.key, channelId: item.id, reason: 'Channel cannot be renamed by the bot.' });
        continue;
      }
      const permissions = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
      if (permissions && !permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        failures.push({ key: item.key, channelId: item.id, reason: 'Missing Manage Channels permission.' });
        continue;
      }
      if (channel.name === item.name) {
        skipped += 1;
        continue;
      }
      attempted += 1;
      try {
        await channel.setName(item.name, `SlickBot server stats update: ${reason}`);
        updated += 1;
      } catch (error) {
        failures.push({ key: item.key, channelId: item.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    await query(
      `UPDATE server_stats_configs
       SET last_updated_at = NOW(), last_error = $2, updated_at = NOW()
       WHERE guild_id = $1`,
      [guild.id, failures.length ? failures.map((failure) => `${failure.key}: ${failure.reason}`).join(' | ').slice(0, 1000) : null]
    ).catch(() => {});

    await logger?.log({
      guildId: guild.id,
      eventKey: failures.length ? 'server-stats-error' : 'server-stats-update',
      title: failures.length ? 'Server Stats Update Had Errors' : 'Server Stats Updated',
      body: [
        `Updated Channels: **${updated}**`,
        `Attempted Renames: **${attempted}**`,
        `Unchanged Channels: **${skipped}**`,
        `Members: **${counts.members}**`,
        `Humans: **${counts.humans}**`,
        `Bots: **${counts.bots}**`,
        `In Voice: **${counts.voice}**`,
        failures.length ? `Failures: ${failures.map((failure) => `${failure.key} (${failure.channelId}): ${failure.reason}`).join('; ')}` : null
      ].filter(Boolean).join('\n'),
      metadata: { counts, updated, attempted, skipped, failures, reason }
    }).catch(() => {});

    return { ok: failures.length === 0, updated, attempted, skipped, failed: failures.length, failures, counts, config };
  }

  async buildManagerPanel(guild) {
    const config = await this.getConfig(guild.id);
    const counts = await this.counts(guild, { config }).catch(() => ({ members: guild.memberCount || 0, humans: 0, bots: 0, voice: 0 }));
    const lines = [
      `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
      `Member Counter: ${config.member_channel_id ? `<#${config.member_channel_id}>` : 'Not set'} · \`${config.member_template || 'Members: {members}'}\``,
      `Human Counter: ${config.human_channel_id ? `<#${config.human_channel_id}>` : 'Not set'} · \`${config.human_template || 'Humans: {humans}'}\``,
      `Bot Counter: ${config.bot_channel_id ? `<#${config.bot_channel_id}>` : 'Not set'} · \`${config.bot_template || 'Bots: {bots}'}\``,
      `Voice Counter: ${config.voice_channel_id ? `<#${config.voice_channel_id}>` : 'Not set'} · \`${config.voice_template || 'In Voice: {voice}'}\``,
      `Last Update Error: ${config.last_error ? `\`${String(config.last_error).slice(0, 200)}\`` : 'None'}`,
      '',
      '**Current Counts**',
      `Members: **${counts.members}** · Humans: **${counts.humans}** · Bots: **${counts.bots}** · In Voice: **${counts.voice}**`,
      '',
      'Use `/stats setup` to configure channel counters and `/stats refresh` to update them now.'
    ];
    return { embeds: [createBaseEmbed({ title: 'SlickBot Server Stats Center', description: lines.join('\n'), color: (config.member_channel_id || config.voice_channel_id) ? SlickBotColors.SUCCESS : SlickBotColors.WARNING })] };
  }
}

module.exports = { ServerStatsService };
