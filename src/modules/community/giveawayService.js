const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors, withPanelHeaderImage } = require('../ui/uiService');

function parseHexColor(color, fallback = SlickBotColors.PRIMARY) {
  const value = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return Number.parseInt(value.slice(1), 16);
  return fallback;
}

function parseDurationToMs(input) {
  const text = String(input || '').trim().toLowerCase();
  const match = text.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2][0];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

function formatDiscordTimestamp(date, style = 'R') {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

function buildGiveawayPayload(giveaway, entryCount = 0, config = null) {
  const embed = createBaseEmbed({
    title: `Giveaway: ${giveaway.prize}`,
    description: [
      giveaway.description || null,
      '',
      `Winners: **${giveaway.winner_count}**`,
      `Ends: ${formatDiscordTimestamp(giveaway.ends_at, 'R')} (${formatDiscordTimestamp(giveaway.ends_at, 'f')})`,
      `Entries: **${entryCount}**`,
      giveaway.host_user_id ? `Hosted by: <@${giveaway.host_user_id}>` : null,
      '',
      giveaway.status === 'OPEN' ? 'Use the button below to enter.' : `Status: **${giveaway.status}**`
    ].filter(Boolean).join('\n'),
    color: parseHexColor(config?.panel_color, SlickBotColors.PRIMARY),
    footer: `SlickBot Giveaways · #${giveaway.giveaway_number}`
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`slickbot:giveaway:enter:${giveaway.id}`)
      .setLabel(giveaway.status === 'OPEN' ? 'Enter Giveaway' : 'Giveaway Closed')
      .setEmoji('🎉')
      .setStyle(giveaway.status === 'OPEN' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(giveaway.status !== 'OPEN')
  );

  return withPanelHeaderImage({ embeds: [embed], components: [row] }, config?.panel_header_image_url);
}

class GiveawayService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM giveaway_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async updateConfig(guildId, input = {}) {
    const result = await query(
      `INSERT INTO giveaway_configs (guild_id, default_channel_id, host_role_id, ping_role_id, panel_color, panel_header_image_url)
       VALUES ($1, $2, $3, $4, COALESCE($5, '#7869ff'), $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         default_channel_id = COALESCE(EXCLUDED.default_channel_id, giveaway_configs.default_channel_id),
         host_role_id = COALESCE(EXCLUDED.host_role_id, giveaway_configs.host_role_id),
         ping_role_id = COALESCE(EXCLUDED.ping_role_id, giveaway_configs.ping_role_id),
         panel_color = COALESCE(EXCLUDED.panel_color, giveaway_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, giveaway_configs.panel_header_image_url),
         updated_at = NOW()
       RETURNING *`,
      [guildId, input.defaultChannelId || null, input.hostRoleId || null, input.pingRoleId || null, input.panelColor || null, input.panelHeaderImageUrl || null]
    );
    return result.rows[0];
  }

  async nextNumber(guildId) {
    const result = await query(`SELECT COALESCE(MAX(giveaway_number), 0) + 1 AS next FROM giveaways WHERE guild_id = $1`, [guildId]);
    return Number(result.rows[0]?.next || 1);
  }

  async startGiveaway({ interaction, client, logger, channel, prize, description = null, duration, winnerCount = 1 }) {
    const durationMs = parseDurationToMs(duration);
    if (!durationMs) return { ok: false, reason: 'Invalid duration. Use values like `30m`, `2h`, or `1d`.' };

    const config = await this.getConfig(interaction.guildId);
    const targetChannel = channel || (config?.default_channel_id ? await client.channels.fetch(config.default_channel_id).catch(() => null) : interaction.channel);
    if (!targetChannel || typeof targetChannel.send !== 'function') return { ok: false, reason: 'Could not resolve a valid giveaway channel.' };

    const endsAt = new Date(Date.now() + durationMs);
    const giveawayNumber = await this.nextNumber(interaction.guildId);
    const result = await query(
      `INSERT INTO giveaways (guild_id, giveaway_number, channel_id, prize, description, winner_count, host_user_id, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [interaction.guildId, giveawayNumber, targetChannel.id, prize, description, Math.max(1, Math.min(Number(winnerCount) || 1, 20)), interaction.user.id, endsAt]
    );
    const giveaway = result.rows[0];
    const payload = buildGiveawayPayload(giveaway, 0, config);
    const content = config?.ping_role_id ? `<@&${config.ping_role_id}>` : undefined;
    const messagePayload = { ...payload, allowedMentions: { roles: config?.ping_role_id ? [config.ping_role_id] : [] } };
    if (content) messagePayload.content = [payload.content, content].filter(Boolean).join('\n');
    const message = await targetChannel.send(messagePayload);
    const updated = await query(`UPDATE giveaways SET message_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [message.id, giveaway.id]);

    await logger?.log({ guildId: interaction.guildId, eventKey: 'giveaway-created', title: 'Giveaway Created', body: `Prize: **${prize}**\nChannel: <#${targetChannel.id}>\nEnds: ${formatDiscordTimestamp(endsAt, 'f')}`, actorUserId: interaction.user.id }).catch(() => {});
    return { ok: true, giveaway: updated.rows[0], channel: targetChannel };
  }

  async enterGiveaway({ interaction, giveawayId, logger }) {
    const result = await query(`SELECT * FROM giveaways WHERE guild_id = $1 AND id = $2 LIMIT 1`, [interaction.guildId, giveawayId]);
    const giveaway = result.rows[0];
    if (!giveaway || giveaway.status !== 'OPEN') return { ok: false, reason: 'This giveaway is not open.' };
    if (new Date(giveaway.ends_at).getTime() <= Date.now()) return { ok: false, reason: 'This giveaway has ended.' };

    const inserted = await query(
      `INSERT INTO giveaway_entries (giveaway_id, user_id, user_tag)
       VALUES ($1, $2, $3)
       ON CONFLICT (giveaway_id, user_id) DO NOTHING
       RETURNING *`,
      [giveaway.id, interaction.user.id, interaction.user.tag]
    );

    if (inserted.rowCount === 0) return { ok: true, alreadyEntered: true, giveaway };
    await logger?.log({ guildId: interaction.guildId, eventKey: 'giveaway-entry', title: 'Giveaway Entry', body: `<@${interaction.user.id}> entered giveaway #${giveaway.giveaway_number}.`, actorUserId: interaction.user.id }).catch(() => {});
    return { ok: true, alreadyEntered: false, giveaway };
  }

  async getEntryCount(giveawayId) {
    const result = await query(`SELECT COUNT(*)::int AS count FROM giveaway_entries WHERE giveaway_id = $1`, [giveawayId]);
    return Number(result.rows[0]?.count || 0);
  }



  async refreshGiveawayMessage(client, guildId, giveawayId) {
    const result = await query(`SELECT * FROM giveaways WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, giveawayId]);
    const giveaway = result.rows[0];
    if (!giveaway || !giveaway.channel_id || !giveaway.message_id) return { ok: false, reason: 'Giveaway message not found.' };
    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel || typeof channel.messages?.fetch !== 'function') return { ok: false, reason: 'Giveaway channel not found.' };
    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (!message || typeof message.edit !== 'function') return { ok: false, reason: 'Giveaway message not found.' };
    const entryCount = await this.getEntryCount(giveaway.id);
    await message.edit(buildGiveawayPayload(giveaway, entryCount, await this.getConfig(guildId))).catch(() => {});
    return { ok: true, entryCount };
  }

  async listActive(guildId) {
    const result = await query(`SELECT g.*, COUNT(ge.id)::int AS entry_count FROM giveaways g LEFT JOIN giveaway_entries ge ON ge.giveaway_id = g.id WHERE g.guild_id = $1 AND g.status = 'OPEN' GROUP BY g.id ORDER BY g.ends_at ASC LIMIT 10`, [guildId]);
    return result.rows;
  }

  async getByNumber(guildId, giveawayNumber) {
    const result = await query(`SELECT * FROM giveaways WHERE guild_id = $1 AND giveaway_number = $2 LIMIT 1`, [guildId, giveawayNumber]);
    return result.rows[0] || null;
  }

  async getEntries(giveawayId) {
    const result = await query(`SELECT * FROM giveaway_entries WHERE giveaway_id = $1 ORDER BY created_at ASC`, [giveawayId]);
    return result.rows;
  }

  pickWinners(entries, winnerCount, exclude = []) {
    const excluded = new Set(exclude);
    const pool = entries.filter((entry) => !excluded.has(entry.user_id));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(1, Math.min(Number(winnerCount) || 1, pool.length))).map((entry) => entry.user_id);
  }

  async endGiveaway({ client, guildId, giveawayNumber = null, giveawayId = null, actorUserId = null, logger = null, reroll = false }) {
    const result = giveawayId
      ? await query(`SELECT * FROM giveaways WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, giveawayId])
      : await query(`SELECT * FROM giveaways WHERE guild_id = $1 AND giveaway_number = $2 LIMIT 1`, [guildId, giveawayNumber]);
    const giveaway = result.rows[0];
    if (!giveaway) return { ok: false, reason: 'Giveaway not found.' };
    if (giveaway.status !== 'OPEN' && !reroll) return { ok: false, reason: 'This giveaway is already closed.' };

    const entries = await this.getEntries(giveaway.id);
    const previousWinners = Array.isArray(giveaway.winners) ? giveaway.winners : [];
    const winners = this.pickWinners(entries, giveaway.winner_count, reroll ? previousWinners : []);
    const status = entries.length ? 'ENDED' : 'ENDED_NO_ENTRIES';
    const updated = await query(
      `UPDATE giveaways SET status = $1, ended_at = NOW(), winners = $2::jsonb, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, JSON.stringify(winners), giveaway.id]
    );
    const closed = updated.rows[0];

    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel && giveaway.message_id) {
      const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      if (message) await message.edit(buildGiveawayPayload(closed, entries.length, await this.getConfig(guildId))).catch(() => {});
    }

    if (channel && typeof channel.send === 'function') {
      const winnerText = winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'No valid entries.';
      await channel.send({ embeds: [createBaseEmbed({ title: reroll ? 'Giveaway Rerolled' : 'Giveaway Ended', description: [`Prize: **${giveaway.prize}**`, `Winners: ${winnerText}`].join('\n'), color: winners.length ? SlickBotColors.SUCCESS : SlickBotColors.WARNING })] }).catch(() => {});
    }

    await logger?.log({ guildId, eventKey: reroll ? 'giveaway-rerolled' : 'giveaway-ended', title: reroll ? 'Giveaway Rerolled' : 'Giveaway Ended', body: `Giveaway #${giveaway.giveaway_number}: **${giveaway.prize}**\nWinners: ${winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'None'}`, actorUserId }).catch(() => {});
    return { ok: true, giveaway: closed, winners, entryCount: entries.length };
  }

  async processDueGiveaways(client, logger) {
    const due = await query(`SELECT * FROM giveaways WHERE status = 'OPEN' AND ends_at <= NOW() ORDER BY ends_at ASC LIMIT 25`);
    for (const giveaway of due.rows) {
      await this.endGiveaway({ client, guildId: giveaway.guild_id, giveawayId: giveaway.id, logger }).catch((error) => console.error('Failed to end giveaway:', error));
    }
  }

  async buildManagerPanel(guildId) {
    const config = await this.getConfig(guildId);
    const active = await this.listActive(guildId);
    const lines = active.length
      ? active.map((item) => `• **#${item.giveaway_number}** — ${item.prize} · ${item.entry_count} entries · ends ${formatDiscordTimestamp(item.ends_at, 'R')}`).join('\n')
      : 'No active giveaways.';
    return {
      embeds: [createBaseEmbed({
        title: 'SlickBot Giveaway Center',
        description: [
          `Default Channel: ${config?.default_channel_id ? `<#${config.default_channel_id}>` : 'Not configured'}`,
          `Ping Role: ${config?.ping_role_id ? `<@&${config.ping_role_id}>` : 'Not configured'}`,
          '',
          '**Active Giveaways**',
          lines,
          '',
          'Use `/giveaway start` to create a giveaway with automatic winner selection.'
        ].join('\n'),
        color: active.length ? SlickBotColors.SUCCESS : SlickBotColors.INFO
      })]
    };
  }
}

module.exports = {
  GiveawayService,
  buildGiveawayPayload,
  parseDurationToMs,
  formatDiscordTimestamp
};
