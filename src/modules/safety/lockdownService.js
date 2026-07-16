const {
  ChannelType,
  PermissionFlagsBits,
  Routes
} = require('discord.js');
const { query } = require('../../services/db');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  SlickBotColors,
  ButtonStyle
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { truncate } = require('../../utils/format');

const DEFAULT_PRESET = 'Default Lockdown';
const LOCKABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildCategory
]);

const TEXT_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum
]);

const VOICE_CHANNEL_TYPES = new Set([
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice
]);

const STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  FAILED: 'FAILED'
});

function channelIsTextLike(channel) {
  return TEXT_CHANNEL_TYPES.has(channel?.type) || typeof channel?.send === 'function';
}

function channelIsVoiceLike(channel) {
  return VOICE_CHANNEL_TYPES.has(channel?.type);
}

function safeBool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function formatBool(value) {
  return value ? 'Yes' : 'No';
}

function epoch(value) {
  const d = value ? new Date(value) : new Date();
  return Math.floor(d.getTime() / 1000);
}

function channelName(channel) {
  if (!channel) return 'Unknown Channel';
  return channel.name ? `#${channel.name}` : channel.id;
}

function channelMention(channelId) {
  return channelId ? `<#${channelId}>` : 'Not configured';
}

class LockdownService {
  async ensureDefaultPreset(guildId) {
    const existing = await query(
      `SELECT * FROM lockdown_presets WHERE guild_id = $1 AND LOWER(name) = LOWER($2) AND active = true LIMIT 1`,
      [guildId, DEFAULT_PRESET]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await query(
      `INSERT INTO lockdown_presets (guild_id, name)
       VALUES ($1, $2)
       RETURNING *`,
      [guildId, DEFAULT_PRESET]
    );
    return inserted.rows[0];
  }

  async getPreset(guildId, nameOrId) {
    const value = String(nameOrId || '').trim();
    if (!value) return null;
    const result = await query(
      `SELECT * FROM lockdown_presets
       WHERE guild_id = $1 AND active = true AND (id = $2 OR LOWER(name) = LOWER($2))
       LIMIT 1`,
      [guildId, value]
    );
    return result.rows[0] || null;
  }

  async listPresets(guildId) {
    const result = await query(
      `SELECT p.*,
              COUNT(pc.id)::int AS channel_count
       FROM lockdown_presets p
       LEFT JOIN lockdown_preset_channels pc ON pc.preset_id = p.id AND pc.active = true
       WHERE p.guild_id = $1 AND p.active = true
       GROUP BY p.id
       ORDER BY LOWER(p.name) ASC`,
      [guildId]
    );
    return result.rows;
  }

  async autocompletePresets(guildId, focused) {
    const rows = await this.listPresets(guildId).catch(() => []);
    const needle = String(focused || '').toLowerCase();
    return rows
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.name} (${row.channel_count || 0} channel${row.channel_count === 1 ? '' : 's'})`.slice(0, 100), value: row.name.slice(0, 100) }));
  }

  async upsertPreset({ guildId, name, updatesChannelId, announcementTitle, announcementBody, pingRoleId }) {
    const cleanName = String(name || DEFAULT_PRESET).trim().slice(0, 80) || DEFAULT_PRESET;
    const existing = await this.getPreset(guildId, cleanName);
    const title = announcementTitle === undefined ? undefined : String(announcementTitle || '').trim().slice(0, 120) || null;
    const body = announcementBody === undefined ? undefined : String(announcementBody || '').trim().slice(0, 1500) || null;
    if (existing) {
      const updated = await query(
        `UPDATE lockdown_presets
         SET updates_channel_id = COALESCE($3, updates_channel_id),
             announcement_title = COALESCE($4, announcement_title),
             announcement_body = COALESCE($5, announcement_body),
             ping_role_id = COALESCE($6, ping_role_id),
             active = true,
             updated_at = NOW()
         WHERE id = $1 AND guild_id = $2
         RETURNING *`,
        [existing.id, guildId, updatesChannelId || null, title, body, pingRoleId || null]
      );
      return updated.rows[0];
    }
    const inserted = await query(
      `INSERT INTO lockdown_presets (guild_id, name, updates_channel_id, announcement_title, announcement_body, ping_role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [guildId, cleanName, updatesChannelId || null, title || 'Server Lockdown Active', body || defaultAnnouncementBody(), pingRoleId || null]
    );
    return inserted.rows[0];
  }

  async deletePreset(guildId, nameOrId) {
    const preset = await this.getPreset(guildId, nameOrId);
    if (!preset) return { ok: false, reason: 'That lockdown preset was not found.' };
    const active = await this.getActiveSession(guildId);
    if (active?.preset_id === preset.id) return { ok: false, reason: 'That preset is currently active. End lockdown before deleting it.' };
    await query(`UPDATE lockdown_presets SET active = false, updated_at = NOW() WHERE id = $1 AND guild_id = $2`, [preset.id, guildId]);
    return { ok: true, preset };
  }

  async addChannel({ guild, presetName, channel, denyView, denySend, denyConnect }) {
    if (!LOCKABLE_CHANNEL_TYPES.has(channel.type)) {
      throw new Error('That channel type is not supported for lockdown. Use a text, announcement, forum, voice, stage, or category channel.');
    }
    const preset = await this.getPreset(guild.id, presetName) || await this.upsertPreset({ guildId: guild.id, name: presetName || DEFAULT_PRESET });
    const useDenySend = denySend === undefined ? channelIsTextLike(channel) : Boolean(denySend);
    const useDenyConnect = denyConnect === undefined ? channelIsVoiceLike(channel) : Boolean(denyConnect);
    const useDenyView = Boolean(denyView);
    const result = await query(
      `INSERT INTO lockdown_preset_channels (guild_id, preset_id, channel_id, deny_view, deny_send, deny_connect, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (preset_id, channel_id)
       DO UPDATE SET deny_view = EXCLUDED.deny_view,
                     deny_send = EXCLUDED.deny_send,
                     deny_connect = EXCLUDED.deny_connect,
                     active = true,
                     updated_at = NOW()
       RETURNING *`,
      [guild.id, preset.id, channel.id, useDenyView, useDenySend, useDenyConnect]
    );
    return { preset, entry: result.rows[0] };
  }

  async removeChannel({ guildId, presetName, channelId }) {
    const preset = await this.getPreset(guildId, presetName);
    if (!preset) return { ok: false, reason: 'That lockdown preset was not found.' };
    const result = await query(
      `UPDATE lockdown_preset_channels
       SET active = false, updated_at = NOW()
       WHERE guild_id = $1 AND preset_id = $2 AND channel_id = $3 AND active = true
       RETURNING *`,
      [guildId, preset.id, channelId]
    );
    if (!result.rows[0]) return { ok: false, reason: 'That channel was not configured for this preset.' };
    return { ok: true, preset, entry: result.rows[0] };
  }

  async listPresetChannels(guildId, presetName) {
    const preset = await this.getPreset(guildId, presetName) || await this.ensureDefaultPreset(guildId);
    const result = await query(
      `SELECT * FROM lockdown_preset_channels
       WHERE guild_id = $1 AND preset_id = $2 AND active = true
       ORDER BY created_at ASC`,
      [guildId, preset.id]
    );
    return { preset, channels: result.rows };
  }

  async getActiveSession(guildId) {
    const result = await query(
      `SELECT * FROM lockdown_sessions
       WHERE guild_id = $1 AND status = 'ACTIVE'
       ORDER BY started_at DESC
       LIMIT 1`,
      [guildId]
    );
    return result.rows[0] || null;
  }

  async getSessionChannels(sessionId) {
    const result = await query(
      `SELECT * FROM lockdown_session_channels
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async startLockdown({ guild, presetName, actorUser, reason, logger }) {
    const active = await this.getActiveSession(guild.id);
    if (active) return { ok: false, reason: `A lockdown is already active from <t:${epoch(active.started_at)}:R>. End it before starting another.` };
    const preset = await this.getPreset(guild.id, presetName || DEFAULT_PRESET);
    if (!preset) return { ok: false, reason: 'That lockdown preset was not found.' };
    const channels = await query(
      `SELECT * FROM lockdown_preset_channels
       WHERE guild_id = $1 AND preset_id = $2 AND active = true
       ORDER BY created_at ASC`,
      [guild.id, preset.id]
    );
    if (!channels.rows.length) return { ok: false, reason: 'This preset has no controlled channels. Add channels before starting lockdown.' };

    const sessionResult = await query(
      `INSERT INTO lockdown_sessions (guild_id, preset_id, preset_name, status, started_by_user_id, reason, updates_channel_id, channel_count)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7)
       RETURNING *`,
      [guild.id, preset.id, preset.name, actorUser.id, String(reason || 'No reason provided.').slice(0, 1000), preset.updates_channel_id || null, channels.rows.length]
    );
    let session = sessionResult.rows[0];
    const everyoneId = guild.roles.everyone.id;
    const results = [];

    for (const entry of channels.rows) {
      const result = await this.applyChannelLock({ guild, session, preset, entry, everyoneId, actorUser, reason: session.reason });
      results.push(result);
    }

    const failures = results.filter((r) => !r.ok).length;
    await query(
      `UPDATE lockdown_sessions SET fail_count = $2, updated_at = NOW() WHERE id = $1`,
      [session.id, failures]
    );
    session = { ...session, fail_count: failures };

    await logger?.log?.({
      guildId: guild.id,
      eventKey: failures ? 'lockdown-error' : 'lockdown-start',
      title: failures ? 'Lockdown Started With Errors' : 'Lockdown Started',
      body: [`Preset: **${preset.name}**`, `Started By: <@${actorUser.id}>`, `Reason: ${session.reason}`, `Channels: **${results.length}**`, failures ? `Failures: **${failures}**` : null].filter(Boolean).join('\n'),
      actorUserId: actorUser.id,
      metadata: { sessionId: session.id, presetId: preset.id, failures }
    }).catch(() => {});

    return { ok: true, session, preset, results, failures };
  }

  async applyChannelLock({ guild, session, preset, entry, everyoneId, actorUser, reason }) {
    const channel = await guild.channels.fetch(entry.channel_id).catch(() => null);
    const baseRecord = {
      sessionId: session.id,
      guildId: guild.id,
      channelId: entry.channel_id,
      originalExists: false,
      originalAllow: '0',
      originalDeny: '0',
      appliedView: Boolean(entry.deny_view),
      appliedSend: Boolean(entry.deny_send),
      appliedConnect: Boolean(entry.deny_connect),
      announcementMessageId: null,
      status: 'PENDING',
      error: null
    };

    if (!channel) {
      await this.insertSessionChannel({ ...baseRecord, status: 'FAILED', error: 'Channel could not be fetched.' });
      return { ok: false, channelId: entry.channel_id, error: 'Channel could not be fetched.' };
    }

    try {
      const existing = channel.permissionOverwrites.cache.get(everyoneId);
      baseRecord.originalExists = Boolean(existing);
      baseRecord.originalAllow = existing ? existing.allow.bitfield.toString() : '0';
      baseRecord.originalDeny = existing ? existing.deny.bitfield.toString() : '0';

      const announce = await this.sendLockdownAnnouncement({ channel, preset, session, actorUser }).catch(() => null);
      if (announce?.id) baseRecord.announcementMessageId = announce.id;

      const changes = {};
      if (entry.deny_view) changes.ViewChannel = false;
      if (entry.deny_send && (channelIsTextLike(channel) || channel.type === ChannelType.GuildCategory)) {
        changes.SendMessages = false;
        changes.CreatePublicThreads = false;
        changes.CreatePrivateThreads = false;
        changes.SendMessagesInThreads = false;
      }
      if (entry.deny_connect && (channelIsVoiceLike(channel) || channel.type === ChannelType.GuildCategory)) changes.Connect = false;

      if (Object.keys(changes).length) {
        await channel.permissionOverwrites.edit(everyoneId, changes, { reason: `SlickBot lockdown: ${reason || 'No reason provided.'}` });
      }
      await this.insertSessionChannel({ ...baseRecord, status: 'LOCKED' });
      return { ok: true, channelId: channel.id, channelName: channelName(channel), announcementMessageId: baseRecord.announcementMessageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.insertSessionChannel({ ...baseRecord, status: 'FAILED', error: message });
      return { ok: false, channelId: channel.id, channelName: channelName(channel), error: message };
    }
  }

  async insertSessionChannel(data) {
    await query(
      `INSERT INTO lockdown_session_channels
       (session_id, guild_id, channel_id, original_overwrite_exists, original_allow, original_deny,
        applied_deny_view, applied_deny_send, applied_deny_connect, announcement_message_id, status, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [data.sessionId, data.guildId, data.channelId, data.originalExists, data.originalAllow, data.originalDeny, data.appliedView, data.appliedSend, data.appliedConnect, data.announcementMessageId, data.status, data.error]
    );
  }

  async sendLockdownAnnouncement({ channel, preset, session, actorUser }) {
    if (!channel || typeof channel.send !== 'function') return null;
    const updatesLine = preset.updates_channel_id
      ? `Updates will be posted in <#${preset.updates_channel_id}>.`
      : 'Staff will share updates when more information is available.';
    const embed = createBaseEmbed({
      title: preset.announcement_title || 'Server Lockdown Active',
      description: [
        preset.announcement_body || defaultAnnouncementBody(),
        '',
        updatesLine,
        '',
        `Started: <t:${epoch(session.started_at)}:f>`
      ].join('\n'),
      color: SlickBotColors.ERROR,
      footer: 'SlickBot Lockdown'
    });
    const content = preset.ping_role_id ? `<@&${preset.ping_role_id}>` : undefined;
    return channel.send({ content, embeds: [embed], allowedMentions: { roles: preset.ping_role_id ? [preset.ping_role_id] : [] } });
  }

  async endLockdown({ guild, actorUser, reason, logger }) {
    const session = await this.getActiveSession(guild.id);
    if (!session) return { ok: false, reason: 'No active lockdown was found for this server.' };
    const channels = await this.getSessionChannels(session.id);
    const everyoneId = guild.roles.everyone.id;
    const results = [];
    for (const entry of channels) {
      results.push(await this.restoreChannel({ guild, session, entry, everyoneId, reason: reason || 'Lockdown ended.' }));
    }
    const failures = results.filter((r) => !r.ok).length;
    const ended = await query(
      `UPDATE lockdown_sessions
       SET status = 'ENDED', ended_by_user_id = $3, ended_at = NOW(), end_reason = $4, fail_count = $5, updated_at = NOW()
       WHERE id = $1 AND guild_id = $2
       RETURNING *`,
      [session.id, guild.id, actorUser.id, String(reason || 'Lockdown ended.').slice(0, 1000), failures]
    );
    await logger?.log?.({
      guildId: guild.id,
      eventKey: failures ? 'lockdown-restore-error' : 'lockdown-end',
      title: failures ? 'Lockdown Ended With Restore Errors' : 'Lockdown Ended',
      body: [`Preset: **${session.preset_name}**`, `Ended By: <@${actorUser.id}>`, `Reason: ${reason || 'No reason provided.'}`, `Channels: **${channels.length}**`, failures ? `Restore Failures: **${failures}**` : null].filter(Boolean).join('\n'),
      actorUserId: actorUser.id,
      metadata: { sessionId: session.id, failures }
    }).catch(() => {});
    return { ok: true, session: ended.rows[0], results, failures };
  }

  async restoreChannel({ guild, session, entry, everyoneId, reason }) {
    const channel = await guild.channels.fetch(entry.channel_id).catch(() => null);
    if (!channel) {
      await this.markSessionChannel(entry.id, 'RESTORE_FAILED', 'Channel could not be fetched.');
      return { ok: false, channelId: entry.channel_id, error: 'Channel could not be fetched.' };
    }
    try {
      if (entry.original_overwrite_exists) {
        await channel.client.rest.put(Routes.channelPermission(channel.id, everyoneId), {
          body: { id: everyoneId, type: 0, allow: String(entry.original_allow || '0'), deny: String(entry.original_deny || '0') },
          reason: `SlickBot lockdown restore: ${reason}`
        });
      } else {
        await channel.client.rest.delete(Routes.channelPermission(channel.id, everyoneId), { reason: `SlickBot lockdown restore: ${reason}` }).catch((error) => {
          if (error?.code === 10009 || error?.status === 404) return null;
          throw error;
        });
      }
      const messageAction = await this.cleanupAnnouncement({ channel, entry, endedAt: new Date() }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
      await this.markSessionChannel(entry.id, 'RESTORED', null);
      return { ok: true, channelId: channel.id, channelName: channelName(channel), messageAction };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markSessionChannel(entry.id, 'RESTORE_FAILED', message);
      return { ok: false, channelId: channel.id, channelName: channelName(channel), error: message };
    }
  }

  async cleanupAnnouncement({ channel, entry, endedAt }) {
    if (!entry.announcement_message_id || !channel?.messages?.fetch) return null;
    const message = await channel.messages.fetch(entry.announcement_message_id).catch(() => null);
    if (!message) return null;
    const deleted = await message.delete().then(() => true).catch(() => false);
    if (deleted) return 'deleted';
    const embed = createBaseEmbed({
      title: 'Lockdown Ended',
      description: `This lockdown ended <t:${epoch(endedAt)}:R> at <t:${epoch(endedAt)}:f>.`,
      color: SlickBotColors.MUTED,
      footer: 'SlickBot Lockdown'
    });
    await message.edit({ content: '', embeds: [embed], components: [] });
    return 'edited';
  }

  async markSessionChannel(id, status, error) {
    await query(`UPDATE lockdown_session_channels SET status = $2, error = $3, restored_at = NOW() WHERE id = $1`, [id, status, error]);
  }

  async getStatus(guildId) {
    const active = await this.getActiveSession(guildId);
    const presets = await this.listPresets(guildId);
    return { active, presets };
  }

  async buildManagerPanel(guildId) {
    const { active, presets } = await this.getStatus(guildId);
    const presetLines = presets.length
      ? presets.slice(0, 10).map((preset) => `• **${preset.name}** — ${preset.channel_count || 0} controlled channel(s)${preset.updates_channel_id ? ` · updates ${channelMention(preset.updates_channel_id)}` : ''}`).join('\n')
      : 'No presets configured yet. Run `/lockdown setup` and `/lockdown channel-add`.';
    const activeLine = active
      ? [`**Active Lockdown**`, `Preset: **${active.preset_name}**`, `Started: <t:${epoch(active.started_at)}:R>`, `Reason: ${truncate(active.reason || 'No reason provided.', 300)}`].join('\n')
      : '**Active Lockdown**\nNo lockdown is currently active.';
    const embed = createBaseEmbed({
      title: 'SlickBot Safety Center',
      description: [
        '**Viewing:** Lockdown',
        '',
        activeLine,
        '',
        '**Configured Presets**',
        presetLines,
        '',
        '**How This Works**',
        'Lockdown only changes the `@everyone` permission overwrite for configured channels. SlickBot snapshots the previous overwrite before locking and restores it when lockdown ends, even after a bot restart.',
        '',
        '**Primary Commands**',
        '`/lockdown setup` · `/lockdown channel-add` · `/lockdown start` · `/lockdown end` · `/lockdown reset`'
      ].join('\n'),
      color: active ? SlickBotColors.ERROR : SlickBotColors.INFO,
      footer: 'SlickBot Lockdown'
    });
    const row = createButtonRow([
      createPanelButton(CustomIds.LockdownRefresh, 'Refresh', ButtonStyle.Primary, '🔄'),
      createPanelButton(CustomIds.ModerationRefresh, 'Moderation', ButtonStyle.Secondary),
      createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Secondary, '↩️')
    ]);
    return { embeds: [embed], components: [row] };
  }

  buildStartSummary(result) {
    const lines = result.results.slice(0, 12).map((row) => `${row.ok ? '✅' : '⚠️'} ${row.channelId ? `<#${row.channelId}>` : 'Unknown'}${row.error ? ` — ${truncate(row.error, 120)}` : ''}`);
    return createBaseEmbed({
      title: result.failures ? 'Lockdown Started With Warnings' : 'Lockdown Started',
      description: [`Preset: **${result.preset.name}**`, `Affected Channels: **${result.results.length}**`, result.failures ? `Failures: **${result.failures}**` : null, '', lines.join('\n')].filter(Boolean).join('\n'),
      color: result.failures ? SlickBotColors.WARNING : SlickBotColors.ERROR,
      footer: 'SlickBot Lockdown'
    });
  }

  buildEndSummary(result) {
    const lines = result.results.slice(0, 12).map((row) => `${row.ok ? '✅' : '⚠️'} ${row.channelId ? `<#${row.channelId}>` : 'Unknown'}${row.error ? ` — ${truncate(row.error, 120)}` : ''}`);
    return createBaseEmbed({
      title: result.failures ? 'Lockdown Ended With Warnings' : 'Lockdown Ended',
      description: [`Affected Channels: **${result.results.length}**`, result.failures ? `Restore Failures: **${result.failures}**` : null, '', lines.join('\n')].filter(Boolean).join('\n'),
      color: result.failures ? SlickBotColors.WARNING : SlickBotColors.SUCCESS,
      footer: 'SlickBot Lockdown'
    });
  }

  async buildResetConfirmation(guildId, requestedByUserId) {
    const active = await this.getActiveSession(guildId);
    if (active) return { ok: false, reason: 'A lockdown is currently active. End the active lockdown before resetting Lockdown setup.' };
    const [presetCount, channelCount, sessionCount] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM lockdown_presets WHERE guild_id = $1`, [guildId]),
      query(`SELECT COUNT(*)::int AS count FROM lockdown_preset_channels WHERE guild_id = $1`, [guildId]),
      query(`SELECT COUNT(*)::int AS count FROM lockdown_sessions WHERE guild_id = $1`, [guildId])
    ]);
    const embed = createBaseEmbed({
      title: 'Confirm Lockdown Reset',
      description: [
        'This will clear Lockdown setup and testing data for this server.',
        '',
        `Presets: **${presetCount.rows[0]?.count || 0}**`,
        `Configured Channels: **${channelCount.rows[0]?.count || 0}**`,
        `Stored Sessions: **${sessionCount.rows[0]?.count || 0}**`,
        '',
        'Existing Discord messages will not be deleted. Active lockdowns must be ended before reset.'
      ].join('\n'),
      color: SlickBotColors.ERROR,
      footer: 'SlickBot Lockdown'
    });
    const row = createButtonRow([
      createPanelButton(`${CustomIds.LockdownResetConfirmPrefix}${requestedByUserId}`, 'Confirm Reset', ButtonStyle.Danger),
      createPanelButton(`${CustomIds.LockdownResetCancelPrefix}${requestedByUserId}`, 'Cancel', ButtonStyle.Secondary)
    ]);
    return { ok: true, payload: { embeds: [embed], components: [row] } };
  }

  async resetModule(guildId) {
    const active = await this.getActiveSession(guildId);
    if (active) return { ok: false, reason: 'A lockdown is currently active. End it before resetting setup.' };
    const before = {
      presets: Number((await query(`SELECT COUNT(*)::int AS count FROM lockdown_presets WHERE guild_id = $1`, [guildId])).rows[0]?.count || 0),
      channels: Number((await query(`SELECT COUNT(*)::int AS count FROM lockdown_preset_channels WHERE guild_id = $1`, [guildId])).rows[0]?.count || 0),
      sessions: Number((await query(`SELECT COUNT(*)::int AS count FROM lockdown_sessions WHERE guild_id = $1`, [guildId])).rows[0]?.count || 0)
    };
    await query(`DELETE FROM lockdown_sessions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM lockdown_presets WHERE guild_id = $1`, [guildId]);
    return { ok: true, before };
  }

  buildResetCompletePayload(result) {
    return { embeds: [createBaseEmbed({ title: 'Lockdown Reset Complete', description: [`Presets cleared: **${result.before.presets}**`, `Configured channels cleared: **${result.before.channels}**`, `Stored sessions cleared: **${result.before.sessions}**`].join('\n'), color: SlickBotColors.SUCCESS, footer: 'SlickBot Lockdown' })], components: [] };
  }
}

function defaultAnnouncementBody() {
  return 'This server is currently in lockdown while staff respond to an active situation. Some channels may be temporarily restricted. Please avoid pinging staff unless it is urgent.';
}

module.exports = {
  LockdownService,
  DEFAULT_PRESET,
  STATUS,
  formatBool,
  defaultAnnouncementBody
};
