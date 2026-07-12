const { ChannelType, PermissionsBitField } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

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
      `SELECT * FROM join_create_hubs WHERE guild_id = $1 AND source_channel_id = $2 AND enabled = true LIMIT 1`,
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

    if (hub.private_enabled) {
      overwrites.push({ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect] });
      overwrites.push({ id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
      if (hub.staff_role_id) {
        overwrites.push({ id: hub.staff_role_id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] });
      }
      if (me) {
        overwrites.push({ id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers] });
      }
    } else if (hub.owner_controls_enabled) {
      overwrites.push({ id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
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
    return { channel, temp: result.rows[0] || temp };
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
    return { channel, temp: result.rows[0] || temp };
  }

  async buildManagerPanel(guild) {
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
    return {
      embeds: [createBaseEmbed({
        title: 'SlickBot Join-to-Create Center',
        description: lines.join('\n'),
        color: hubs.length ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
      })]
    };
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
