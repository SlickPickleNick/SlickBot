const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');

const MONTH_NAMES = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function isValidDate(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const days = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m];
}

function safeTimezone(timezone, fallback = 'America/New_York') {
  const value = String(timezone || fallback).trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

function localDateParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    localDate: `${lookup.year}-${lookup.month}-${lookup.day}`
  };
}

function formatBirthday(month, day) {
  return `${MONTH_NAMES[Number(month)] || 'Month'} ${Number(day)}`;
}

function renderTemplate(template, { user, username, server, date }) {
  return String(template || 'Happy birthday, {user}! 🎉')
    .replaceAll('{user}', user)
    .replaceAll('{username}', username)
    .replaceAll('{server}', server)
    .replaceAll('{date}', date);
}

class BirthdayService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM birthday_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];
    const created = await query(
      `INSERT INTO birthday_configs (guild_id) VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async updateConfig(guildId, input) {
    const result = await query(
      `INSERT INTO birthday_configs (guild_id, channel_id, birthday_role_id, announcement_template, timezone, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         channel_id = COALESCE(EXCLUDED.channel_id, birthday_configs.channel_id),
         birthday_role_id = COALESCE(EXCLUDED.birthday_role_id, birthday_configs.birthday_role_id),
         announcement_template = COALESCE(EXCLUDED.announcement_template, birthday_configs.announcement_template),
         timezone = COALESCE(EXCLUDED.timezone, birthday_configs.timezone),
         enabled = EXCLUDED.enabled,
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        input.channelId || null,
        input.birthdayRoleId || null,
        input.announcementTemplate || null,
        input.timezone ? safeTimezone(input.timezone) : null,
        typeof input.enabled === 'boolean' ? input.enabled : true
      ]
    );
    return result.rows[0];
  }

  async setBirthday({ guildId, user, month, day, timezone }) {
    if (!isValidDate(month, day)) return { ok: false, reason: 'Enter a valid month and day.' };
    const tz = timezone ? safeTimezone(timezone) : null;
    const result = await query(
      `INSERT INTO birthday_profiles (guild_id, user_id, user_tag, birth_month, birth_day, timezone, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         user_tag = EXCLUDED.user_tag,
         birth_month = EXCLUDED.birth_month,
         birth_day = EXCLUDED.birth_day,
         timezone = EXCLUDED.timezone,
         active = true,
         updated_at = NOW()
       RETURNING *`,
      [guildId, user.id, user.tag, Number(month), Number(day), tz]
    );
    return { ok: true, profile: result.rows[0] };
  }

  async removeBirthday(guildId, userId) {
    const result = await query(
      `UPDATE birthday_profiles SET active = false, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 RETURNING *`,
      [guildId, userId]
    );
    return result.rows[0] || null;
  }

  async getBirthday(guildId, userId) {
    const result = await query(`SELECT * FROM birthday_profiles WHERE guild_id = $1 AND user_id = $2 AND active = true LIMIT 1`, [guildId, userId]);
    return result.rows[0] || null;
  }

  async listBirthdays(guildId, limit = 20) {
    const result = await query(
      `SELECT * FROM birthday_profiles WHERE guild_id = $1 AND active = true ORDER BY birth_month ASC, birth_day ASC, user_tag ASC LIMIT $2`,
      [guildId, limit]
    );
    return result.rows;
  }

  async buildManagerPanel(guildId) {
    const [config, profiles] = await Promise.all([
      this.getConfig(guildId),
      this.listBirthdays(guildId, 10)
    ]);

    const lines = profiles.length
      ? profiles.map((profile) => `• <@${profile.user_id}> — **${formatBirthday(profile.birth_month, profile.birth_day)}**${profile.timezone ? ` · ${profile.timezone}` : ''}`).join('\n')
      : 'No birthdays have been configured by users yet.';

    const embed = createBaseEmbed({
      title: 'SlickBot Birthday Center',
      description: [
        `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
        `Announcement Channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not set'}`,
        `Birthday Role: ${config.birthday_role_id ? `<@&${config.birthday_role_id}>` : 'Not set'}`,
        `Default Timezone: **${config.timezone || 'America/New_York'}**`,
        '',
        '**Upcoming / Saved Birthdays**',
        lines,
        '',
        'Users can run `/birthday set` to save their birthday. SlickBot checks birthdays hourly and removes birthday roles after the birthday has passed in the user/configured timezone.'
      ].join('\n'),
      color: config.channel_id || config.birthday_role_id ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
    });

    return { embeds: [embed] };
  }

  async processBirthdays(client, logger) {
    const configs = await query(`SELECT * FROM birthday_configs WHERE enabled = true`).catch(() => ({ rows: [] }));
    for (const config of configs.rows) {
      const moduleConfig = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'BIRTHDAYS' LIMIT 1`, [config.guild_id]).catch(() => ({ rows: [] }));
      if (moduleConfig.rows[0]?.enabled === false) continue;
      const guild = await client.guilds.fetch(config.guild_id).catch(() => null);
      if (!guild) continue;
      const profiles = await query(`SELECT * FROM birthday_profiles WHERE guild_id = $1 AND active = true`, [config.guild_id]).catch(() => ({ rows: [] }));
      const active = await query(`SELECT * FROM birthday_active_grants WHERE guild_id = $1`, [config.guild_id]).catch(() => ({ rows: [] }));
      const activeMap = new Map(active.rows.map((row) => [`${row.user_id}:${row.local_date}`, row]));
      const activeByUser = new Map(active.rows.map((row) => [row.user_id, row]));

      for (const profile of profiles.rows) {
        const tz = safeTimezone(profile.timezone || config.timezone || 'America/New_York');
        const today = localDateParts(tz);
        const isBirthday = today.month === Number(profile.birth_month) && today.day === Number(profile.birth_day);
        const currentKey = `${profile.user_id}:${today.localDate}`;
        const previousActive = activeByUser.get(profile.user_id);

        if (isBirthday && !activeMap.has(currentKey)) {
          const member = await guild.members.fetch(profile.user_id).catch(() => null);
          if (member && config.birthday_role_id) {
            await member.roles.add(config.birthday_role_id, 'SlickBot birthday role').catch(() => {});
          }

          let announced = false;
          if (config.channel_id) {
            const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
            if (channel && typeof channel.send === 'function') {
              await channel.send(renderTemplate(config.announcement_template, {
                user: `<@${profile.user_id}>`,
                username: profile.user_tag || profile.user_id,
                server: guild.name,
                date: formatBirthday(profile.birth_month, profile.birth_day)
              })).catch(() => {});
              announced = true;
            }
          }

          await query(
            `INSERT INTO birthday_active_grants (guild_id, user_id, local_date, role_id, announced)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (guild_id, user_id, local_date) DO NOTHING`,
            [config.guild_id, profile.user_id, today.localDate, config.birthday_role_id || null, announced]
          ).catch(() => {});

          await logger?.log({
            guildId: config.guild_id,
            eventKey: 'birthday-active',
            title: 'Birthday Activated',
            body: `User: <@${profile.user_id}>\nBirthday: **${formatBirthday(profile.birth_month, profile.birth_day)}**`,
            metadata: { userId: profile.user_id, localDate: today.localDate }
          }).catch(() => {});
        }

        if (!isBirthday && previousActive) {
          const member = await guild.members.fetch(profile.user_id).catch(() => null);
          if (member && previousActive.role_id) {
            await member.roles.remove(previousActive.role_id, 'SlickBot birthday passed').catch(() => {});
          }
          await query(`DELETE FROM birthday_active_grants WHERE id = $1`, [previousActive.id]).catch(() => {});
          await logger?.log({
            guildId: config.guild_id,
            eventKey: 'birthday-ended',
            title: 'Birthday Role Removed',
            body: `User: <@${profile.user_id}>`,
            metadata: { userId: profile.user_id }
          }).catch(() => {});
        }
      }
    }
  }
}

function birthdaySavedEmbed(profile) {
  return createSuccessEmbed('Birthday Saved', `Birthday set to **${formatBirthday(profile.birth_month, profile.birth_day)}**${profile.timezone ? ` with timezone **${profile.timezone}**` : ''}.`);
}

function birthdayNotFoundEmbed() {
  return createWarningEmbed('Birthday Not Found', 'No active birthday is saved for that user.');
}

module.exports = {
  BirthdayService,
  birthdaySavedEmbed,
  birthdayNotFoundEmbed,
  formatBirthday,
  safeTimezone
};
