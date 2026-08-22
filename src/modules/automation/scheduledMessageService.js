const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');

function parseDelay(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith('m')) return amount * 60;
  if (unit.startsWith('h')) return amount * 60 * 60;
  if (unit.startsWith('d')) return amount * 24 * 60 * 60;
  if (unit.startsWith('w')) return amount * 7 * 24 * 60 * 60;
  return null;
}

function repeatSeconds(repeat) {
  const value = String(repeat || 'NONE').toUpperCase();
  if (value === 'DAILY') return 24 * 60 * 60;
  if (value === 'WEEKLY') return 7 * 24 * 60 * 60;
  return 0;
}

function formatTimestamp(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
}

async function nextNumber(guildId) {
  const result = await query(`SELECT COALESCE(MAX(schedule_number), 0) + 1 AS next FROM scheduled_messages WHERE guild_id = $1`, [guildId]);
  return Number(result.rows[0]?.next || 1);
}

class ScheduledMessageService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM scheduled_message_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];
    const created = await query(
      `INSERT INTO scheduled_message_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async updateConfig(guildId, input) {
    const result = await query(
      `INSERT INTO scheduled_message_configs (guild_id, default_channel_id, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id) DO UPDATE SET
         default_channel_id = COALESCE(EXCLUDED.default_channel_id, scheduled_message_configs.default_channel_id),
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [guildId, input.defaultChannelId || null, typeof input.enabled === 'boolean' ? input.enabled : true]
    );
    return result.rows[0];
  }

  async createScheduledMessage({ guildId, channelId, actorUserId, content, delay, repeat = 'NONE' }) {
    const seconds = parseDelay(delay);
    if (!seconds) return { ok: false, reason: 'Use a valid delay such as `30m`, `2h`, `1d`, or `1w`.' };
    const sendAt = new Date(Date.now() + seconds * 1000);
    const scheduleNumber = await nextNumber(guildId);
    const normalizedRepeat = ['NONE', 'DAILY', 'WEEKLY'].includes(String(repeat || 'NONE').toUpperCase()) ? String(repeat || 'NONE').toUpperCase() : 'NONE';
    const result = await query(
      `INSERT INTO scheduled_messages (guild_id, schedule_number, channel_id, content, status, send_at, repeat_mode, created_by_user_id)
       VALUES ($1, $2, $3, $4, 'SCHEDULED', $5, $6, $7)
       RETURNING *`,
      [guildId, scheduleNumber, channelId, content, sendAt.toISOString(), normalizedRepeat, actorUserId]
    );
    return { ok: true, schedule: result.rows[0] };
  }

  async listScheduled(guildId, limit = 10) {
    const result = await query(
      `SELECT * FROM scheduled_messages
       WHERE guild_id = $1 AND status = 'SCHEDULED'
       ORDER BY send_at ASC
       LIMIT $2`,
      [guildId, limit]
    );
    return result.rows;
  }

  async getByNumber(guildId, scheduleNumber) {
    const result = await query(`SELECT * FROM scheduled_messages WHERE guild_id = $1 AND schedule_number = $2 LIMIT 1`, [guildId, Number(scheduleNumber)]);
    return result.rows[0] || null;
  }

  async cancel(guildId, scheduleNumber, actorUserId = null) {
    const result = await query(
      `UPDATE scheduled_messages
       SET status = 'CANCELLED', cancelled_by_user_id = $3, updated_at = NOW()
       WHERE guild_id = $1 AND schedule_number = $2 AND status = 'SCHEDULED'
       RETURNING *`,
      [guildId, Number(scheduleNumber), actorUserId]
    );
    return result.rows[0] || null;
  }

  async markSent(schedule) {
    const repeat = repeatSeconds(schedule.repeat_mode);
    if (repeat > 0) {
      const next = new Date(new Date(schedule.send_at).getTime() + repeat * 1000);
      const now = Date.now();
      while (next.getTime() <= now) next.setSeconds(next.getSeconds() + repeat);
      const result = await query(
        `UPDATE scheduled_messages
         SET send_at = $2, last_sent_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [schedule.id, next.toISOString()]
      );
      return result.rows[0];
    }
    const result = await query(
      `UPDATE scheduled_messages
       SET status = 'SENT', last_sent_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [schedule.id]
    );
    return result.rows[0];
  }

  async sendSchedule(client, schedule, logger = null, actorUserId = null) {
    const guild = await client.guilds.fetch(schedule.guild_id).catch(() => null);
    const channel = await client.channels.fetch(schedule.channel_id).catch(() => null);
    if (!guild || !channel || typeof channel.send !== 'function') {
      if (!schedule.repeat_mode || schedule.repeat_mode === 'NONE') {
        await query(`UPDATE scheduled_messages SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [schedule.id]).catch(() => {});
      } else {
        await this.markSent(schedule).catch(() => {});
      }
      return { ok: false, reason: 'Configured channel is no longer available.' };
    }
    await channel.send({ content: schedule.content });
    const updated = await this.markSent(schedule);
    await logger?.log({
      guildId: schedule.guild_id,
      eventKey: 'scheduled-messages',
      title: schedule.repeat_mode && schedule.repeat_mode !== 'NONE' ? 'Recurring Scheduled Message Sent' : 'Scheduled Message Sent',
      body: `Schedule #${schedule.schedule_number} sent in <#${schedule.channel_id}>.`,
      actorUserId: actorUserId || schedule.created_by_user_id || null,
      metadata: { scheduleId: schedule.id, repeatMode: schedule.repeat_mode }
    }).catch(() => {});
    return { ok: true, schedule: updated, channel };
  }

  async sendNow({ client, guildId, scheduleNumber, actorUserId, logger }) {
    const schedule = await this.getByNumber(guildId, scheduleNumber);
    if (!schedule || schedule.status !== 'SCHEDULED') return { ok: false, reason: 'That scheduled message was not found or is not active.' };
    return this.sendSchedule(client, schedule, logger, actorUserId);
  }

  async processDue(client, logger = null) {
    const result = await query(
      `SELECT sm.* FROM scheduled_messages sm
       JOIN module_configs mc ON mc.guild_id = sm.guild_id AND mc.module_key = 'SCHEDULED_MESSAGES' AND mc.enabled = true
       WHERE sm.status = 'SCHEDULED' AND sm.send_at <= NOW()
       ORDER BY sm.send_at ASC
       LIMIT 25`
    ).catch(() => ({ rows: [] }));

    for (const schedule of result.rows) {
      await this.sendSchedule(client, schedule, logger).catch(async (error) => {
        await logger?.log({ guildId: schedule.guild_id, eventKey: 'scheduled-messages', title: 'Scheduled Message Failed', body: `Schedule #${schedule.schedule_number} failed: ${error.message || error}` }).catch(() => {});
      });
    }
  }

  async buildManagerPanel(guildId) {
    const [rawConfig, schedules] = await Promise.all([this.getConfig(guildId), this.listScheduled(guildId, 8)]);
    const config = rawConfig || {};
    const enabled = config?.enabled ?? false;
    const ready = Boolean(enabled && (config?.default_channel_id || schedules.length));

    const lines = schedules.length
      ? schedules.map((schedule) => `• **#${schedule.schedule_number}** → <#${schedule.channel_id}> · ${formatTimestamp(schedule.send_at)}${schedule.repeat_mode && schedule.repeat_mode !== 'NONE' ? ` · \`${schedule.repeat_mode}\`` : ''}`).join('\n')
      : '*No active scheduled messages.*';

    const embed = createBaseEmbed({
      title: 'SlickBot Scheduled Messages',
      description: [
        `Status: **${ready ? '🟢 Active & Running' : !enabled ? '⏸️ Disabled' : '⚠️ Needs Default Channel'}**`,
        `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : '*Not set (use `/schedule setup`)*'}`,
        `Upcoming Messages: **${schedules.length} scheduled**`,
        '',
        '**Upcoming Schedules**',
        lines,
        '',
        'Click **Schedule Message** to create an automated scheduled or recurring message.'
      ].join('\n'),
      color: ready ? SlickBotColors.SUCCESS : SlickBotColors.PRIMARY
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.ScheduledMessagesCreateModal)
        .setLabel('Schedule Message')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📅'),
      new ButtonBuilder()
        .setCustomId(CustomIds.ScheduledMessagesToggle)
        .setLabel(enabled ? 'Disable Scheduler' : 'Enable Scheduler')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(enabled ? '⏸️' : '▶️')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingModulePrefix}SCHEDULED_MESSAGES`)
        .setLabel('Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(CustomIds.ScheduledMessagesRefresh)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryAutomation)
        .setLabel('Automation')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row1, row2] };
  }
}

function buildScheduledMessageCreateModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.ScheduledMessagesCreateModalSubmit)
    .setTitle('Schedule a Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message Content')
          .setPlaceholder('Example: Community reminder! Event starting soon.')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('delay')
          .setLabel('Send In (Delay from now)')
          .setPlaceholder('Example: 30m, 2h, 1d, 1w')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(32)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('repeat')
          .setLabel('Repeat Mode (NONE, DAILY, WEEKLY)')
          .setPlaceholder('NONE')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(false)
          .setValue('NONE')
      )
    );
}

module.exports = {
  ScheduledMessageService,
  parseDelay,
  formatTimestamp,
  repeatSeconds,
  buildScheduledMessageCreateModal
};
