const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');

const MONTH_NAMES = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BIRTHDAY_SESSIONS = new Map();

const TIMEZONE_CHOICES = Object.freeze([
  { name: 'Eastern Time (ET / EST / EDT) — America/New_York', value: 'America/New_York', aliases: ['est', 'edt', 'et', 'eastern'] },
  { name: 'Central Time (CT / CST / CDT) — America/Chicago', value: 'America/Chicago', aliases: ['cst', 'cdt', 'ct', 'central'] },
  { name: 'Mountain Time (MT / MST / MDT) — America/Denver', value: 'America/Denver', aliases: ['mst', 'mdt', 'mt', 'mountain'] },
  { name: 'Pacific Time (PT / PST / PDT) — America/Los_Angeles', value: 'America/Los_Angeles', aliases: ['pst', 'pdt', 'pt', 'pacific'] },
  { name: 'Arizona Time (MST) — America/Phoenix', value: 'America/Phoenix', aliases: ['arizona', 'phoenix'] },
  { name: 'Alaska Time (AKT / AKST / AKDT) — America/Anchorage', value: 'America/Anchorage', aliases: ['alaska', 'akst', 'akdt'] },
  { name: 'Hawaii Time (HST) — Pacific/Honolulu', value: 'Pacific/Honolulu', aliases: ['hawaii', 'hst'] },
  { name: 'Atlantic Time (AT / AST / ADT) — America/Halifax', value: 'America/Halifax', aliases: ['atlantic', 'ast', 'adt'] },
  { name: 'UTC — Etc/UTC', value: 'Etc/UTC', aliases: ['utc', 'gmt'] },
  { name: 'United Kingdom (GMT / BST) — Europe/London', value: 'Europe/London', aliases: ['uk', 'london', 'bst', 'gmt'] },
  { name: 'Central Europe (CET / CEST) — Europe/Berlin', value: 'Europe/Berlin', aliases: ['cet', 'cest', 'berlin', 'europe'] },
  { name: 'India (IST) — Asia/Kolkata', value: 'Asia/Kolkata', aliases: ['india', 'ist', 'kolkata'] },
  { name: 'Japan (JST) — Asia/Tokyo', value: 'Asia/Tokyo', aliases: ['japan', 'jst', 'tokyo'] },
  { name: 'Australia Eastern — Australia/Sydney', value: 'Australia/Sydney', aliases: ['australia', 'aest', 'aedt', 'sydney'] }
]);

function timezoneChoicesForAutocomplete(queryText = '') {
  const q = String(queryText || '').trim().toLowerCase();
  const matched = TIMEZONE_CHOICES.filter((item) => {
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.value.toLowerCase().includes(q) || item.aliases.some((alias) => alias.includes(q));
  });
  return matched.slice(0, 25).map((item) => ({ name: item.name.slice(0, 100), value: item.value }));
}

function isValidDate(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const days = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m];
}

function safeTimezone(timezone, fallback = 'America/New_York') {
  const value = String(timezone || fallback).trim().replace('America/NewYork', 'America/New_York');
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

function parseHexColor(color, fallback = SlickBotColors.PRIMARY) {
  const value = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return Number.parseInt(value.slice(1), 16);
  return fallback;
}

function makeSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of BIRTHDAY_SESSIONS) {
    if (now - session.createdAt > 15 * 60 * 1000) BIRTHDAY_SESSIONS.delete(id);
  }
}

function createSession({ guildId, userId, defaultTimezone = 'America/New_York' }) {
  cleanupSessions();
  const id = makeSessionId();
  const session = { id, guildId, userId, month: null, day: null, timezone: safeTimezone(defaultTimezone), createdAt: Date.now() };
  BIRTHDAY_SESSIONS.set(id, session);
  return session;
}

function getSession(sessionId, userId = null) {
  cleanupSessions();
  const session = BIRTHDAY_SESSIONS.get(sessionId);
  if (!session) return null;
  if (userId && session.userId !== userId) return null;
  return session;
}

function buildBirthdaySetupPayload(session) {
  const monthOptions = MONTH_NAMES.slice(1).map((name, index) => ({ label: name, value: String(index + 1) }));
  const dayOptionsA = Array.from({ length: 25 }, (_, index) => ({ label: String(index + 1), value: String(index + 1) }));
  const dayOptionsB = Array.from({ length: 6 }, (_, index) => ({ label: String(index + 26), value: String(index + 26) }));
  const timezoneOptions = TIMEZONE_CHOICES.slice(0, 25).map((item) => ({ label: item.value, value: item.value, description: item.name.replace(` — ${item.value}`, '').slice(0, 100) }));

  const embed = createBaseEmbed({
    title: 'Set Your Birthday',
    description: [
      'Use the dropdowns below to save your birthday.',
      '',
      `Month: **${session.month ? MONTH_NAMES[session.month] : 'Not selected'}**`,
      `Day: **${session.day || 'Not selected'}**`,
      `Timezone: **${session.timezone || 'Not selected'}**`,
      '',
      '**Common timezone references**',
      'ET / EST / EDT → `America/New_York`',
      'CT / CST / CDT → `America/Chicago`',
      'MT / MST / MDT → `America/Denver`',
      'PT / PST / PDT → `America/Los_Angeles`'
    ].join('\n'),
    color: session.month && session.day && session.timezone ? SlickBotColors.SUCCESS : SlickBotColors.PRIMARY,
    footer: 'SlickBot Birthdays'
  });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayMonthPrefix}${session.id}`).setPlaceholder('Select birthday month').setMinValues(1).setMaxValues(1).addOptions(monthOptions)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayDayPrefix}${session.id}:a`).setPlaceholder('Select birthday day: 1–25').setMinValues(1).setMaxValues(1).addOptions(dayOptionsA)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayDayPrefix}${session.id}:b`).setPlaceholder('Select birthday day: 26–31').setMinValues(1).setMaxValues(1).addOptions(dayOptionsB)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayTimezonePrefix}${session.id}`).setPlaceholder('Select timezone').setMinValues(1).setMaxValues(1).addOptions(timezoneOptions)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CustomIds.BirthdaySavePrefix}${session.id}`).setLabel('Save Birthday').setStyle(ButtonStyle.Success).setDisabled(!(session.month && session.day && session.timezone)),
        new ButtonBuilder().setCustomId(`${CustomIds.BirthdayCancelPrefix}${session.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildBirthdayPublicPanel(config) {
  const embed = createBaseEmbed({
    title: config?.panel_title || 'Set Your Birthday',
    description: config?.panel_description || 'Save your birthday so the server can celebrate with you.',
    color: parseHexColor(config?.panel_color, SlickBotColors.PRIMARY),
    footer: 'SlickBot Birthdays'
  });
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CustomIds.BirthdaySetOpen).setLabel('Set Birthday').setStyle(ButtonStyle.Primary))]
  };
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

  createSetupSession({ guildId, userId, defaultTimezone }) {
    return createSession({ guildId, userId, defaultTimezone });
  }

  getSetupSession(sessionId, userId = null) {
    return getSession(sessionId, userId);
  }

  buildSetupSessionPayload(session) {
    return buildBirthdaySetupPayload(session);
  }

  updateSetupSession(session, patch) {
    Object.assign(session, patch);
    session.updatedAt = Date.now();
    BIRTHDAY_SESSIONS.set(session.id, session);
    return session;
  }

  cancelSetupSession(sessionId) {
    return BIRTHDAY_SESSIONS.delete(sessionId);
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

  async listBirthdays(guildId, limit = 100, month = null) {
    if (month && month !== 'ALL') {
      const result = await query(
        `SELECT * FROM birthday_profiles WHERE guild_id = $1 AND active = true AND birth_month = $2 ORDER BY birth_day ASC, user_tag ASC LIMIT $3`,
        [guildId, Number(month), limit]
      );
      return result.rows;
    }
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
        'Users can run `/birthday set` or use a birthday panel to save their birthday.'
      ].join('\n'),
      color: config.channel_id || config.birthday_role_id ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
    });

    return { embeds: [embed] };
  }

  async buildListPanel(guildId, selected = 'ALL') {
    const month = selected === 'ALL' ? null : Number(selected);
    const profiles = await this.listBirthdays(guildId, 100, month);
    const monthLabel = selected === 'ALL' ? 'Full Year' : MONTH_NAMES[Number(selected)];
    const lines = profiles.length
      ? profiles.map((profile) => `• <@${profile.user_id}> — **${formatBirthday(profile.birth_month, profile.birth_day)}**${profile.timezone ? ` · ${profile.timezone}` : ''}`).join('\n')
      : `No birthdays saved for **${monthLabel}**.`;

    const options = [
      { label: 'Full Year', value: 'ALL', description: 'Show all saved birthdays' },
      ...MONTH_NAMES.slice(1).map((name, index) => ({ label: name, value: String(index + 1), description: `Show ${name} birthdays` }))
    ];

    return {
      embeds: [createBaseEmbed({
        title: `Saved Birthdays — ${monthLabel}`,
        description: [
          lines,
          profiles.length >= 100 ? '' : null,
          profiles.length >= 100 ? 'Only the first 100 saved birthdays are shown.' : null
        ].filter(Boolean).join('\n'),
        color: profiles.length ? SlickBotColors.SUCCESS : SlickBotColors.INFO,
        footer: 'Use the dropdown below to switch views.'
      })],
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(CustomIds.BirthdayListSelect)
          .setPlaceholder('Choose full year or a month')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options)
      )]
    };
  }

  async buildPublicPanel(guildId) {
    const config = await this.getConfig(guildId);
    return buildBirthdayPublicPanel(config);
  }

  async sendTestBirthday({ guild, channel, user, logger, actorUserId }) {
    const config = await this.getConfig(guild.id);
    const targetChannel = channel || (config.channel_id ? await guild.channels.fetch(config.channel_id).catch(() => null) : null);
    if (!targetChannel || typeof targetChannel.send !== 'function') return { ok: false, reason: 'No valid birthday announcement channel is configured or selected.' };
    const profile = await this.getBirthday(guild.id, user.id);
    const date = profile ? formatBirthday(profile.birth_month, profile.birth_day) : 'Test Birthday';
    await targetChannel.send(renderTemplate(config.announcement_template, {
      user: `<@${user.id}>`,
      username: user.tag || user.username || user.id,
      server: guild.name,
      date
    }));
    await logger?.log({ guildId: guild.id, eventKey: 'birthday-config', title: 'Birthday Test Sent', body: `Test User: <@${user.id}>\nChannel: <#${targetChannel.id}>`, actorUserId }).catch(() => {});
    return { ok: true, channel: targetChannel };
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
  safeTimezone,
  timezoneChoicesForAutocomplete,
  TIMEZONE_CHOICES,
  MONTH_NAMES
};
