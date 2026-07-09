const { ChannelType } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

function renderTemplate(template, counts) {
  return String(template || '')
    .replaceAll('{members}', String(counts.members))
    .replaceAll('{humans}', String(counts.humans))
    .replaceAll('{bots}', String(counts.bots))
    .replaceAll('{voice}', String(counts.voice));
}

class ServerStatsService {
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
        input.memberTemplate || null,
        input.humanTemplate || null,
        input.botTemplate || null,
        input.voiceTemplate || null
      ]
    );
    return result.rows[0];
  }

  async counts(guild) {
    await guild.members.fetch().catch(() => null);
    const members = guild.memberCount || guild.members.cache.size;
    const humans = guild.members.cache.filter((member) => !member.user.bot).size || members;
    const bots = guild.members.cache.filter((member) => member.user.bot).size;
    const voice = guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)
      .reduce((total, channel) => total + (channel.members?.filter((member) => !member.user.bot).size || 0), 0);
    return { members, humans, bots, voice };
  }

  async updateStats(guild, logger = null, reason = 'manual') {
    const config = await this.getConfig(guild.id);
    if (!config.enabled) return { ok: false, reason: 'Server stats are disabled.' };
    const counts = await this.counts(guild);
    const updates = [
      { id: config.member_channel_id, name: renderTemplate(config.member_template || 'Members: {members}', counts), key: 'members' },
      { id: config.human_channel_id, name: renderTemplate(config.human_template || 'Humans: {humans}', counts), key: 'humans' },
      { id: config.bot_channel_id, name: renderTemplate(config.bot_template || 'Bots: {bots}', counts), key: 'bots' },
      { id: config.voice_channel_id, name: renderTemplate(config.voice_template || 'In Voice: {voice}', counts), key: 'voice' }
    ].filter((item) => item.id);

    let updated = 0;
    for (const item of updates) {
      const channel = await guild.channels.fetch(item.id).catch(() => null);
      if (!channel || typeof channel.setName !== 'function') continue;
      if (channel.name === item.name) continue;
      await channel.setName(item.name, `SlickBot server stats update: ${reason}`).catch(() => null);
      updated += 1;
    }

    await query(`UPDATE server_stats_configs SET last_updated_at = NOW(), updated_at = NOW() WHERE guild_id = $1`, [guild.id]).catch(() => {});
    await logger?.log({
      guildId: guild.id,
      eventKey: 'server-stats-update',
      title: 'Server Stats Updated',
      body: `Updated Channels: **${updated}**\nMembers: **${counts.members}**\nHumans: **${counts.humans}**\nBots: **${counts.bots}**\nIn Voice: **${counts.voice}**`,
      metadata: { counts, updated, reason }
    }).catch(() => {});

    return { ok: true, updated, counts, config };
  }

  async buildManagerPanel(guild) {
    const config = await this.getConfig(guild.id);
    const counts = await this.counts(guild).catch(() => ({ members: guild.memberCount || 0, humans: 0, bots: 0, voice: 0 }));
    const lines = [
      `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
      `Member Counter: ${config.member_channel_id ? `<#${config.member_channel_id}>` : 'Not set'} · \`${config.member_template || 'Members: {members}'}\``,
      `Human Counter: ${config.human_channel_id ? `<#${config.human_channel_id}>` : 'Not set'} · \`${config.human_template || 'Humans: {humans}'}\``,
      `Bot Counter: ${config.bot_channel_id ? `<#${config.bot_channel_id}>` : 'Not set'} · \`${config.bot_template || 'Bots: {bots}'}\``,
      `Voice Counter: ${config.voice_channel_id ? `<#${config.voice_channel_id}>` : 'Not set'} · \`${config.voice_template || 'In Voice: {voice}'}\``,
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
