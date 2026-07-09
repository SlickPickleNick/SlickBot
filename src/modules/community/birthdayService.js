const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');

const MONTH_NAMES = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BIRTHDAY_SESSIONS = new Map();

const COMMON_TIMEZONE_REFERENCES = Object.freeze([
  { label: 'Eastern Time', value: 'America/New_York', refs: 'ET / EST / EDT', aliases: ['est', 'edt', 'et', 'eastern', 'new york'] },
  { label: 'Central Time', value: 'America/Chicago', refs: 'CT / CST / CDT', aliases: ['cst', 'cdt', 'ct', 'central', 'chicago'] },
  { label: 'Mountain Time', value: 'America/Denver', refs: 'MT / MST / MDT', aliases: ['mst', 'mdt', 'mt', 'mountain', 'denver'] },
  { label: 'Pacific Time', value: 'America/Los_Angeles', refs: 'PT / PST / PDT', aliases: ['pst', 'pdt', 'pt', 'pacific', 'los angeles'] },
  { label: 'Arizona Time', value: 'America/Phoenix', refs: 'MST', aliases: ['arizona', 'phoenix'] },
  { label: 'Alaska Time', value: 'America/Anchorage', refs: 'AKT / AKST / AKDT', aliases: ['alaska', 'akst', 'akdt'] },
  { label: 'Hawaii Time', value: 'Pacific/Honolulu', refs: 'HST', aliases: ['hawaii', 'hst', 'honolulu'] },
  { label: 'Atlantic Time', value: 'America/Halifax', refs: 'AT / AST / ADT', aliases: ['atlantic', 'ast', 'adt', 'halifax'] },
  { label: 'UTC', value: 'Etc/UTC', refs: 'UTC / GMT', aliases: ['utc', 'gmt', 'zulu'] },
  { label: 'United Kingdom', value: 'Europe/London', refs: 'GMT / BST', aliases: ['uk', 'london', 'bst', 'gmt'] },
  { label: 'Central Europe', value: 'Europe/Berlin', refs: 'CET / CEST', aliases: ['cet', 'cest', 'berlin', 'europe'] },
  { label: 'India', value: 'Asia/Kolkata', refs: 'IST', aliases: ['india', 'ist', 'kolkata'] },
  { label: 'Japan', value: 'Asia/Tokyo', refs: 'JST', aliases: ['japan', 'jst', 'tokyo'] },
  { label: 'Australia Eastern', value: 'Australia/Sydney', refs: 'AEST / AEDT', aliases: ['australia', 'aest', 'aedt', 'sydney'] }
]);

function getSupportedTimezones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch (_error) {}
  return COMMON_TIMEZONE_REFERENCES.map((item) => item.value);
}

function timezoneOffsetLabel(timezone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    return offset.replace('GMT', 'UTC');
  } catch (_error) {
    return '';
  }
}

function formatTimezoneChoice(item) {
  const offset = timezoneOffsetLabel(item.value);
  return [item.label, item.refs, item.value, offset].filter(Boolean).join(' · ');
}

const TIMEZONE_CHOICES = COMMON_TIMEZONE_REFERENCES.map((item) => ({
  name: formatTimezoneChoice(item),
  value: item.value,
  aliases: item.aliases
}));

function timezoneChoicesForAutocomplete(queryText = '') {
  const q = String(queryText || '').trim().toLowerCase();
  const commonMatches = TIMEZONE_CHOICES.filter((item) => {
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.value.toLowerCase().includes(q) || item.aliases.some((alias) => alias.includes(q));
  });

  const supportedMatches = getSupportedTimezones()
    .filter((timezone) => {
      if (!q) return false;
      return timezone.toLowerCase().includes(q.replaceAll(' ', '_')) || timezone.toLowerCase().includes(q);
    })
    .map((timezone) => ({
      name: `${timezone}${timezoneOffsetLabel(timezone) ? ` · ${timezoneOffsetLabel(timezone)}` : ''}`,
      value: timezone,
      aliases: []
    }));

  const seen = new Set();
  return [...commonMatches, ...supportedMatches]
    .filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    })
    .slice(0, 25)
    .map((item) => ({ name: item.name.slice(0, 100), value: item.value }));
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

function buildBirthdayDayModal(session) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.BirthdayDayModalPrefix}${session.id}`)
    .setTitle('Set Birthday Day')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('day')
        .setLabel('Birthday day')
        .setPlaceholder('Enter a day from 1 to 31')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2)
        .setStyle(TextInputStyle.Short)
        .setValue(session.day ? String(session.day) : '')
    ));
}

function buildBirthdayTimezoneModal(session) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.BirthdayTimezoneModalPrefix}${session.id}`)
    .setTitle('Set Custom Timezone')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('timezone')
        .setLabel('IANA timezone')
        .setPlaceholder('Example: America/New_York')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(64)
        .setStyle(TextInputStyle.Short)
        .setValue(session.timezone || 'America/New_York')
    ));
}

function buildBirthdaySetupPayload(session) {
  const monthOptions = MONTH_NAMES.slice(1).map((name, index) => ({ label: name, value: String(index + 1) }));
  const timezoneOptions = TIMEZONE_CHOICES.slice(0, 25).map((item) => {
    const common = COMMON_TIMEZONE_REFERENCES.find((ref) => ref.value === item.value);
    return {
      label: item.value.slice(0, 100),
      value: item.value,
      description: [common?.refs, timezoneOffsetLabel(item.value)].filter(Boolean).join(' · ').slice(0, 100)
    };
  });

  const hasMonth = Boolean(session.month);
  const hasDay = Boolean(session.day);
  const hasTimezone = Boolean(session.timezone);
  const dateInvalid = hasMonth && hasDay && !isValidDate(session.month, session.day);
  const ready = hasMonth && hasDay && hasTimezone && !dateInvalid;

  const commonRefs = [
    'ET / EST / EDT → `America/New_York`',
    'CT / CST / CDT → `America/Chicago`',
    'MT / MST / MDT → `America/Denver`',
    'PT / PST / PDT → `America/Los_Angeles`'
  ];

  const embed = createBaseEmbed({
    title: 'Set Your Birthday',
    description: [
      'Use the controls below to save your birthday.',
      '',
      `Month: **${session.month ? MONTH_NAMES[session.month] : 'Not selected'}**`,
      `Day: **${session.day || 'Not selected'}**`,
      `Timezone: **${session.timezone || 'Not selected'}**${session.timezone ? ` · ${timezoneOffsetLabel(session.timezone)}` : ''}`,
      '',
      dateInvalid ? '**Birthday Invalid**\nThe selected month/day combination is not valid. Update the day before saving.' : null,
      '',
      '**Common timezone references**',
      ...commonRefs,
      '',
      'Use **Enter Custom Timezone** if your timezone is not listed in the dropdown.'
    ].filter((line) => line !== null).join('\n'),
    color: dateInvalid ? SlickBotColors.WARNING : ready ? SlickBotColors.SUCCESS : SlickBotColors.PRIMARY,
    footer: 'SlickBot Birthdays'
  });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayMonthPrefix}${session.id}`).setPlaceholder('Select birthday month').setMinValues(1).setMaxValues(1).addOptions(monthOptions)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${CustomIds.BirthdayTimezonePrefix}${session.id}`).setPlaceholder('Select common timezone').setMinValues(1).setMaxValues(1).addOptions(timezoneOptions)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CustomIds.BirthdayDayPrefix}${session.id}`).setLabel(session.day ? `Day: ${session.day}` : 'Enter Day').setStyle(dateInvalid ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${CustomIds.BirthdayTimezoneCustomPrefix}${session.id}`).setLabel('Enter Custom Timezone').setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CustomIds.BirthdaySavePrefix}${session.id}`).setLabel('Save Birthday').setStyle(ButtonStyle.Success).setDisabled(!ready),
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
  COMMON_TIMEZONE_REFERENCES,
  getSupportedTimezones,
  timezoneOffsetLabel,
  buildBirthdayDayModal,
  buildBirthdayTimezoneModal,
  isValidDate,
  MONTH_NAMES
};
