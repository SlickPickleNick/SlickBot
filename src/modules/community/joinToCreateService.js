const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { query } = require('../../services/db');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  ButtonStyle,
  SlickBotColors
} = require('../ui/uiService');

const JoinToCreateIds = Object.freeze({
  Refresh: 'slickbot:join-to-create:refresh'
});

function clampInt(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function sanitizeRoomName(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 100);
}

function formatRoomName(template, member) {
  const displayName = member?.displayName || member?.user?.globalName || member?.user?.username || 'Member';
  const username = member?.user?.username || displayName;
  const formatted = String(template || "{displayname}'s Room")
    .replaceAll('{displayname}', displayName)
    .replaceAll('{display_name}', displayName)
    .replaceAll('{username}', username)
    .replaceAll('{user}', username);
  return sanitizeRoomName(formatted) || `${sanitizeRoomName(displayName) || 'Member'}'s Room`;
}

async function ensureJoinToCreateSchema(queryFn = query) {
  await queryFn(`
    CREATE TABLE IF NOT EXISTS join_to_create_configs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT true,
      trigger_channel_id TEXT,
      category_id TEXT,
      name_template TEXT NOT NULL DEFAULT '{displayname}''s Room',
      user_limit INTEGER NOT NULL DEFAULT 0,
      bitrate_kbps INTEGER,
      locked_by_default BOOLEAN NOT NULL DEFAULT false,
      owner_controls_enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await queryFn(`
    CREATE TABLE IF NOT EXISTS join_to_create_channels (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL REFERENCES guild_configs(guild_id) ON DELETE CASCADE,
      channel_id TEXT UNIQUE NOT NULL,
      owner_user_id TEXT NOT NULL,
      trigger_channel_id TEXT,
      locked BOOLEAN NOT NULL DEFAULT false,
      user_limit INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(guild_id, owner_user_id)
    );
  `);

  await queryFn(`CREATE INDEX IF NOT EXISTS idx_join_to_create_channels_guild ON join_to_create_channels(guild_id, created_at DESC);`);
  await queryFn(`CREATE INDEX IF NOT EXISTS idx_join_to_create_channels_owner ON join_to_create_channels(guild_id, owner_user_id);`);
}

class JoinToCreateService {
  constructor(options = {}) {
    this.query = options.queryFn || query;
    this.schemaReady = null;
  }

  async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = ensureJoinToCreateSchema(this.query).catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  async getConfig(guildId) {
    await this.ensureSchema();
    const result = await this.query(`SELECT * FROM join_to_create_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async setup(guild, input) {
    await this.ensureSchema();
    const existing = await this.getConfig(guild.id);
    const triggerChannelId = input.triggerChannelId || existing?.trigger_channel_id || null;
    if (!triggerChannelId) return { ok: false, reason: 'Choose a join-to-create voice channel before enabling this module.' };

    const trigger = await guild.channels.fetch(triggerChannelId).catch(() => null);
    if (!trigger || trigger.type !== ChannelType.GuildVoice) {
      return { ok: false, reason: 'The configured trigger must be a standard voice channel.' };
    }

    const categoryId = input.categoryId || existing?.category_id || trigger.parentId || null;
    if (categoryId) {
      const category = await guild.channels.fetch(categoryId).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return { ok: false, reason: 'The temporary-room destination must be a category channel.' };
      }
    }

    const enabled = typeof input.enabled === 'boolean' ? input.enabled : (existing?.enabled ?? true);
    const nameTemplate = sanitizeRoomName(input.nameTemplate || existing?.name_template || "{displayname}'s Room");
    const userLimit = clampInt(input.userLimit, 0, 99, Number(existing?.user_limit || 0));
    const bitrateKbps = input.bitrateKbps == null
      ? (existing?.bitrate_kbps == null ? null : Number(existing.bitrate_kbps))
      : clampInt(input.bitrateKbps, 8, 384, 64);
    const lockedByDefault = typeof input.lockedByDefault === 'boolean'
      ? input.lockedByDefault
      : Boolean(existing?.locked_by_default);
    const ownerControlsEnabled = typeof input.ownerControlsEnabled === 'boolean'
      ? input.ownerControlsEnabled
      : (existing?.owner_controls_enabled ?? true);

    const result = await this.query(
      `INSERT INTO join_to_create_configs
       (guild_id, enabled, trigger_channel_id, category_id, name_template, user_limit, bitrate_kbps, locked_by_default, owner_controls_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         trigger_channel_id = EXCLUDED.trigger_channel_id,
         category_id = EXCLUDED.category_id,
         name_template = EXCLUDED.name_template,
         user_limit = EXCLUDED.user_limit,
         bitrate_kbps = EXCLUDED.bitrate_kbps,
         locked_by_default = EXCLUDED.locked_by_default,
         owner_controls_enabled = EXCLUDED.owner_controls_enabled,
         updated_at = NOW()
       RETURNING *`,
      [guild.id, enabled, trigger.id, categoryId, nameTemplate, userLimit, bitrateKbps, lockedByDefault, ownerControlsEnabled]
    );

    return { ok: true, config: result.rows[0] };
  }

  async listActiveChannels(guildId) {
    await this.ensureSchema();
    const result = await this.query(
      `SELECT * FROM join_to_create_channels WHERE guild_id = $1 ORDER BY created_at ASC`,
      [guildId]
    );
    return result.rows;
  }

  async getChannelRecord(guildId, channelId) {
    await this.ensureSchema();
    const result = await this.query(
      `SELECT * FROM join_to_create_channels WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
      [guildId, channelId]
    );
    return result.rows[0] || null;
  }

  async getOwnedChannelRecord(guildId, ownerUserId) {
    await this.ensureSchema();
    const result = await this.query(
      `SELECT * FROM join_to_create_channels WHERE guild_id = $1 AND owner_user_id = $2 LIMIT 1`,
      [guildId, ownerUserId]
    );
    return result.rows[0] || null;
  }

  async removeChannelRecord(guildId, channelId) {
    await this.ensureSchema();
    await this.query(`DELETE FROM join_to_create_channels WHERE guild_id = $1 AND channel_id = $2`, [guildId, channelId]);
  }

  async handleVoiceStateUpdate(oldState, newState, logger) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member || member.user?.bot) return { handled: false };

    const config = await this.getConfig(guild.id);
    if (!config || config.enabled === false || !config.trigger_channel_id) return { handled: false };

    let creation = null;
    if (newState.channelId === config.trigger_channel_id && oldState.channelId !== newState.channelId) {
      creation = await this.createOrMoveMemberRoom(guild, member, config, logger);
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await this.cleanupChannelIfEmpty(guild, oldState.channelId, logger);
    }

    return { handled: Boolean(creation), creation };
  }

  async createOrMoveMemberRoom(guild, member, config, logger) {
    const existingRecord = await this.getOwnedChannelRecord(guild.id, member.id);
    if (existingRecord) {
      const existingChannel = await guild.channels.fetch(existingRecord.channel_id).catch(() => null);
      if (existingChannel && existingChannel.type === ChannelType.GuildVoice) {
        const moved = await member.voice.setChannel(existingChannel, 'SlickBot join-to-create: return owner to existing room')
          .then(() => true)
          .catch(() => false);
        if (moved) return { ok: true, channel: existingChannel, record: existingRecord, reused: true };
      }
      await this.removeChannelRecord(guild.id, existingRecord.channel_id);
    }

    const trigger = await guild.channels.fetch(config.trigger_channel_id).catch(() => null);
    if (!trigger || trigger.type !== ChannelType.GuildVoice) {
      return { ok: false, reason: 'The configured join-to-create channel is unavailable.' };
    }

    const categoryId = config.category_id || trigger.parentId || null;
    const roomName = formatRoomName(config.name_template, member);
    const userLimit = clampInt(config.user_limit, 0, 99, 0);
    const requestedBitrate = config.bitrate_kbps == null ? null : clampInt(config.bitrate_kbps, 8, 384, 64) * 1000;
    const maximumBitrate = Number(guild.maximumBitrate || 96000);
    const bitrate = requestedBitrate ? Math.min(requestedBitrate, maximumBitrate) : undefined;
    const locked = Boolean(config.locked_by_default);
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

    const channel = await guild.channels.create({
      name: roomName,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      userLimit,
      bitrate,
      reason: `SlickBot join-to-create room for ${member.user.tag}`
    });

    try {
      await channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        Stream: true,
        UseVAD: true
      }, 'SlickBot temporary room owner access');

      if (botMember) {
        await channel.permissionOverwrites.edit(botMember.id, {
          ViewChannel: true,
          Connect: true,
          MoveMembers: true,
          ManageChannels: true
        }, 'SlickBot temporary room management access');
      }

      if (locked) {
        await channel.permissionOverwrites.edit(
          guild.roles.everyone.id,
          { Connect: false },
          'SlickBot temporary room default lock'
        );
      }
    } catch (error) {
      await channel.delete('SlickBot could not configure temporary room permissions.').catch(() => {});
      throw error;
    }

    let record;
    try {
      const inserted = await this.query(
        `INSERT INTO join_to_create_channels
         (guild_id, channel_id, owner_user_id, trigger_channel_id, locked, user_limit)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [guild.id, channel.id, member.id, trigger.id, locked, userLimit]
      );
      record = inserted.rows[0];
    } catch (error) {
      await channel.delete('SlickBot join-to-create database insert failed.').catch(() => {});
      throw error;
    }

    const moved = await member.voice.setChannel(channel, 'SlickBot join-to-create room created')
      .then(() => true)
      .catch(() => false);

    if (!moved) {
      await this.removeChannelRecord(guild.id, channel.id);
      await channel.delete('SlickBot could not move the room owner.').catch(() => {});
      return { ok: false, reason: 'The room was created, but SlickBot could not move the member into it.' };
    }

    await logger?.log({
      guildId: guild.id,
      eventKey: 'join-to-create-created',
      title: 'Temporary Voice Room Created',
      body: [`Owner: <@${member.id}>`, `Channel: <#${channel.id}>`, `Locked: **${locked ? 'Yes' : 'No'}**`, `User Limit: **${userLimit || 'Unlimited'}**`].join('\n'),
      actorUserId: member.id,
      metadata: { channelId: channel.id, ownerUserId: member.id, locked, userLimit }
    }).catch(() => {});

    return { ok: true, channel, record, reused: false };
  }

  async cleanupChannelIfEmpty(guild, channelId, logger) {
    const record = await this.getChannelRecord(guild.id, channelId);
    if (!record) return { cleaned: false };

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await this.removeChannelRecord(guild.id, channelId);
      return { cleaned: true, missing: true };
    }

    if (channel.type !== ChannelType.GuildVoice) {
      await this.removeChannelRecord(guild.id, channelId);
      return { cleaned: true, invalidType: true };
    }

    if (channel.members.size > 0) return { cleaned: false };

    await this.removeChannelRecord(guild.id, channelId);
    const deleted = await channel.delete('SlickBot removed an empty join-to-create room.')
      .then(() => true)
      .catch(() => false);

    await logger?.log({
      guildId: guild.id,
      eventKey: 'join-to-create-deleted',
      title: 'Temporary Voice Room Removed',
      body: [`Owner: <@${record.owner_user_id}>`, `Channel ID: \`${channelId}\``, `Discord Channel Deleted: **${deleted ? 'Yes' : 'No'}**`].join('\n'),
      metadata: { channelId, ownerUserId: record.owner_user_id, deleted }
    }).catch(() => {});

    return { cleaned: true, deleted };
  }

  async cleanupGuild(guild, logger) {
    const records = await this.listActiveChannels(guild.id);
    let stale = 0;
    let deleted = 0;
    let active = 0;

    for (const record of records) {
      const channel = await guild.channels.fetch(record.channel_id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        await this.removeChannelRecord(guild.id, record.channel_id);
        stale += 1;
        continue;
      }
      if (channel.members.size === 0) {
        const result = await this.cleanupChannelIfEmpty(guild, channel.id, logger);
        if (result.cleaned) deleted += 1;
        continue;
      }
      active += 1;
    }

    return { ok: true, scanned: records.length, active, stale, deleted };
  }

  async resolveCurrentRoom(interaction, options = {}) {
    const channel = interaction.member?.voice?.channel || null;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return { ok: false, reason: 'Join your temporary voice room before using this command.' };
    }

    const record = await this.getChannelRecord(interaction.guildId, channel.id);
    if (!record) return { ok: false, reason: 'Your current voice channel is not managed by Join-to-Create.' };

    const isOwner = record.owner_user_id === interaction.user.id;
    const staffOverride = Boolean(options.allowStaff && interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels));
    if (options.requireOwner && !isOwner && !staffOverride) {
      return { ok: false, reason: 'Only the temporary room owner can use this control.' };
    }

    const config = await this.getConfig(interaction.guildId);
    if (options.requireOwner && config?.owner_controls_enabled === false && !staffOverride) {
      return { ok: false, reason: 'Room-owner controls are disabled in this server.' };
    }

    return { ok: true, channel, record, config, isOwner, staffOverride };
  }

  async renameRoom(interaction, name, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: true, allowStaff: true });
    if (!room.ok) return room;
    const safeName = sanitizeRoomName(name);
    if (!safeName) return { ok: false, reason: 'Enter a valid room name.' };
    await room.channel.setName(safeName, `SlickBot room rename by ${interaction.user.tag}`);
    await this.logRoomUpdate(interaction, logger, room, `Name changed to **${safeName}**.`, { name: safeName });
    return { ok: true, channel: room.channel, record: room.record, name: safeName };
  }

  async setRoomLimit(interaction, amount, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: true, allowStaff: true });
    if (!room.ok) return room;
    const limit = clampInt(amount, 0, 99, 0);
    await room.channel.setUserLimit(limit, `SlickBot room limit changed by ${interaction.user.tag}`);
    const updated = await this.query(
      `UPDATE join_to_create_channels SET user_limit = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [limit, room.record.id]
    );
    await this.logRoomUpdate(interaction, logger, room, `User limit changed to **${limit || 'Unlimited'}**.`, { userLimit: limit });
    return { ok: true, channel: room.channel, record: updated.rows[0], limit };
  }

  async setRoomLocked(interaction, locked, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: true, allowStaff: true });
    if (!room.ok) return room;
    await room.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone.id,
      { Connect: locked ? false : null },
      `SlickBot room ${locked ? 'locked' : 'unlocked'} by ${interaction.user.tag}`
    );
    const updated = await this.query(
      `UPDATE join_to_create_channels SET locked = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [Boolean(locked), room.record.id]
    );
    await this.logRoomUpdate(interaction, logger, room, `Room **${locked ? 'locked' : 'unlocked'}**.`, { locked: Boolean(locked) });
    return { ok: true, channel: room.channel, record: updated.rows[0], locked: Boolean(locked) };
  }

  async setMemberAccess(interaction, user, allowed, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: true, allowStaff: true });
    if (!room.ok) return room;
    if (user.id === room.record.owner_user_id) {
      return { ok: false, reason: allowed ? 'The room owner already has access.' : 'The room owner cannot be rejected from their own room.' };
    }
    if (user.bot) return { ok: false, reason: 'Bot access cannot be changed with this command.' };

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return { ok: false, reason: 'That user is not a member of this server.' };

    if (!allowed && member.voice.channelId === room.channel.id) {
      await member.voice.disconnect(`Rejected from temporary room by ${interaction.user.tag}`).catch(() => {});
    }

    await room.channel.permissionOverwrites.edit(
      user.id,
      { ViewChannel: allowed ? true : null, Connect: allowed ? true : false },
      `SlickBot room access changed by ${interaction.user.tag}`
    );

    await logger?.log({
      guildId: interaction.guildId,
      eventKey: 'join-to-create-access',
      title: `Temporary Room Access ${allowed ? 'Granted' : 'Revoked'}`,
      body: [`Room: <#${room.channel.id}>`, `User: <@${user.id}>`, `Changed By: <@${interaction.user.id}>`].join('\n'),
      actorUserId: interaction.user.id,
      metadata: { channelId: room.channel.id, targetUserId: user.id, allowed }
    }).catch(() => {});

    return { ok: true, channel: room.channel, record: room.record, user, allowed };
  }

  async transferOwnership(interaction, user, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: true, allowStaff: true });
    if (!room.ok) return room;
    if (user.bot) return { ok: false, reason: 'Ownership cannot be transferred to a bot.' };
    if (!room.channel.members.has(user.id)) return { ok: false, reason: 'The new owner must currently be in this voice room.' };
    if (user.id === room.record.owner_user_id) return { ok: false, reason: 'That user already owns this room.' };

    const existing = await this.getOwnedChannelRecord(interaction.guildId, user.id);
    if (existing && existing.channel_id !== room.channel.id) {
      return { ok: false, reason: 'That user already owns another temporary voice room.' };
    }

    const updated = await this.query(
      `UPDATE join_to_create_channels SET owner_user_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [user.id, room.record.id]
    );
    await room.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      UseVAD: true
    }).catch(() => {});

    await this.logOwnershipChange(interaction, logger, room, user.id, 'transferred');
    return { ok: true, channel: room.channel, record: updated.rows[0], previousOwnerId: room.record.owner_user_id, ownerUserId: user.id };
  }

  async claimOwnership(interaction, logger) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: false });
    if (!room.ok) return room;
    if (room.config?.owner_controls_enabled === false && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return { ok: false, reason: 'Room-owner controls are disabled in this server.' };
    }
    if (room.record.owner_user_id === interaction.user.id) return { ok: false, reason: 'You already own this room.' };
    if (room.channel.members.has(room.record.owner_user_id)) {
      return { ok: false, reason: 'The current room owner is still present.' };
    }

    const existing = await this.getOwnedChannelRecord(interaction.guildId, interaction.user.id);
    if (existing && existing.channel_id !== room.channel.id) {
      return { ok: false, reason: 'You already own another temporary voice room.' };
    }

    const previousOwnerId = room.record.owner_user_id;
    const updated = await this.query(
      `UPDATE join_to_create_channels SET owner_user_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [interaction.user.id, room.record.id]
    );
    await room.channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      UseVAD: true
    }).catch(() => {});

    await this.logOwnershipChange(interaction, logger, room, interaction.user.id, 'claimed', previousOwnerId);
    return { ok: true, channel: room.channel, record: updated.rows[0], previousOwnerId, ownerUserId: interaction.user.id };
  }

  async logRoomUpdate(interaction, logger, room, detail, metadata = {}) {
    await logger?.log({
      guildId: interaction.guildId,
      eventKey: 'join-to-create-updated',
      title: 'Temporary Voice Room Updated',
      body: [`Room: <#${room.channel.id}>`, `Owner: <@${room.record.owner_user_id}>`, `Changed By: <@${interaction.user.id}>`, detail].join('\n'),
      actorUserId: interaction.user.id,
      metadata: { channelId: room.channel.id, ownerUserId: room.record.owner_user_id, ...metadata }
    }).catch(() => {});
  }

  async logOwnershipChange(interaction, logger, room, ownerUserId, mode, previousOwnerId = room.record.owner_user_id) {
    await logger?.log({
      guildId: interaction.guildId,
      eventKey: 'join-to-create-owner',
      title: `Temporary Room Ownership ${mode === 'claimed' ? 'Claimed' : 'Transferred'}`,
      body: [`Room: <#${room.channel.id}>`, `Previous Owner: <@${previousOwnerId}>`, `New Owner: <@${ownerUserId}>`, `Changed By: <@${interaction.user.id}>`].join('\n'),
      actorUserId: interaction.user.id,
      metadata: { channelId: room.channel.id, previousOwnerId, ownerUserId, mode }
    }).catch(() => {});
  }

  async buildManagerPanel(guildOrId) {
    const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId.id;
    const [config, active] = await Promise.all([this.getConfig(guildId), this.listActiveChannels(guildId)]);
    const roomLines = active.length
      ? active.slice(0, 12).map((room) => `• <#${room.channel_id}> — Owner: <@${room.owner_user_id}> · ${room.locked ? 'Locked' : 'Open'} · Limit: **${room.user_limit || '∞'}**`).join('\n')
      : 'No temporary voice rooms are currently active.';

    const description = config
      ? [
          `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
          `Join Channel: ${config.trigger_channel_id ? `<#${config.trigger_channel_id}>` : 'Not configured'}`,
          `Room Category: ${config.category_id ? `<#${config.category_id}>` : 'Uses the join channel category'}`,
          `Name Template: \`${config.name_template}\``,
          `Default Limit: **${config.user_limit || 'Unlimited'}**`,
          `Default Lock: **${config.locked_by_default ? 'Locked' : 'Open'}**`,
          `Owner Controls: **${config.owner_controls_enabled ? 'Enabled' : 'Disabled'}**`,
          `Active Rooms: **${active.length}**`,
          '',
          '**Active Temporary Rooms**',
          roomLines,
          '',
          'Members join the configured voice channel to receive a temporary room. Room owners can use `/voice rename`, `/voice limit`, `/voice lock`, `/voice permit`, and related controls.'
        ].join('\n')
      : 'Join-to-Create has not been configured. Enable the module, then run `/voice setup`.';

    return {
      embeds: [createBaseEmbed({
        title: 'Join-to-Create Voice Manager',
        description,
        color: config?.enabled ? SlickBotColors.PRIMARY : SlickBotColors.WARNING,
        footer: 'SlickBot Join-to-Create'
      })],
      components: [createButtonRow([
        createPanelButton(JoinToCreateIds.Refresh, 'Refresh Rooms', ButtonStyle.Secondary, '🔄')
      ])]
    };
  }

  async buildRoomInfo(interaction) {
    const room = await this.resolveCurrentRoom(interaction, { requireOwner: false });
    if (!room.ok) return room;
    return {
      ok: true,
      payload: {
        embeds: [createBaseEmbed({
          title: `Voice Room: ${room.channel.name}`,
          description: [
            `Owner: <@${room.record.owner_user_id}>`,
            `Members: **${room.channel.members.size}**`,
            `User Limit: **${room.channel.userLimit || 'Unlimited'}**`,
            `Access: **${room.record.locked ? 'Locked' : 'Open'}**`,
            `Created: <t:${Math.floor(new Date(room.record.created_at).getTime() / 1000)}:R>`,
            '',
            room.record.owner_user_id === interaction.user.id
              ? 'You own this room and can use the `/voice` owner controls.'
              : 'You can claim this room with `/voice claim` only when the current owner is no longer present.'
          ].join('\n'),
          color: SlickBotColors.INFO,
          footer: 'SlickBot Join-to-Create'
        })]
      },
      room
    };
  }
}

module.exports = {
  JoinToCreateService,
  JoinToCreateIds,
  ensureJoinToCreateSchema,
  formatRoomName,
  sanitizeRoomName,
  clampInt
};
