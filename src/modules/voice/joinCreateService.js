const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, PermissionsBitField, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 90);
}

function slugName(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'member';
}

function renderTemplate(template, member, hub) {
  const username = member?.displayName || member?.user?.globalName || member?.user?.username || 'Member';
  const plainUsername = normalizeName(username) || 'Member';
  return normalizeName(String(template || "{username}'s Voice")
    .replaceAll('{username}', plainUsername)
    .replaceAll('{user}', plainUsername)
    .replaceAll('{tag}', member?.user?.tag || plainUsername)
    .replaceAll('{hub}', hub?.hub_name || 'Voice')) || `${plainUsername}'s Voice`;
}

function boolLabel(value) {
  return value ? 'Enabled' : 'Disabled';
}

function channelLabel(id, fallback = 'Not set') {
  return id ? `<#${id}>` : fallback;
}

function buildSingleInputModal({ customId, title, inputId, label, style = TextInputStyle.Short, required = true, maxLength = 100, placeholder = null, value = null }) {
  const input = new TextInputBuilder()
    .setCustomId(inputId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(input));
}

class JoinCreateService {
  constructor() {
    this.deleteTimers = new Map();
    this.recentCreates = new Map();
  }

  async getHubById(guildId, hubId) {
    const result = await query(`SELECT * FROM join_create_hubs WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, hubId]);
    return result.rows[0] || null;
  }

  async getHubBySource(guildId, sourceChannelId) {
    const result = await query(
      `SELECT * FROM join_create_hubs WHERE guild_id = $1 AND source_channel_id = $2 AND (enabled = true OR enabled IS NULL) LIMIT 1`,
      [guildId, sourceChannelId]
    );
    return result.rows[0] || null;
  }

  async listHubs(guildId, { includeDisabled = true } = {}) {
    const result = await query(
      `SELECT h.*,
              (SELECT COUNT(*)::int FROM join_create_temp_channels t WHERE t.hub_id = h.id AND t.status = 'ACTIVE') AS active_count
       FROM join_create_hubs h
       WHERE h.guild_id = $1 ${includeDisabled ? '' : 'AND h.enabled = true'}
       ORDER BY h.created_at ASC`,
      [guildId]
    );
    return result.rows;
  }

  async setup(guild, input = {}) {
    if (!guild?.id) throw new Error('Guild is not available.');
    if (!input.sourceChannelId) throw new Error('A join-to-create source voice channel is required.');

    const source = await guild.channels.fetch(input.sourceChannelId).catch(() => null);
    if (!source || source.type !== ChannelType.GuildVoice) throw new Error('The source channel must be a voice channel.');
    const categoryId = input.categoryId || source.parentId || null;
    if (categoryId) {
      const category = await guild.channels.fetch(categoryId).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) throw new Error('The category must be a category channel.');
    }

    const result = await query(
      `INSERT INTO join_create_hubs (
        guild_id, source_channel_id, category_id, hub_name, enabled, name_template, user_limit,
        bitrate, private_enabled, owner_controls_enabled, delete_when_empty, empty_delete_delay_seconds,
        staff_role_id, created_by_user_id, updated_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       ON CONFLICT (guild_id, source_channel_id)
       DO UPDATE SET
         category_id = EXCLUDED.category_id,
         hub_name = EXCLUDED.hub_name,
         enabled = EXCLUDED.enabled,
         name_template = EXCLUDED.name_template,
         user_limit = EXCLUDED.user_limit,
         bitrate = EXCLUDED.bitrate,
         private_enabled = EXCLUDED.private_enabled,
         owner_controls_enabled = EXCLUDED.owner_controls_enabled,
         delete_when_empty = EXCLUDED.delete_when_empty,
         empty_delete_delay_seconds = EXCLUDED.empty_delete_delay_seconds,
         staff_role_id = EXCLUDED.staff_role_id,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = NOW()
       RETURNING *`,
      [
        guild.id,
        input.sourceChannelId,
        categoryId,
        input.hubName || source.name || 'Join to Create',
        typeof input.enabled === 'boolean' ? input.enabled : true,
        input.nameTemplate || "{username}'s Voice",
        clampInt(input.userLimit, 0, 99, 0),
        input.bitrate ? clampInt(input.bitrate, 8000, 384000, null) : null,
        input.privateEnabled ?? false,
        input.ownerControlsEnabled ?? true,
        input.deleteWhenEmpty ?? true,
        clampInt(input.emptyDeleteDelaySeconds, 5, 3600, 30),
        input.staffRoleId || null,
        input.actorUserId || null
      ]
    );
    return result.rows[0];
  }

  async createHubChannel(guild, actorUserId, input = {}) {
    if (!guild?.id) throw new Error('Guild is not available.');
    const category = input.categoryId ? await guild.channels.fetch(input.categoryId).catch(() => null) : null;
    if (input.categoryId && (!category || category.type !== ChannelType.GuildCategory)) throw new Error('The selected category was not found.');
    const name = normalizeName(input.name || 'Join to Create') || 'Join to Create';
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: input.categoryId || null,
      reason: `SlickBot join-to-create hub created by ${actorUserId || 'unknown'}`
    });
    return this.setup(guild, {
      sourceChannelId: channel.id,
      categoryId: input.categoryId || channel.parentId || null,
      hubName: name,
      nameTemplate: input.nameTemplate || "{username}'s Voice",
      userLimit: input.userLimit ?? 0,
      privateEnabled: input.privateEnabled ?? false,
      ownerControlsEnabled: true,
      emptyDeleteDelaySeconds: input.emptyDeleteDelaySeconds ?? 30,
      actorUserId
    });
  }

  async setHubEnabled(guildId, hubId, enabled, actorUserId = null) {
    const result = await query(
      `UPDATE join_create_hubs
       SET enabled = $4, updated_by_user_id = $3, updated_at = NOW()
       WHERE guild_id = $1 AND id = $2
       RETURNING *`,
      [guildId, hubId, actorUserId, enabled]
    );
    return result.rows[0] || null;
  }

  async deleteHub(guild, hubId, { deleteActive = false, actorUserId = null, logger = null } = {}) {
    const hub = await this.getHubById(guild.id, hubId);
    if (!hub) return { ok: false, reason: 'Join-to-create hub not found.' };
    const active = await this.listActiveTempChannels(guild.id, hub.id);
    if (active.length && !deleteActive) {
      return { ok: false, reason: `This hub has ${active.length} active temporary channel(s). Run cleanup first or use delete_active:true.` };
    }
    if (deleteActive) {
      for (const temp of active) {
        await this.deleteTempChannel(guild, temp, logger, `hub deleted by ${actorUserId || 'staff'}`).catch(() => null);
      }
    }
    await query(`DELETE FROM join_create_hubs WHERE guild_id = $1 AND id = $2`, [guild.id, hubId]);
    return { ok: true, hub, deletedActive: deleteActive ? active.length : 0 };
  }

  async listActiveTempChannels(guildId, hubId = null) {
    const result = await query(
      `SELECT t.*, h.source_channel_id, h.hub_name, h.empty_delete_delay_seconds, h.delete_when_empty
       FROM join_create_temp_channels t
       LEFT JOIN join_create_hubs h ON h.id = t.hub_id
       WHERE t.guild_id = $1 AND t.status = 'ACTIVE' ${hubId ? 'AND t.hub_id = $2' : ''}
       ORDER BY t.created_at ASC`,
      hubId ? [guildId, hubId] : [guildId]
    );
    return result.rows;
  }

  async findActiveTempByChannel(guildId, channelId) {
    const result = await query(
      `SELECT t.*, h.source_channel_id, h.hub_name, h.name_template, h.staff_role_id, h.owner_controls_enabled, h.private_enabled,
              h.delete_when_empty, h.empty_delete_delay_seconds
       FROM join_create_temp_channels t
       LEFT JOIN join_create_hubs h ON h.id = t.hub_id
       WHERE t.guild_id = $1 AND t.channel_id = $2 AND t.status = 'ACTIVE'
       LIMIT 1`,
      [guildId, channelId]
    );
    return result.rows[0] || null;
  }

  async findOwnedTempChannel(guildId, userId) {
    const result = await query(
      `SELECT t.*, h.source_channel_id, h.hub_name, h.staff_role_id, h.owner_controls_enabled, h.private_enabled,
              h.delete_when_empty, h.empty_delete_delay_seconds
       FROM join_create_temp_channels t
       LEFT JOIN join_create_hubs h ON h.id = t.hub_id
       WHERE t.guild_id = $1 AND t.owner_user_id = $2 AND t.status = 'ACTIVE'
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [guildId, userId]
    );
    return result.rows[0] || null;
  }

  async findUserTempChannel(member) {
    if (!member?.guild?.id) return null;
    if (member.voice?.channelId) {
      const current = await this.findActiveTempByChannel(member.guild.id, member.voice.channelId);
      if (current) return current;
    }
    return this.findOwnedTempChannel(member.guild.id, member.id);
  }

  canManageTemp(member, temp) {
    if (!member || !temp) return false;
    if (member.id === temp.owner_user_id) return true;
    if (member.guild?.ownerId === member.id) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (temp.staff_role_id && member.roles?.cache?.has(temp.staff_role_id)) return true;
    return false;
  }

  async handleVoiceState(oldState, newState, logger = null) {
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!guild?.id || !member || member.user?.bot) return { handled: false };

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return { handled: false };

    if (newChannelId) {
      const hub = await this.getHubBySource(guild.id, newChannelId).catch(() => null);
      if (hub) {
        await this.createTempForMember(guild, member, hub, logger).catch(async (error) => {
          await logger?.log({
            guildId: guild.id,
            eventKey: 'join-create-error',
            title: 'Join-to-Create Error',
            body: error instanceof Error ? error.message : String(error),
            metadata: { userId: member.id, sourceChannelId: newChannelId, hubId: hub.id }
          }).catch(() => {});
          throw error;
        });
      }
    }

    if (oldChannelId) {
      await this.scheduleEmptyCleanup(guild, oldChannelId, logger).catch(() => null);
    }
    if (newChannelId) {
      await this.cancelEmptyCleanupIfOccupied(guild.id, newChannelId).catch(() => null);
    }
    return { handled: true };
  }

  async createTempForMember(guild, member, hub, logger = null) {
    const recentKey = `${guild.id}:${member.id}:${hub.id}`;
    const last = this.recentCreates.get(recentKey) || 0;
    if (Date.now() - last < 5000) return null;
    this.recentCreates.set(recentKey, Date.now());

    const existing = await this.findOwnedTempChannel(guild.id, member.id);
    if (existing) {
      const existingChannel = await guild.channels.fetch(existing.channel_id).catch(() => null);
      if (existingChannel) {
        await member.voice.setChannel(existingChannel, 'SlickBot join-to-create existing room').catch(() => null);
        return existing;
      }
      await this.markTempDeleted(existing.channel_id, 'missing existing owner channel');
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const source = await guild.channels.fetch(hub.source_channel_id).catch(() => null);
    const parentId = hub.category_id || source?.parentId || null;
    const channelName = renderTemplate(hub.name_template, member, hub);
    const userLimit = clampInt(hub.user_limit, 0, 99, 0);
    const overwrites = [];

    // Bot permissions (Ensure bot can always manage and post messages in voice text chat)
    if (me) {
      overwrites.push({
        id: me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.MoveMembers
        ]
      });
    }

    // Owner permissions
    overwrites.push({
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });

    if (hub.private_enabled) {
      overwrites.push({ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect] });
      if (hub.staff_role_id) {
        overwrites.push({
          id: hub.staff_role_id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.MoveMembers
          ]
        });
      }
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: parentId,
      userLimit,
      bitrate: hub.bitrate || undefined,
      permissionOverwrites: overwrites,
      reason: `SlickBot join-to-create room for ${member.user.tag}`
    });

    const result = await query(
      `INSERT INTO join_create_temp_channels (guild_id, hub_id, channel_id, owner_user_id, status, name, locked, user_limit)
       VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7)
       ON CONFLICT (channel_id)
       DO UPDATE SET guild_id = EXCLUDED.guild_id, hub_id = EXCLUDED.hub_id, owner_user_id = EXCLUDED.owner_user_id,
         status = 'ACTIVE', name = EXCLUDED.name, locked = EXCLUDED.locked, user_limit = EXCLUDED.user_limit,
         deleted_at = NULL, updated_at = NOW()
       RETURNING *`,
      [guild.id, hub.id, channel.id, member.id, channelName, Boolean(hub.private_enabled), userLimit]
    );

    await member.voice.setChannel(channel, 'SlickBot join-to-create room created').catch(async () => {
      await this.deleteTempChannel(guild, result.rows[0], logger, 'creator move failed').catch(() => null);
      throw new Error('Temporary channel was created, but SlickBot could not move the user into it. Check Move Members permissions.');
    });

    await this.postControlPanel(guild, result.rows[0], logger).catch(() => null);

    await logger?.log({
      guildId: guild.id,
      eventKey: 'join-create-created',
      title: 'Temporary Voice Channel Created',
      body: [`Owner: <@${member.id}>`, `Channel: <#${channel.id}>`, `Hub: <#${hub.source_channel_id}>`].join('\n'),
      actorUserId: member.id,
      metadata: { hubId: hub.id, channelId: channel.id, ownerUserId: member.id }
    }).catch(() => {});

    return result.rows[0];
  }

  async markTempDeleted(channelId, reason = null) {
    await query(
      `UPDATE join_create_temp_channels
       SET status = 'DELETED', deleted_at = NOW(), updated_at = NOW()
       WHERE channel_id = $1 AND status = 'ACTIVE'`,
      [channelId]
    ).catch(() => {});
    this.cancelDeleteTimer(channelId);
    return reason;
  }

  cancelDeleteTimer(channelId) {
    const timer = this.deleteTimers.get(channelId);
    if (timer) clearTimeout(timer);
    this.deleteTimers.delete(channelId);
  }

  async cancelEmptyCleanupIfOccupied(guildId, channelId) {
    const temp = await this.findActiveTempByChannel(guildId, channelId).catch(() => null);
    if (temp) this.cancelDeleteTimer(channelId);
  }

  async scheduleEmptyCleanup(guild, channelId, logger = null) {
    const temp = await this.findActiveTempByChannel(guild.id, channelId).catch(() => null);
    if (!temp || temp.delete_when_empty === false) return false;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.members || channel.members.filter((member) => !member.user.bot).size > 0) return false;
    const delay = clampInt(temp.empty_delete_delay_seconds, 5, 3600, 30) * 1000;
    await query(`UPDATE join_create_temp_channels SET last_empty_at = NOW(), updated_at = NOW() WHERE channel_id = $1`, [channelId]).catch(() => {});
    this.cancelDeleteTimer(channelId);
    const timeout = setTimeout(() => {
      this.deleteTimers.delete(channelId);
      this.deleteIfEmpty(guild, channelId, logger).catch((error) => console.error(`Failed to delete empty temp voice ${channelId}:`, error));
    }, delay);
    this.deleteTimers.set(channelId, timeout);
    return true;
  }

  async deleteIfEmpty(guild, channelId, logger = null) {
    const temp = await this.findActiveTempByChannel(guild.id, channelId).catch(() => null);
    if (!temp) return false;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await this.markTempDeleted(channelId, 'missing channel');
      return true;
    }
    const humans = channel.members?.filter((member) => !member.user.bot).size || 0;
    if (humans > 0) return false;
    await this.deleteTempChannel(guild, temp, logger, 'empty temporary voice channel');
    return true;
  }

  async deleteTempChannel(guild, temp, logger = null, reason = 'temporary voice cleanup') {
    const channel = await guild.channels.fetch(temp.channel_id).catch(() => null);
    if (channel) await channel.delete(`SlickBot ${reason}`).catch(() => null);
    await this.markTempDeleted(temp.channel_id, reason);
    await logger?.log({
      guildId: guild.id,
      eventKey: 'join-create-deleted',
      title: 'Temporary Voice Channel Deleted',
      body: [`Channel ID: ${temp.channel_id}`, `Owner: <@${temp.owner_user_id}>`, `Reason: ${reason}`].join('\n'),
      metadata: { channelId: temp.channel_id, ownerUserId: temp.owner_user_id, reason }
    }).catch(() => {});
    return true;
  }

  async cleanup(guild, logger = null, { includeOccupied = false } = {}) {
    const active = await this.listActiveTempChannels(guild.id);
    let deleted = 0;
    let markedMissing = 0;
    let skippedOccupied = 0;
    const failures = [];
    for (const temp of active) {
      const channel = await guild.channels.fetch(temp.channel_id).catch(() => null);
      if (!channel) {
        await this.markTempDeleted(temp.channel_id, 'cleanup missing channel');
        markedMissing += 1;
        continue;
      }
      const humans = channel.members?.filter((member) => !member.user.bot).size || 0;
      if (humans > 0 && !includeOccupied) {
        skippedOccupied += 1;
        continue;
      }
      try {
        await this.deleteTempChannel(guild, temp, logger, includeOccupied ? 'manual cleanup' : 'manual cleanup empty');
        deleted += 1;
      } catch (error) {
        failures.push({ channelId: temp.channel_id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return { deleted, markedMissing, skippedOccupied, failures };
  }

  async repairStartup(client, logger = null) {
    for (const guild of client.guilds.cache.values()) {
      const active = await this.listActiveTempChannels(guild.id).catch(() => []);
      for (const temp of active) {
        const channel = await guild.channels.fetch(temp.channel_id).catch(() => null);
        if (!channel) {
          await this.markTempDeleted(temp.channel_id, 'startup repair missing channel');
          continue;
        }
        const humans = channel.members?.filter((member) => !member.user.bot).size || 0;
        if (humans === 0) await this.scheduleEmptyCleanup(guild, temp.channel_id, logger).catch(() => null);
      }
    }
  }

  async renameTemp(member, newName) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    const name = normalizeName(newName);
    if (!name) throw new Error('Provide a valid channel name.');
    await channel.setName(name, `SlickBot temp voice renamed by ${member.user.tag}`);
    const result = await query(`UPDATE join_create_temp_channels SET name = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, name]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async setLimit(member, limit) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    const userLimit = clampInt(limit, 0, 99, 0);
    await channel.setUserLimit(userLimit, `SlickBot temp voice limit set by ${member.user.tag}`);
    const result = await query(`UPDATE join_create_temp_channels SET user_limit = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, userLimit]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async setLocked(member, locked) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    await channel.permissionOverwrites.edit(member.guild.roles.everyone.id, {
      Connect: locked ? false : null
    }, { reason: `SlickBot temp voice ${locked ? 'locked' : 'unlocked'} by ${member.user.tag}` });
    const result = await query(`UPDATE join_create_temp_channels SET locked = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, locked]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }


  async setLockedFromControl(member, channelId, locked) {
    const temp = await this.findActiveTempByChannel(member.guild.id, channelId);
    if (!temp) throw new Error('This temporary voice channel is no longer active.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    await channel.permissionOverwrites.edit(member.guild.roles.everyone.id, {
      Connect: locked ? false : null
    }, { reason: `SlickBot temp voice ${locked ? 'locked' : 'unlocked'} from control panel by ${member.user.tag}` });
    const result = await query(`UPDATE join_create_temp_channels SET locked = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, locked]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async getManageableTempFromControl(member, channelId) {
    const temp = await this.findActiveTempByChannel(member.guild.id, channelId);
    if (!temp) throw new Error('This temporary voice channel is no longer active.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    return { temp, channel };
  }

  async renameTempFromControl(member, channelId, newName) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    const name = normalizeName(newName);
    if (!name) throw new Error('Provide a valid channel name.');
    await channel.setName(name, `SlickBot temp voice renamed from control panel by ${member.user.tag}`);
    const result = await query(`UPDATE join_create_temp_channels SET name = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, name]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async setLimitFromControl(member, channelId, limit) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    const userLimit = clampInt(limit, 0, 99, 0);
    await channel.setUserLimit(userLimit, `SlickBot temp voice limit set from control panel by ${member.user.tag}`);
    const result = await query(`UPDATE join_create_temp_channels SET user_limit = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, userLimit]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async permitUserFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    await channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: true,
      Connect: true
    }, { reason: `SlickBot temp voice permit from control panel by ${member.user.tag}` });
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async removeUserFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    await channel.permissionOverwrites.edit(targetMember.id, {
      Connect: false
    }, { reason: `SlickBot temp voice user removed from control panel by ${member.user.tag}` });
    if (targetMember.voice?.channelId === channel.id) {
      await targetMember.voice.disconnect(`Removed from temp voice by ${member.user.tag}`).catch(() => null);
    }
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async transferFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    await channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: true,
      Connect: true,
    }, { reason: `SlickBot temp voice ownership transferred from control panel by ${member.user.tag}` });
    await channel.permissionOverwrites.edit(member.id, {
      ManageChannels: null,
      MoveMembers: null
    }, { reason: 'SlickBot temp voice ownership transferred from control panel' }).catch(() => null);
    const result = await query(`UPDATE join_create_temp_channels SET owner_user_id = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, targetMember.id]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp, targetMember };
  }

  async setHidden(member, hidden) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    return this.setHiddenFromControl(member, temp.channel_id, hidden);
  }

  async setHiddenFromControl(member, channelId, hidden) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    await channel.permissionOverwrites.edit(member.guild.roles.everyone.id, {
      ViewChannel: hidden ? false : null
    }, { reason: `SlickBot temp voice ${hidden ? 'hidden' : 'unhidden'} from control panel by ${member.user.tag}` });
    const result = await query(`UPDATE join_create_temp_channels SET hidden = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, Boolean(hidden)]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp, hidden: Boolean(hidden) };
  }

  async setBitrate(member, kbps) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    return this.setBitrateFromControl(member, temp.channel_id, kbps);
  }

  async setBitrateFromControl(member, channelId, kbps) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    const num = Math.max(8, Math.min(parseInt(kbps, 10) || 64, 384));
    const bitrateBps = num * 1000;
    if (typeof channel.setBitrate === 'function') {
      await channel.setBitrate(bitrateBps, `SlickBot temp voice bitrate set by ${member.user.tag}`);
    }
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, kbps: num };
  }

  async kickUser(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    return this.kickUserFromControl(member, temp.channel_id, targetMember);
  }

  async kickUserFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    if (targetMember.id === member.id) throw new Error('You cannot kick yourself.');
    if (targetMember.voice?.channelId === channel.id && typeof targetMember.voice.disconnect === 'function') {
      await targetMember.voice.disconnect(`Kicked from temporary voice by ${member.user.tag}`).catch(() => null);
    }
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async banUser(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    return this.banUserFromControl(member, temp.channel_id, targetMember);
  }

  async banUserFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    if (targetMember.id === member.id) throw new Error('You cannot block/ban yourself.');
    await channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: false,
      Connect: false
    }, { reason: `SlickBot temp voice user blocked/banned by ${member.user.tag}` });
    if (targetMember.voice?.channelId === channel.id && typeof targetMember.voice.disconnect === 'function') {
      await targetMember.voice.disconnect(`Blocked/banned from temp voice by ${member.user.tag}`).catch(() => null);
    }
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async unbanUser(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    return this.unbanUserFromControl(member, temp.channel_id, targetMember);
  }

  async unbanUserFromControl(member, channelId, targetMember) {
    const { temp, channel } = await this.getManageableTempFromControl(member, channelId);
    await channel.permissionOverwrites.delete(targetMember.id, `Unbanned from temp voice by ${member.user.tag}`).catch(() => null);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async permitUser(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    await channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: true,
      Connect: true
    }, { reason: `SlickBot temp voice permit by ${member.user.tag}` });
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async removeUser(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    await channel.permissionOverwrites.edit(targetMember.id, {
      Connect: false
    }, { reason: `SlickBot temp voice user removed by ${member.user.tag}` });
    if (targetMember.voice?.channelId === channel.id) {
      await targetMember.voice.disconnect(`Removed from temp voice by ${member.user.tag}`).catch(() => null);
    }
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp, targetMember };
  }

  async transfer(member, targetMember) {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    await channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: true,
      Connect: true,
    }, { reason: `SlickBot temp voice ownership transferred by ${member.user.tag}` });
    await channel.permissionOverwrites.edit(member.id, {
      ManageChannels: null,
      MoveMembers: null
    }, { reason: 'SlickBot temp voice ownership transferred' }).catch(() => null);
    const result = await query(`UPDATE join_create_temp_channels SET owner_user_id = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, targetMember.id]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp, targetMember };
  }

  async claim(member) {
    if (!member.voice?.channelId) throw new Error('Join the temporary voice channel you want to claim first.');
    const temp = await this.findActiveTempByChannel(member.guild.id, member.voice.channelId);
    if (!temp) throw new Error('This voice channel is not tracked as a SlickBot temporary voice channel.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    if (temp.owner_user_id) {
      const owner = await member.guild.members.fetch(temp.owner_user_id).catch(() => null);
      if (owner?.voice?.channelId === channel.id) throw new Error('The current owner is still in this channel.');
    }
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      Connect: true,
    }, { reason: `SlickBot temp voice claimed by ${member.user.tag}` });
    const result = await query(`UPDATE join_create_temp_channels SET owner_user_id = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, member.id]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }


  buildTempControlPayload(temp, channel = null) {
    const channelName = channel?.name || temp?.name || 'Temporary Voice Channel';
    const locked = Boolean(temp?.locked);
    const hidden = Boolean(temp?.hidden);
    const limit = Number(temp?.user_limit || 0);
    const ownerId = temp?.owner_user_id;
    const deleteDelay = clampInt(temp?.empty_delete_delay_seconds, 5, 3600, 30);
    const statusLabel = `${locked ? '🔒 Locked' : '🔓 Unlocked'} · ${hidden ? '👁️‍🗨️ Hidden' : '👁️ Visible'}`;
    const embed = createBaseEmbed({
      title: 'Temporary Voice Controls',
      description: [
        `This panel controls **${channelName}**.`,
        'Use the buttons below to manage access, settings, bitrate, and members in your room.'
      ].join('\n'),
      color: locked ? SlickBotColors.WARNING : SlickBotColors.INFO,
      footer: 'SlickBot temporary voice control panel'
    }).addFields(
      { name: 'Owner', value: ownerId ? `<@${ownerId}>` : 'No owner set', inline: true },
      { name: 'Status', value: statusLabel, inline: true },
      { name: 'User Limit', value: limit ? String(limit) : 'No limit', inline: true },
      {
        name: 'Quick Actions',
        value: [
          '• **Lock / Unlock**: Control whether others can newly connect.',
          '• **Hide / Unhide**: Toggle visibility in server channel list.',
          '• **Rename / Limit / Bitrate**: Customize room identity and audio quality.',
          '• **Permit / Kick / Ban**: Whitelist friends or remove/block disruptive users.',
          '• **Claim / Transfer**: Manage channel ownership.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Auto Cleanup',
        value: temp?.delete_when_empty === false ? 'This channel is not set to auto-delete when empty.' : `This channel deletes about **${deleteDelay} seconds** after it becomes empty.`,
        inline: false
      }
    );
    const channelId = temp?.channel_id || channel?.id;

    // Row 1: Access Controls & Personal Menu
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateOwnerPanelPrefix}${channelId}`).setLabel('Control Menu').setEmoji('🎛️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateLockPrefix}${channelId}`).setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateUnlockPrefix}${channelId}`).setLabel('Unlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary).setDisabled(!locked),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateHidePrefix}${channelId}`).setLabel('Hide').setEmoji('👁️‍🗨️').setStyle(ButtonStyle.Secondary).setDisabled(hidden),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateUnhidePrefix}${channelId}`).setLabel('Unhide').setEmoji('👁️').setStyle(ButtonStyle.Secondary).setDisabled(!hidden)
    );

    // Row 2: Room Settings & User Management
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateRenamePrefix}${channelId}`).setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateLimitPrefix}${channelId}`).setLabel('Set Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateBitratePrefix}${channelId}`).setLabel('Bitrate').setEmoji('🎚️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreatePermitPrefix}${channelId}`).setLabel('Permit').setEmoji('✅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateKickPrefix}${channelId}`).setLabel('Kick').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
    );

    // Row 3: Moderation & Danger
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateClaimPrefix}${channelId}`).setLabel('Claim').setEmoji('👑').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateBanPrefix}${channelId}`).setLabel('Block / Ban').setEmoji('⛔').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateTransferPrefix}${channelId}`).setLabel('Transfer').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateDeletePrefix}${channelId}`).setLabel('Delete Room').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    return { content: ownerId ? `<@${ownerId}>` : undefined, embeds: [embed], components: [row1, row2, row3], allowedMentions: ownerId ? { users: [ownerId], roles: [] } : { parse: [] } };
  }

  async buildOwnerPanel(member, channelId = null) {
    let temp = null;
    if (channelId) {
      temp = await this.findActiveTempByChannel(member.guild.id, channelId).catch(() => null);
    }
    if (!temp) {
      temp = await this.findUserTempChannel(member).catch(() => null);
    }
    if (!temp && member.voice?.channelId) {
      const voiceChannel = await member.guild.channels.fetch(member.voice.channelId).catch(() => null);
      if (voiceChannel) {
        const hubRes = await query(
          `SELECT * FROM join_create_hubs WHERE guild_id = $1 AND (category_id = $2 OR source_channel_id = $3) LIMIT 1`,
          [member.guild.id, voiceChannel.parentId, voiceChannel.id]
        ).catch(() => ({ rows: [] }));

        if (hubRes.rows.length > 0) {
          const adopted = await query(
            `INSERT INTO join_create_temp_channels (guild_id, hub_id, channel_id, owner_user_id, status, name, locked, user_limit)
             VALUES ($1, $2, $3, $4, 'ACTIVE', $5, false, $6)
             ON CONFLICT (channel_id) DO UPDATE SET status = 'ACTIVE', updated_at = NOW()
             RETURNING *`,
            [member.guild.id, hubRes.rows[0].id, voiceChannel.id, member.id, voiceChannel.name, voiceChannel.userLimit || 0]
          ).catch(() => ({ rows: [] }));

          if (adopted.rows[0]) {
            temp = { ...adopted.rows[0], ...hubRes.rows[0] };
          }
        }
      }
    }

    if (!temp) {
      return {
        embeds: [createBaseEmbed({
          title: '🎙️ Temporary Voice Control Dashboard',
          description: 'You are not currently in or managing an active temporary voice channel.\n\nJoin a **Join-to-Create** hub channel to generate your personal temporary voice room, or use `/vc` while inside your temporary channel.',
          color: SlickBotColors.WARNING
        })]
      };
    }

    if (!this.canManageTemp(member, temp)) {
      const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
      const ownerMember = temp.owner_user_id ? await member.guild.members.fetch(temp.owner_user_id).catch(() => null) : null;
      const ownerInChannel = ownerMember?.voice?.channelId === temp.channel_id;

      if (!ownerInChannel && member.voice?.channelId === temp.channel_id) {
        return {
          embeds: [createBaseEmbed({
            title: '👑 Claim Temporary Voice Channel',
            description: `The original owner of <#${temp.channel_id}> has left the voice room.\n\nYou can claim ownership of this channel using the button below.`,
            color: SlickBotColors.Gold
          })],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`${CustomIds.JoinCreateClaimPrefix}${temp.channel_id}`).setLabel('👑 Claim Room Ownership').setStyle(ButtonStyle.Primary)
            )
          ]
        };
      }

      return {
        embeds: [createBaseEmbed({
          title: '🎙️ Temporary Voice Control Dashboard',
          description: `This voice channel (<#${temp.channel_id}>) is managed by <@${temp.owner_user_id}>.\n\nOnly the room owner or server staff can modify channel settings.`,
          color: SlickBotColors.WARNING
        })]
      };
    }

    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    const payload = this.buildTempControlPayload(temp, channel);
    payload.content = undefined; // Don't ping on ephemeral personal dashboard
    return payload;
  }

  buildRenameModal(channelId, channelName = null) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateRenameModalPrefix}${channelId}`,
      title: 'Rename Voice Channel',
      inputId: 'name',
      label: 'New channel name',
      placeholder: 'Example: Study Room',
      maxLength: 80,
      value: channelName
    });
  }

  buildLimitModal(channelId, currentLimit = 0) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateLimitModalPrefix}${channelId}`,
      title: 'Set User Limit',
      inputId: 'limit',
      label: 'User limit, 0 for no limit',
      placeholder: '0-99',
      maxLength: 2,
      value: String(currentLimit || 0)
    });
  }

  buildBitrateModal(channelId, currentBitrate = 64) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateBitrateModalPrefix}${channelId}`,
      title: 'Set Audio Bitrate (kbps)',
      inputId: 'bitrate',
      label: 'Bitrate in kbps (e.g. 64, 96, 128, 256, 384)',
      placeholder: '64',
      maxLength: 3,
      value: String(currentBitrate || 64)
    });
  }

  buildPermitModal(channelId) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreatePermitModalPrefix}${channelId}`,
      title: 'Permit User',
      inputId: 'user',
      label: 'User mention or ID',
      placeholder: '@user or 123456789012345678',
      maxLength: 80
    });
  }

  buildRemoveModal(channelId) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateRemoveModalPrefix}${channelId}`,
      title: 'Remove User',
      inputId: 'user',
      label: 'User mention or ID',
      placeholder: '@user or 123456789012345678',
      maxLength: 80
    });
  }

  buildTransferModal(channelId) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateTransferModalPrefix}${channelId}`,
      title: 'Transfer Ownership',
      inputId: 'user',
      label: 'New owner mention or ID',
      placeholder: '@user or 123456789012345678',
      maxLength: 80
    });
  }

  buildDeleteConfirmModal(channelId) {
    return buildSingleInputModal({
      customId: `${CustomIds.JoinCreateDeleteConfirmPrefix}${channelId}`,
      title: 'Delete Voice Channel',
      inputId: 'confirm',
      label: 'Type DELETE to confirm',
      placeholder: 'DELETE',
      maxLength: 10
    });
  }

  buildUserSelectPayload(channelId, action) {
    const actions = {
      permit: {
        customId: `${CustomIds.JoinCreatePermitUserSelectPrefix}${channelId}`,
        title: 'Permit User',
        description: 'Search for and select the member who should be allowed to view and connect to this temporary voice channel.',
        placeholder: 'Select a user to permit'
      },
      kick: {
        customId: `${CustomIds.JoinCreateKickUserSelectPrefix}${channelId}`,
        title: 'Kick User from Voice',
        description: 'Select a user currently in the voice channel to disconnect them from this room.',
        placeholder: 'Select a user to disconnect'
      },
      ban: {
        customId: `${CustomIds.JoinCreateBanUserSelectPrefix}${channelId}`,
        title: 'Block / Ban User from Voice',
        description: 'Select a user to disconnect and block them from viewing or reconnecting to this room.',
        placeholder: 'Select a user to block/ban'
      },
      remove: {
        customId: `${CustomIds.JoinCreateRemoveUserSelectPrefix}${channelId}`,
        title: 'Remove User',
        description: 'Search for and select the member who should be removed from this temporary voice channel.',
        placeholder: 'Select a user to remove'
      },
      transfer: {
        customId: `${CustomIds.JoinCreateTransferUserSelectPrefix}${channelId}`,
        title: 'Transfer Ownership',
        description: 'Search for and select the member who should become the new temporary voice channel owner.',
        placeholder: 'Select the new owner'
      }
    };
    const config = actions[action];
    if (!config) throw new Error('Unknown temporary voice user control.');
    const menu = new UserSelectMenuBuilder()
      .setCustomId(config.customId)
      .setPlaceholder(config.placeholder)
      .setMinValues(1)
      .setMaxValues(1);
    return {
      embeds: [createBaseEmbed({
        title: config.title,
        description: `${config.description}\n\nUse Discord's user picker below instead of typing a username or user ID.`,
        color: SlickBotColors.INFO
      })],
      components: [new ActionRowBuilder().addComponents(menu)]
    };
  }

  async postControlPanel(guild, temp, logger = null) {
    let channel = await guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel || typeof channel.send !== 'function') {
      const reason = 'SlickBot could not post the temporary voice control panel because the channel does not support messages or the bot lacks access.';
      await query(`UPDATE join_create_temp_channels SET control_message_error = $2, updated_at = NOW() WHERE channel_id = $1`, [temp.channel_id, reason]).catch(() => {});
      return { ok: false, reason };
    }
    const fullTemp = await this.findActiveTempByChannel(guild.id, temp.channel_id).catch(() => temp);
    const payload = this.buildTempControlPayload(fullTemp || temp, channel);

    let message = null;
    let lastError = null;

    try {
      message = await channel.send(payload);
    } catch (err) {
      lastError = err;
      // Retry after a brief delay in case voice text channel permissions were propagating
      await new Promise((resolve) => setTimeout(resolve, 1000));
      channel = await guild.channels.fetch(temp.channel_id).catch(() => null);
      if (channel && typeof channel.send === 'function') {
        message = await channel.send(payload).catch((retryErr) => {
          lastError = retryErr;
          return null;
        });
      }
    }

    if (!message) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError || 'Message send failed.');
      await query(`UPDATE join_create_temp_channels SET control_message_error = $2, updated_at = NOW() WHERE channel_id = $1`, [temp.channel_id, reason]).catch(() => {});
      await logger?.log({
        guildId: guild.id,
        eventKey: 'join-create-error',
        title: 'Temp Voice Control Panel Not Posted',
        body: [`Channel: <#${temp.channel_id}>`, `Reason: ${reason}`].join('\n'),
        metadata: { channelId: temp.channel_id, reason }
      }).catch(() => {});
      return { ok: false, reason };
    }

    await query(`UPDATE join_create_temp_channels SET control_message_id = $2, control_message_error = NULL, updated_at = NOW() WHERE channel_id = $1`, [temp.channel_id, message.id]).catch(() => {});
    return { ok: true, message };
  }

  async refreshControlPanel(guild, channelId, logger = null) {
    const temp = await this.findActiveTempByChannel(guild.id, channelId).catch(() => null);
    if (!temp) return { ok: false, reason: 'Temporary channel not found.' };
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return { ok: false, reason: 'Temporary channel message chat is unavailable.' };
    const payload = this.buildTempControlPayload(temp, channel);
    if (temp.control_message_id && typeof channel.messages?.fetch === 'function') {
      const message = await channel.messages.fetch(temp.control_message_id).catch(() => null);
      if (message) {
        await message.edit(payload).catch(async () => {
          await this.postControlPanel(guild, temp, logger).catch(() => null);
        });
        return { ok: true, updated: true };
      }
    }
    return this.postControlPanel(guild, temp, logger);
  }


  async claimFromControl(member, channelId) {
    const temp = await this.findActiveTempByChannel(member.guild.id, channelId);
    if (!temp) throw new Error('This temporary voice channel is no longer active.');
    if (member.voice?.channelId !== channelId) throw new Error('Join this temporary voice channel before claiming it.');
    const channel = await member.guild.channels.fetch(temp.channel_id).catch(() => null);
    if (!channel) throw new Error('The temporary voice channel no longer exists.');
    if (temp.owner_user_id) {
      const owner = await member.guild.members.fetch(temp.owner_user_id).catch(() => null);
      if (owner?.voice?.channelId === channel.id) throw new Error('The current owner is still in this channel.');
    }
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      Connect: true,
    }, { reason: `SlickBot temp voice claimed from control panel by ${member.user.tag}` });
    const result = await query(`UPDATE join_create_temp_channels SET owner_user_id = $2, updated_at = NOW() WHERE channel_id = $1 RETURNING *`, [channel.id, member.id]);
    await this.refreshControlPanel(member.guild, channel.id).catch(() => null);
    return { channel, temp: result.rows[0] || temp };
  }

  async deleteTempByMember(member, logger = null, reason = 'owner deleted temporary voice channel') {
    const temp = await this.findUserTempChannel(member);
    if (!temp) throw new Error('You do not currently own or manage an active temporary voice channel.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    await this.deleteTempChannel(member.guild, temp, logger, reason);
    return temp;
  }

  async deleteTempFromControl(member, channelId, logger = null) {
    const temp = await this.findActiveTempByChannel(member.guild.id, channelId);
    if (!temp) throw new Error('This temporary voice channel is no longer active.');
    if (!this.canManageTemp(member, temp)) throw new Error('You can only manage your own temporary voice channel.');
    await this.deleteTempChannel(member.guild, temp, logger, `deleted from control panel by ${member.user.tag}`);
    return temp;
  }

  async buildManagerPanel(guild) {
    const { createButtonRow, createPanelButton, ButtonStyle } = require('../ui/uiService');
    const { CustomIds } = require('../ui/customIds');
    const hubs = await this.listHubs(guild.id).catch(() => []);
    const active = await this.listActiveTempChannels(guild.id).catch(() => []);
    const enabled = hubs.filter((hub) => hub.enabled).length;
    const lines = [
      `Configured Hubs: **${hubs.length}** · Enabled: **${enabled}**`,
      `Active Temporary Channels: **${active.length}**`,
      '',
      hubs.length ? '**Hubs**' : '**Hubs**\nNo join-to-create hubs configured yet.',
      ...hubs.slice(0, 10).map((hub) => `• ${hub.enabled ? '🟢' : '🔴'} **${hub.hub_name || 'Join to Create'}** — ${channelLabel(hub.source_channel_id)} → ${hub.category_id ? `<#${hub.category_id}>` : 'source category'} · ${hub.active_count || 0} active`),
      hubs.length > 10 ? `• +${hubs.length - 10} more hub(s)` : null,
      '',
      'Use `/join-create setup` to register an existing voice channel, or `/join-create create-hub` to create and register a new one.'
    ].filter(Boolean);

    const embed = createBaseEmbed({
      title: 'SlickBot Community Setup • Join-to-Create Center',
      description: lines.join('\n'),
      color: hubs.length ? SlickBotColors.SUCCESS : SlickBotColors.WARNING,
      footer: 'SlickBot Join-to-Create'
    });

    const moduleCfg = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'JOIN_TO_CREATE' LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
    const jtcEnabled = moduleCfg.rows[0]?.enabled ?? true;

    const row = createButtonRow([
      createPanelButton(`${CustomIds.OnboardingModulePrefix}JOIN_TO_CREATE`, 'Quick Setup', ButtonStyle.Success, '🚀'),
      createPanelButton(`${CustomIds.ModuleTogglePrefix}JOIN_TO_CREATE`, jtcEnabled ? 'Disable Module' : 'Enable Module', jtcEnabled ? ButtonStyle.Danger : ButtonStyle.Success, jtcEnabled ? '⏸️' : '▶️'),
      createPanelButton(CustomIds.JoinCreateRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
      createPanelButton(CustomIds.SetupCategoryCommunity, 'Community', ButtonStyle.Primary, '✨'),
      createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
    ]);

    return { embeds: [embed], components: [row] };
  }

  async buildHubEmbed(guildId, hubId) {
    const hub = await this.getHubById(guildId, hubId);
    if (!hub) throw new Error('Join-to-create hub not found.');
    const active = await this.listActiveTempChannels(guildId, hub.id);
    return createBaseEmbed({
      title: `Join-to-Create Hub: ${hub.hub_name || 'Join to Create'}`,
      description: [
        `Status: **${boolLabel(hub.enabled)}**`,
        `Source Channel: ${channelLabel(hub.source_channel_id)}`,
        `Category: ${channelLabel(hub.category_id, 'Source channel category')}`,
        `Name Template: \`${hub.name_template || "{username}'s Voice"}\``,
        `Default Limit: **${hub.user_limit || 0}**`,
        `Private By Default: **${boolLabel(hub.private_enabled)}**`,
        `Owner Controls: **${boolLabel(hub.owner_controls_enabled)}**`,
        `Delete When Empty: **${boolLabel(hub.delete_when_empty)}** after **${hub.empty_delete_delay_seconds || 30}s**`,
        `Staff Role: ${hub.staff_role_id ? `<@&${hub.staff_role_id}>` : 'Not set'}`,
        `Active Temporary Channels: **${active.length}**`
      ].join('\n'),
      color: hub.enabled ? SlickBotColors.INFO : SlickBotColors.MUTED
    });
  }
}

module.exports = { JoinCreateService };
