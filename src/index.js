const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const { env, shouldAutoDeployCommands } = require('./config/env');
const { commandMap } = require('./commands');
const { deployCommands } = require('./deployCommands');
const { initDatabase } = require('./services/initDatabase');
const { query, closeDatabase } = require('./services/db');
const { startHealthServer } = require('./services/healthServer');
const { replyPrivate } = require('./utils/reply');
const { PermissionService } = require('./modules/permissions/permissionService');
const { LoggingService } = require('./modules/logging/loggingService');
const { StatusService } = require('./modules/status/statusService');
const { ModerationService } = require('./modules/moderation/moderationService');
const { ApplicationService } = require('./modules/support/supportService');
const { handleMemberJoin: handleWelcomeMemberJoin } = require('./modules/community/welcomeService');
const { GiveawayService } = require('./modules/community/giveawayService');
const { BirthdayService } = require('./modules/community/birthdayService');
const { ScheduledMessageService } = require('./modules/automation/scheduledMessageService');
const { ServerStatsService } = require('./modules/community/serverStatsService');
const { BotUpdatesService } = require('./modules/status/botUpdatesService');
const { CustomCommandService } = require('./modules/custom/customCommandService');
const { JoinCreateService } = require('./modules/voice/joinCreateService');
const { LevelingService } = require('./modules/community/levelingService');
const { CommunityGameService } = require('./modules/community/gameService');
const { FaqService } = require('./modules/community/faqService');
const { TemporaryRoleService } = require('./modules/moderation/tempRoleService');
const { AchievementService, ACHIEVEMENT_KEYS } = require('./modules/community/achievementService');
const { SocialFeedService } = require('./modules/automation/socialFeedService');
const { AutoModService } = require('./modules/moderation/autoModService');
const { UtilityService } = require('./modules/utility/utilityService');
const { StarboardService } = require('./modules/community/starboardService');
const { handleReactionRole, syncAllPublishedReactionPanels } = require('./modules/community/rolePanelService');
const { handleComponentInteraction } = require('./services/interactionRouter');
const { ActionKeys } = require('./modules/permissions/actionKeys');
const { ModuleKeys } = require('./modules/moduleRegistry');
const { guildAnalyticsService } = require('./modules/logging/analyticsService');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember]
});

const permissions = new PermissionService();
const logger = new LoggingService(client);
const status = new StatusService(client);
const moderation = new ModerationService();
const applications = new ApplicationService();
const giveaways = new GiveawayService();
const birthdays = new BirthdayService();
const scheduledMessages = new ScheduledMessageService();
const serverStats = new ServerStatsService();
const botUpdates = new BotUpdatesService();
const customCommands = new CustomCommandService();
const joinCreate = new JoinCreateService();
const leveling = new LevelingService();
const communityGames = new CommunityGameService();
const faq = new FaqService();
const tempRoles = new TemporaryRoleService();
const achievements = new AchievementService();
const socialFeeds = new SocialFeedService();
const autoMod = new AutoModService();
const utility = new UtilityService();
const starboard = new StarboardService();
const healthServer = startHealthServer(client);

const { TaskScheduler } = require('./services/taskScheduler');

const taskScheduler = new TaskScheduler();

taskScheduler
  .registerTask({
    name: 'giveaways',
    intervalMs: 60 * 1000,
    initialDelayMs: 2 * 1000,
    immediate: true,
    run: (readyClient, log) => giveaways.processDueGiveaways(readyClient, log)
  })
  .registerTask({
    name: 'scheduledMessages',
    intervalMs: 60 * 1000,
    initialDelayMs: 4 * 1000,
    immediate: true,
    run: (readyClient, log) => scheduledMessages.processDue(readyClient, log)
  })
  .registerTask({
    name: 'applications',
    intervalMs: 30 * 1000,
    initialDelayMs: 6 * 1000,
    immediate: true,
    run: (readyClient, log) => applications.processExpiredSessions(readyClient, log)
  })
  .registerTask({
    name: 'tempRoles',
    intervalMs: 60 * 1000,
    initialDelayMs: 8 * 1000,
    immediate: true,
    run: (readyClient, log) => tempRoles.processExpired(readyClient, log)
  })
  .registerTask({
    name: 'reminders',
    intervalMs: 30 * 1000,
    initialDelayMs: 10 * 1000,
    immediate: true,
    run: (readyClient, log) => utility.processDueReminders(readyClient, log)
  })
  .registerTask({
    name: 'polls',
    intervalMs: 60 * 1000,
    initialDelayMs: 12 * 1000,
    immediate: true,
    run: (readyClient, log) => utility.processExpiredPolls(readyClient, log)
  })
  .registerTask({
    name: 'communityGames',
    intervalMs: 5 * 60 * 1000,
    initialDelayMs: 14 * 1000,
    immediate: true,
    run: (readyClient) => communityGames.expireStaleSessions(readyClient)
  })
  .registerTask({
    name: 'achievementsVoice',
    intervalMs: 5 * 60 * 1000,
    initialDelayMs: 16 * 1000,
    immediate: true,
    run: (readyClient, log) => achievements.processVoiceHeartbeat(readyClient, log)
  })
  .registerTask({
    name: 'socialFeeds',
    intervalMs: 60 * 1000,
    initialDelayMs: 18 * 1000,
    immediate: true,
    run: (readyClient, log) => socialFeeds.processFeeds(readyClient, log)
  })
  .registerTask({
    name: 'voiceXp',
    intervalMs: 60 * 1000,
    initialDelayMs: 20 * 1000,
    immediate: false,
    run: (readyClient, log) => leveling.processVoiceXpSweep(readyClient, log)
  })
  .registerTask({
    name: 'birthdays',
    intervalMs: 60 * 60 * 1000,
    initialDelayMs: 20 * 1000,
    immediate: true,
    run: (readyClient, log) => birthdays.processBirthdays(readyClient, log)
  })
  .registerTask({
    name: 'serverStats',
    intervalMs: 15 * 60 * 1000,
    initialDelayMs: 30 * 1000,
    immediate: false,
    run: async (readyClient, log) => {
      const guilds = Array.from(readyClient.guilds.cache.values());
      for (let i = 0; i < guilds.length; i++) {
        const guild = guilds[i];
        await serverStats.updateStats(guild, log, '15-minute scheduled interval', { forceMemberFetch: false }).catch(() => {});
        if (i < guilds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
  });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`SlickBot logged in as ${readyClient.user.tag}.`);

  if (env.DISCORD_GUILD_ID) {
    await permissions.ensureGuildConfig(env.DISCORD_GUILD_ID, readyClient.guilds.cache.get(env.DISCORD_GUILD_ID)?.name || null);
    await status.applySavedPresence(env.DISCORD_GUILD_ID);
  } else {
    await status.applySavedPresence(null);
  }

  for (const guild of readyClient.guilds.cache.values()) {
    await permissions.ensureGuildConfig(guild.id, guild.name).catch((error) => console.error(`Failed to ensure guild config for ${guild.name}:`, error));
  }

  taskScheduler.start(readyClient, logger);

  for (const guild of readyClient.guilds.cache.values()) {
    serverStats.scheduleUpdate(guild, logger, 'startup', 10 * 1000, { forceMemberFetch: false });
  }

  await botUpdates.announceStartup(readyClient, logger).catch((error) => console.error('Failed to process bot update announcements:', error));
  await joinCreate.repairStartup(readyClient, logger).catch((error) => console.error('Failed to repair join-to-create channels:', error));

  for (const guild of readyClient.guilds.cache.values()) {
    const reactionRolesEnabled = await permissions.isModuleEnabled(guild.id, 'REACTION_ROLES').catch(() => false);
    if (reactionRolesEnabled) {
      syncAllPublishedReactionPanels(readyClient, guild.id)
        .then((result) => console.log(`Reaction panel sync for ${guild.name}: ${result.messages} message(s), ${result.added} reaction(s) available.`))
        .catch((error) => console.error(`Failed to sync reaction panels for ${guild.name}:`, error));
    }
  }

  // Command Deduplication: If running with global commands, sweep guilds to purge any leftover legacy guild-scoped commands
  if (!env.DISCORD_GUILD_ID) {
    for (const guild of readyClient.guilds.cache.values()) {
      guild.commands.fetch().then((guildCommands) => {
        if (guildCommands && guildCommands.size > 0) {
          console.log(`[Command Deduplication] Detected ${guildCommands.size} legacy guild-scoped command(s) in "${guild.name}" (${guild.id}). Purging to resolve duplicate entries...`);
          guild.commands.set([]).then(() => {
            console.log(`[Command Deduplication] Successfully cleared legacy guild commands for "${guild.name}". Only global commands remain.`);
          }).catch((err) => console.warn(`[Command Deduplication] Could not clear guild commands for "${guild.name}":`, err.message));
        }
      }).catch(() => {});
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  await permissions.ensureGuildConfig(guild.id, guild.name);
  await logger.writeAudit({
    guildId: guild.id,
    actionKey: 'guild.joined',
    targetType: 'Guild',
    targetId: guild.id,
    summary: `SlickBot joined guild ${guild.name}.`
  });

  try {
    const { OnboardingService } = require('./modules/onboarding/onboardingService');
    const onboarding = new OnboardingService();
    const payload = onboarding.buildGuildJoinGreetingPayload(guild);
    const targetChannel = guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
    let sent = false;
    if (targetChannel && typeof targetChannel.send === 'function') {
      const msg = await targetChannel.send(payload).catch(() => null);
      if (msg) sent = true;
    }

    // Fallback: If channel greeting could not be posted, send setup greeting directly to the server owner
    if (!sent) {
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner && typeof owner.send === 'function') {
        await owner.send(payload).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`Failed to send join greeting in ${guild.name}:`, err);
  }
});

client.on(Events.GuildDelete, async (guild) => {
  console.log(`SlickBot removed from guild: ${guild.name} (${guild.id})`);

  // Evict guild from in-memory service caches
  permissions.invalidateGuild(guild.id);
  autoMod.invalidateGuild(guild.id);
  leveling.invalidateGuild(guild.id);
  serverStats.invalidateGuild(guild.id);
  utility.invalidateGuild(guild.id);
  joinCreate.invalidateGuild(guild.id);
  socialFeeds.invalidateGuild(guild.id);
  birthdays.invalidateGuild(guild.id);

  // Mark guild inactive in database
  await query(
    `UPDATE guild_configs
     SET active = false, left_at = NOW(), updated_at = NOW()
     WHERE guild_id = $1`,
    [guild.id]
  ).catch((err) => console.error(`Failed to mark guild ${guild.id} inactive on GuildDelete:`, err));

  await logger.writeAudit({
    guildId: guild.id,
    actionKey: 'guild.left',
    targetType: 'Guild',
    targetId: guild.id,
    summary: `SlickBot left or was removed from guild ${guild.name}.`
  }).catch(() => {});
});

client.on(Events.ChannelCreate, async (channel) => {
  try {
    await autoMod.handleChannelCreate(channel);
  } catch (err) {
    console.error('Failed to apply timeout role permissions on channelCreate:', err);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  guildAnalyticsService.trackMemberJoin(member.guild.id);
  await logger.log({
    guildId: member.guild.id,
    eventKey: 'member-join',
    title: 'Member joined',
    body: `<@${member.id}> (${member.user.tag})\nAccount Created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
    author: {
      name: member.user.username,
      iconURL: member.user.displayAvatarURL()
    },
    thumbnailUrl: member.user.displayAvatarURL({ size: 256 }),
    footer: `ID: ${member.id}`,
    color: 0x57f287,
    metadata: { userId: member.id, bot: member.user.bot }
  }).catch((error) => console.error('Failed to log member join:', error));

  const welcomeEnabled = await permissions.isModuleEnabled(member.guild.id, 'WELCOME').catch(() => false);
  if (welcomeEnabled) {
    await handleWelcomeMemberJoin(member, logger).catch((error) => console.error('Failed to run welcome flow:', error));
  }
  serverStats.scheduleUpdate(member.guild, logger, 'member join', 10 * 1000, { forceMemberFetch: true });
});

client.on(Events.GuildMemberRemove, async (member) => {
  guildAnalyticsService.trackMemberLeave(member.guild.id);
  serverStats.scheduleUpdate(member.guild, logger, 'member leave', 10 * 1000, { forceMemberFetch: true });
  const joinedTime = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '*Unknown*';
  const roleList = member.roles?.cache
    ? member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(', ') || 'None'
    : 'None';

  await logger.log({
    guildId: member.guild.id,
    eventKey: 'member-leave',
    title: 'Member left',
    body: `<@${member.id}> (${member.user?.tag || 'Unknown'})\nJoined Server: ${joinedTime}\nRoles: ${roleList}`,
    author: {
      name: member.user?.username || member.id,
      iconURL: member.user?.displayAvatarURL?.()
    },
    thumbnailUrl: member.user?.displayAvatarURL?.({ size: 256 }),
    footer: `ID: ${member.id}`,
    color: 0xed4245,
    metadata: { userId: member.id, bot: member.user?.bot || false }
  }).catch((error) => console.error('Failed to log member leave:', error));
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (newMember.user?.bot) return;

  // Nickname change
  if (oldMember.nickname !== newMember.nickname) {
    const title = !oldMember.nickname && newMember.nickname
      ? 'Nickname added'
      : oldMember.nickname && !newMember.nickname
        ? 'Nickname removed'
        : 'Nickname changed';

    const beforeText = oldMember.nickname || oldMember.user.username;
    const afterText = newMember.nickname || newMember.user.username;

    await logger.log({
      guildId: newMember.guild.id,
      eventKey: 'member-nickname',
      title,
      body: `Before: ${beforeText}\n+After: ${afterText}`,
      author: {
        name: newMember.user.username,
        iconURL: newMember.user.displayAvatarURL()
      },
      thumbnailUrl: newMember.user.displayAvatarURL({ size: 256 }),
      footer: `ID: ${newMember.id}`,
      color: 0x5865f2,
      metadata: { userId: newMember.id, before: oldMember.nickname, after: newMember.nickname }
    }).catch((error) => console.error('Failed to log nickname change:', error));
  }

  // Server Avatar change
  if (oldMember.avatar !== newMember.avatar) {
    await logger.log({
      guildId: newMember.guild.id,
      eventKey: 'member-avatar',
      title: 'Avatar update',
      body: `<@${newMember.id}>`,
      author: {
        name: newMember.user.username,
        iconURL: newMember.displayAvatarURL()
      },
      thumbnailUrl: newMember.displayAvatarURL({ size: 512 }),
      footer: `ID: ${newMember.id}`,
      color: 0x5865f2,
      metadata: { userId: newMember.id }
    }).catch((error) => console.error('Failed to log member avatar change:', error));
  }

  // Role changes
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newRoleIds].filter((roleId) => !oldRoleIds.has(roleId));
  const removedRoles = [...oldRoleIds].filter((roleId) => !newRoleIds.has(roleId));

  if (addedRoles.length || removedRoles.length) {
    const roleLines = [
      `<@${newMember.id}>`,
      addedRoles.length ? `+Added: ${addedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}` : null,
      removedRoles.length ? `-Removed: ${removedRoles.map((roleId) => `<@&${roleId}>`).join(', ')}` : null
    ].filter(Boolean).join('\n');

    await logger.log({
      guildId: newMember.guild.id,
      eventKey: 'member-roles',
      title: 'Role update',
      body: roleLines,
      author: {
        name: newMember.user.username,
        iconURL: newMember.user.displayAvatarURL()
      },
      thumbnailUrl: newMember.user.displayAvatarURL({ size: 256 }),
      footer: `ID: ${newMember.id}`,
      color: 0x5865f2,
      metadata: { userId: newMember.id, addedRoles, removedRoles }
    }).catch((error) => console.error('Failed to log member role change:', error));
  }

  const wasBoosting = Boolean(oldMember.premiumSince);
  const isBoosting = Boolean(newMember.premiumSince);
  if (wasBoosting !== isBoosting) {
    const achievementsEnabled = await permissions.isModuleEnabled(newMember.guild.id, ModuleKeys.ACHIEVEMENTS).catch(() => false);
    if (achievementsEnabled && isBoosting) {
      await achievements.recordOneTimeAchievement({ guild: newMember.guild, user: newMember.user, achievementKey: ACHIEVEMENT_KEYS.SERVER_BOOSTING, logger })
        .catch((error) => console.error('Failed to record server boost achievement:', error));
    }
    if (achievementsEnabled && !isBoosting) {
      await achievements.revokeOneTimeAchievementIfConfigured({ guild: newMember.guild, userId: newMember.id, achievementKey: ACHIEVEMENT_KEYS.SERVER_BOOSTING, logger })
        .catch((error) => console.error('Failed to process server boost achievement removal:', error));
    }
  }
});

client.on(Events.UserUpdate, async (oldUser, newUser) => {
  if (newUser.bot) return;

  const usernameChanged = oldUser.username !== newUser.username;
  const avatarChanged = oldUser.avatar !== newUser.avatar;

  if (!usernameChanged && !avatarChanged) return;

  for (const guild of client.guilds.cache.values()) {
    if (guild.members.cache.has(newUser.id)) {
      if (usernameChanged) {
        await logger.log({
          guildId: guild.id,
          eventKey: 'user-update',
          title: 'Username changed',
          body: `Before: ${oldUser.username}\n+After: ${newUser.username}`,
          author: {
            name: newUser.username,
            iconURL: newUser.displayAvatarURL()
          },
          thumbnailUrl: newUser.displayAvatarURL({ size: 256 }),
          footer: `ID: ${newUser.id}`,
          color: 0x5865f2,
          metadata: { userId: newUser.id, before: oldUser.username, after: newUser.username }
        }).catch(() => {});
      }

      if (avatarChanged) {
        await logger.log({
          guildId: guild.id,
          eventKey: 'member-avatar',
          title: 'Avatar update',
          body: `<@${newUser.id}>`,
          author: {
            name: newUser.username,
            iconURL: newUser.displayAvatarURL()
          },
          thumbnailUrl: newUser.displayAvatarURL({ size: 512 }),
          footer: `ID: ${newUser.id}`,
          color: 0x5865f2,
          metadata: { userId: newUser.id }
        }).catch(() => {});
      }
    }
  }
});

client.on(Events.MessageDelete, async (message) => {
  try {
    utility.recordDeletedMessage(message);
  } catch (e) {}
  await handleCountingMessageMutationEvent(message, 'DELETED');
  await starboard.handleMessageDelete(message, client, logger).catch((error) => {
    console.error('Failed to handle starboard message delete:', error);
  });
  if (!message.guild || message.author?.bot) return;

  const attachmentUrls = message.attachments?.size
    ? message.attachments.map((a) => a.url).join('\n')
    : null;

  const bodyLines = [
    `Channel: <#${message.channelId}>`,
    `Author: <@${message.author?.id}> (${message.author?.tag || 'Unknown'})`,
    `Content: ${message.content || '*[Attachment/Embed only]*'}`,
    attachmentUrls ? `Attachments:\n${attachmentUrls}` : null
  ].filter(Boolean).join('\n');

  await logger.log({
    guildId: message.guild.id,
    eventKey: 'message-delete',
    title: 'Message deleted',
    body: bodyLines,
    author: {
      name: message.author?.username || 'Unknown',
      iconURL: message.author?.displayAvatarURL?.()
    },
    thumbnailUrl: message.author?.displayAvatarURL?.({ size: 256 }),
    imageUrl: message.attachments?.first()?.url || null,
    footer: `Author ID: ${message.author?.id || 'Unknown'} • Message ID: ${message.id}`,
    color: 0xed4245,
    metadata: {
      channelId: message.channelId,
      authorId: message.author?.id || null,
      messageId: message.id
    }
  }).catch((error) => console.error('Failed to log message delete:', error));
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user?.bot) return;
  await starboard.handleReactionAdd(reaction, user, client, logger).catch((error) => {
    console.error('Failed to process starboard reaction add:', error);
  });
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user?.bot) return;
  await starboard.handleReactionRemove(reaction, user, client, logger).catch((error) => {
    console.error('Failed to process starboard reaction remove:', error);
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  const oldContent = oldMessage.content || '[No previous content available]';
  const newContent = newMessage.content || '[No new content available]';
  if (oldContent === newContent) return;

  await handleCountingMessageMutationEvent(newMessage, 'EDITED');
  await logger.log({
    guildId: newMessage.guild.id,
    eventKey: 'message-edit',
    title: 'Message edited',
    body: [
      `Channel: <#${newMessage.channelId}> • [Jump to Message](${newMessage.url})`,
      `Before: ${oldContent}`,
      `+After: ${newContent}`
    ].join('\n'),
    author: {
      name: newMessage.author?.username || 'Unknown',
      iconURL: newMessage.author?.displayAvatarURL?.()
    },
    thumbnailUrl: newMessage.author?.displayAvatarURL?.({ size: 256 }),
    footer: `Author ID: ${newMessage.author?.id || 'Unknown'} • Message ID: ${newMessage.id}`,
    color: 0xfee75c,
    metadata: {
      channelId: newMessage.channelId,
      authorId: newMessage.author?.id || null,
      messageId: newMessage.id
    }
  }).catch((error) => console.error('Failed to log message edit:', error));
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guildId = newState.guild.id || oldState.guild.id;
  const user = newState.member?.user || oldState.member?.user;
  if (!guildId || user?.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  let action = 'Voice Channel Moved';
  let body = `<@${user ? user.id : 'Unknown'}> moved from <#${oldChannelId}> to <#${newChannelId}>.`;

  if (!oldChannelId && newChannelId) {
    action = 'Voice Channel Joined';
    body = `<@${user ? user.id : 'Unknown'}> joined <#${newChannelId}>.`;
  } else if (oldChannelId && !newChannelId) {
    action = 'Voice Channel Left';
    body = `<@${user ? user.id : 'Unknown'}> left <#${oldChannelId}>.`;
  }

  await logger.log({
    guildId,
    eventKey: action === 'Voice Channel Joined' ? 'voice-join' : action === 'Voice Channel Left' ? 'voice-leave' : 'voice-move',
    title: action,
    body,
    author: user ? {
      name: user.username,
      iconURL: user.displayAvatarURL()
    } : null,
    thumbnailUrl: user ? user.displayAvatarURL({ size: 256 }) : null,
    footer: `ID: ${user ? user.id : 'Unknown'}`,
    metadata: {
      userId: user?.id || null,
      oldChannelId,
      newChannelId
    }
  }).catch((error) => console.error('Failed to log voice state:', error));
  const guild = newState.guild || oldState.guild;
  const achievementsEnabled = await permissions.isModuleEnabled(guild.id, ModuleKeys.ACHIEVEMENTS).catch(() => false);
  if (achievementsEnabled) {
    await achievements.processVoiceStateUpdate(oldState, newState, logger).catch((error) => console.error('Failed to process achievement voice state:', error));
  }
  const joinCreateEnabled = await permissions.isModuleEnabled(guild.id, 'JOIN_TO_CREATE').catch(() => false);
  if (joinCreateEnabled) {
    await joinCreate.handleVoiceState(oldState, newState, logger).catch((error) => console.error('Failed to process join-to-create voice state:', error));
  }
  serverStats.scheduleVoiceStateUpdate(guild, logger, 'voice state');
});


client.on(Events.MessageCreate, async (message) => {
  if (message.author?.bot) return;

  if (message.guild) {
    guildAnalyticsService.trackMessage(message.guild.id, message.author.id);
    if (await permissions.isIgnored(message.guild.id, message.author.id).catch(() => false)) return;

    const autoModEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.AUTOMOD).catch(() => false);
    if (autoModEnabled) {
      const autoModResult = await autoMod.handleMessage(message, logger, moderation).catch((error) => {
        console.error('Failed to process AutoMod message check:', error);
        return { handled: false };
      });
      if (autoModResult?.handled) return;
    }

    let countingResult = { handled: false, suppressNormalXp: false };
    const activeCountingConfig = await communityGames.getActiveCountingConfigForChannel(message.guild.id, message.channelId).catch(() => null);
    if (activeCountingConfig) {
      const gamesEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.COMMUNITY_GAMES).catch(() => false);
      const gamesAccess = gamesEnabled
        ? await permissions.checkPublicInteraction(messageToPermissionInteraction(message), ActionKeys.GamesPlay, ModuleKeys.COMMUNITY_GAMES).catch(() => ({ allowed: false }))
        : { allowed: false };
      if (gamesAccess.allowed) {
        countingResult = await communityGames.handleCountingMessage(message, logger, activeCountingConfig).catch(async (error) => {
          console.error('Failed to process counting game message:', error);
          await logger.log({
            guildId: message.guild.id,
            eventKey: 'community-game-error',
            title: 'Community Game Error',
            body: error instanceof Error ? error.message : String(error),
            metadata: { game: 'COUNTING', channelId: message.channelId, authorId: message.author.id }
          }).catch(() => {});
          return { handled: false, suppressNormalXp: false };
        });
      }
    }

    const customCommandsEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.CUSTOM_COMMANDS).catch(() => false);
    if (customCommandsEnabled) {
      const customCommandAccess = await permissions.checkPublicInteraction(messageToPermissionInteraction(message), ActionKeys.CustomCommandsUse, ModuleKeys.CUSTOM_COMMANDS).catch(() => ({ allowed: false }));
      if (customCommandAccess.allowed) {
        await customCommands.handleMessage(message, logger).catch(async (error) => {
          console.error('Failed to process custom command:', error);
          await logger.log({
            guildId: message.guild.id,
            eventKey: 'custom-command-error',
            title: 'Custom Command Error',
            body: error instanceof Error ? error.message : String(error),
            metadata: { channelId: message.channelId, authorId: message.author.id }
          }).catch(() => {});
        });
      }
    }

    const achievementsEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.ACHIEVEMENTS).catch(() => false);
    if (achievementsEnabled) {
      await achievements.recordMessage(message, logger).catch((error) => console.error('Failed to process achievement message stat:', error));
    }

    const utilityEnabled = await permissions.isModuleEnabled(message.guild.id, ModuleKeys.UTILITY).catch(() => false);
    if (utilityEnabled) {
      await utility.handleMessageAfkCheck(message).catch((error) => console.error('Failed to process AFK check:', error));
    }

    const levelingEnabled = await permissions.isModuleEnabled(message.guild.id, 'LEVELING').catch(() => false);
    if (levelingEnabled && !countingResult.suppressNormalXp) {
      await leveling.processMessage(message, logger).catch((error) => console.error('Failed to process message XP:', error));
    }
    return;
  }

  await applications.handleDmResponse({ message, client, logger }).catch((error) => {
    console.error('Failed to handle DM application response:', error);
  });
});


async function handleCountingMessageMutationEvent(message, mutationType) {
  if (!message?.guildId) return;
  const gamesEnabled = await permissions.isModuleEnabled(message.guildId, ModuleKeys.COMMUNITY_GAMES).catch(() => false);
  if (!gamesEnabled) return;
  await communityGames.handleCountingMessageMutation(message, mutationType, logger).catch(async (error) => {
    console.error(`Failed to process ${mutationType.toLowerCase()} counting message:`, error);
    await logger.log({
      guildId: message.guildId,
      eventKey: 'community-game-error',
      title: 'Community Game Error',
      body: error instanceof Error ? error.message : String(error),
      metadata: { game: 'COUNTING', messageId: message.id, mutationType }
    }).catch(() => {});
  });
}


async function handleFaqThreadChange(thread, action) {
  const guildId = thread?.guild?.id || thread?.guildId;
  if (!guildId) return;
  const faqEnabled = await permissions.isModuleEnabled(guildId, ModuleKeys.FAQ).catch(() => false);
  if (!faqEnabled) return;
  await faq.handleForumThreadChange(thread, client, logger, action).catch(async (error) => {
    console.error(`Failed to refresh FAQ index after thread ${action}:`, error);
    await logger.log({
      guildId,
      eventKey: 'faq-error',
      title: 'FAQ Forum Refresh Failed',
      body: error instanceof Error ? error.message : String(error),
      metadata: { threadId: thread?.id || null, parentId: thread?.parentId || thread?.parent?.id || null, action }
    }).catch(() => {});
  });
}

client.on(Events.ThreadCreate, async (thread) => {
  await handleFaqThreadChange(thread, 'created');
  if (thread.guild) {
    await logger.log({
      guildId: thread.guild.id,
      eventKey: 'thread-create',
      title: 'Thread Created',
      body: [
        `Thread: <#${thread.id}> (\`${thread.name}\`)`,
        thread.parentId ? `Parent Channel: <#${thread.parentId}>` : null,
        thread.ownerId ? `Owner: <@${thread.ownerId}>` : null
      ].filter(Boolean).join('\n'),
      metadata: { threadId: thread.id, name: thread.name, parentId: thread.parentId }
    }).catch(() => {});
  }
});

client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
  await handleFaqThreadChange(newThread || oldThread, 'updated');
});

client.on(Events.ThreadDelete, async (thread) => {
  await handleFaqThreadChange(thread, 'deleted');
  if (thread.guild) {
    await logger.log({
      guildId: thread.guild.id,
      eventKey: 'thread-delete',
      title: 'Thread Deleted',
      body: [
        `Thread Name: **#${thread.name}**`,
        `Thread ID: \`${thread.id}\``,
        thread.parentId ? `Parent Channel: <#${thread.parentId}>` : null
      ].filter(Boolean).join('\n'),
      metadata: { threadId: thread.id, name: thread.name, parentId: thread.parentId }
    }).catch(() => {});
  }
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await logger.log({
    guildId: channel.guild.id,
    eventKey: 'channel-create',
    title: 'Channel Created',
    body: [
      `Channel: <#${channel.id}> (\`${channel.name}\`)`,
      `Type: **${channel.type}**`,
      channel.parentId ? `Category: <#${channel.parentId}>` : null
    ].filter(Boolean).join('\n'),
    metadata: { channelId: channel.id, name: channel.name, type: channel.type }
  }).catch((error) => console.error('Failed to log channel create:', error));
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await logger.log({
    guildId: channel.guild.id,
    eventKey: 'channel-delete',
    title: 'Channel Deleted',
    body: [
      `Channel Name: **#${channel.name}**`,
      `Channel ID: \`${channel.id}\``,
      `Type: **${channel.type}**`
    ].join('\n'),
    metadata: { channelId: channel.id, name: channel.name, type: channel.type }
  }).catch((error) => console.error('Failed to log channel delete:', error));
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Name: \`#${oldChannel.name}\` ➔ \`#${newChannel.name}\``);
  if (oldChannel.topic !== newChannel.topic) changes.push('Topic changed');
  if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`Slowmode: **${oldChannel.rateLimitPerUser || 0}s** ➔ **${newChannel.rateLimitPerUser || 0}s**`);
  if (oldChannel.parentId !== newChannel.parentId) changes.push(`Category: ${oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'None'} ➔ ${newChannel.parentId ? `<#${newChannel.parentId}>` : 'None'}`);
  if (oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: **${newChannel.nsfw ? 'Enabled' : 'Disabled'}**`);

  if (!changes.length) return;

  await logger.log({
    guildId: newChannel.guild.id,
    eventKey: 'channel-update',
    title: 'Channel Updated',
    body: [
      `Channel: <#${newChannel.id}> (\`${newChannel.name}\`)`,
      ...changes
    ].join('\n'),
    metadata: { channelId: newChannel.id, changes }
  }).catch((error) => console.error('Failed to log channel update:', error));
});

client.on(Events.GuildRoleCreate, async (role) => {
  await logger.log({
    guildId: role.guild.id,
    eventKey: 'role-create',
    title: 'Role Created',
    body: [
      `Role: <@&${role.id}> (\`${role.name}\`)`,
      `Color: \`${role.hexColor}\``,
      `Hoisted: **${role.hoist ? 'Yes' : 'No'}**`,
      `Mentionable: **${role.mentionable ? 'Yes' : 'No'}**`
    ].join('\n'),
    metadata: { roleId: role.id, name: role.name }
  }).catch((error) => console.error('Failed to log role create:', error));
});

client.on(Events.GuildRoleDelete, async (role) => {
  await logger.log({
    guildId: role.guild.id,
    eventKey: 'role-delete',
    title: 'Role Deleted',
    body: [
      `Role Name: **${role.name}**`,
      `Role ID: \`${role.id}\``
    ].join('\n'),
    metadata: { roleId: role.id, name: role.name }
  }).catch((error) => console.error('Failed to log role delete:', error));
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Name: \`${oldRole.name}\` ➔ \`${newRole.name}\``);
  if (oldRole.hexColor !== newRole.hexColor) changes.push(`Color: \`${oldRole.hexColor}\` ➔ \`${newRole.hexColor}\``);
  if (oldRole.hoist !== newRole.hoist) changes.push(`Hoisted: **${newRole.hoist ? 'Yes' : 'No'}**`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: **${newRole.mentionable ? 'Yes' : 'No'}**`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('Permissions modified');

  if (!changes.length) return;

  await logger.log({
    guildId: newRole.guild.id,
    eventKey: 'role-update',
    title: 'Role Updated',
    body: [
      `Role: <@&${newRole.id}> (\`${newRole.name}\`)`,
      ...changes
    ].join('\n'),
    metadata: { roleId: newRole.id, changes }
  }).catch((error) => console.error('Failed to log role update:', error));
});

client.on(Events.GuildBanAdd, async (ban) => {
  await logger.log({
    guildId: ban.guild.id,
    eventKey: 'guild-ban-add',
    title: 'Member banned',
    body: [
      `<@${ban.user.id}> (${ban.user.tag})`,
      ban.reason ? `Reason: ${ban.reason}` : '*No reason provided*'
    ].join('\n'),
    author: {
      name: ban.user.username,
      iconURL: ban.user.displayAvatarURL()
    },
    thumbnailUrl: ban.user.displayAvatarURL({ size: 256 }),
    footer: `ID: ${ban.user.id}`,
    color: 0xed4245,
    metadata: { userId: ban.user.id, reason: ban.reason }
  }).catch((error) => console.error('Failed to log ban add:', error));
});

client.on(Events.GuildBanRemove, async (ban) => {
  await logger.log({
    guildId: ban.guild.id,
    eventKey: 'guild-ban-remove',
    title: 'Member unbanned',
    body: `<@${ban.user.id}> (${ban.user.tag})`,
    author: {
      name: ban.user.username,
      iconURL: ban.user.displayAvatarURL()
    },
    thumbnailUrl: ban.user.displayAvatarURL({ size: 256 }),
    footer: `ID: ${ban.user.id}`,
    color: 0x57f287,
    metadata: { userId: ban.user.id }
  }).catch((error) => console.error('Failed to log ban remove:', error));
});

client.on(Events.InviteCreate, async (invite) => {
  if (!invite.guild) return;
  await logger.log({
    guildId: invite.guild.id,
    eventKey: 'invite-create',
    title: 'Invite created',
    body: [
      `Code: \`${invite.code}\``,
      `Channel: ${invite.channel ? `<#${invite.channel.id}>` : '*Unknown*'}`,
      `Created By: ${invite.inviter ? `<@${invite.inviter.id}> (${invite.inviter.tag})` : 'Unknown'}`,
      invite.maxUses ? `Max Uses: **${invite.maxUses}**` : 'Max Uses: **Unlimited**',
      invite.maxAge ? `Expires In: **${invite.maxAge}s**` : 'Expires: **Never**'
    ].join('\n'),
    author: invite.inviter ? {
      name: invite.inviter.username,
      iconURL: invite.inviter.displayAvatarURL()
    } : null,
    footer: `Invite Code: ${invite.code}`,
    color: 0x57f287,
    metadata: { code: invite.code, channelId: invite.channel?.id, inviterId: invite.inviter?.id }
  }).catch((error) => console.error('Failed to log invite create:', error));
});

client.on(Events.InviteDelete, async (invite) => {
  if (!invite.guild) return;
  await logger.log({
    guildId: invite.guild.id,
    eventKey: 'invite-delete',
    title: 'Invite deleted',
    body: [
      `Code: \`${invite.code}\``,
      `Channel: ${invite.channel ? `<#${invite.channel.id}>` : '*Unknown*'}`
    ].join('\n'),
    footer: `Invite Code: ${invite.code}`,
    color: 0xed4245,
    metadata: { code: invite.code, channelId: invite.channel?.id }
  }).catch((error) => console.error('Failed to log invite delete:', error));
});

client.on(Events.GuildEmojiCreate, async (emoji) => {
  await logger.log({
    guildId: emoji.guild.id,
    eventKey: 'emoji-create',
    title: 'Emoji added',
    body: [
      `Emoji: ${emoji} (\`:${emoji.name}:\`)`,
      `Animated: **${emoji.animated ? 'Yes' : 'No'}**`,
      `ID: \`${emoji.id}\``
    ].join('\n'),
    thumbnailUrl: emoji.imageURL?.() || null,
    footer: `ID: ${emoji.id}`,
    color: 0x57f287,
    metadata: { emojiId: emoji.id, name: emoji.name, animated: emoji.animated }
  }).catch((error) => console.error('Failed to log emoji create:', error));
});

client.on(Events.GuildEmojiDelete, async (emoji) => {
  await logger.log({
    guildId: emoji.guild.id,
    eventKey: 'emoji-delete',
    title: 'Emoji deleted',
    body: [
      `Emoji Name: \`:${emoji.name}:\``,
      `ID: \`${emoji.id}\``
    ].join('\n'),
    footer: `ID: ${emoji.id}`,
    color: 0xed4245,
    metadata: { emojiId: emoji.id, name: emoji.name }
  }).catch((error) => console.error('Failed to log emoji delete:', error));
});

client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
  if (oldEmoji.name === newEmoji.name) return;
  await logger.log({
    guildId: newEmoji.guild.id,
    eventKey: 'emoji-update',
    title: 'Emoji renamed',
    body: [
      `Emoji: ${newEmoji}`,
      `Before: \`:${oldEmoji.name}:\``,
      `+After: \`:${newEmoji.name}:\``
    ].join('\n'),
    thumbnailUrl: newEmoji.imageURL?.() || null,
    footer: `ID: ${newEmoji.id}`,
    color: 0xfee75c,
    metadata: { emojiId: newEmoji.id, before: oldEmoji.name, after: newEmoji.name }
  }).catch((error) => console.error('Failed to log emoji update:', error));
});

client.on(Events.GuildStickerCreate, async (sticker) => {
  if (!sticker.guild) return;
  await logger.log({
    guildId: sticker.guild.id,
    eventKey: 'sticker-create',
    title: 'Sticker added',
    body: [
      `Sticker: **${sticker.name}**`,
      `Description: ${sticker.description || '*None*'}`,
      `ID: \`${sticker.id}\``
    ].join('\n'),
    thumbnailUrl: sticker.url || null,
    footer: `ID: ${sticker.id}`,
    color: 0x57f287,
    metadata: { stickerId: sticker.id, name: sticker.name }
  }).catch((error) => console.error('Failed to log sticker create:', error));
});

client.on(Events.GuildStickerDelete, async (sticker) => {
  if (!sticker.guild) return;
  await logger.log({
    guildId: sticker.guild.id,
    eventKey: 'sticker-delete',
    title: 'Sticker deleted',
    body: [
      `Sticker Name: **${sticker.name}**`,
      `ID: \`${sticker.id}\``
    ].join('\n'),
    footer: `ID: ${sticker.id}`,
    color: 0xed4245,
    metadata: { stickerId: sticker.id, name: sticker.name }
  }).catch((error) => console.error('Failed to log sticker delete:', error));
});

client.on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
  if (!newSticker.guild) return;
  const changes = [];
  if (oldSticker.name !== newSticker.name) changes.push(`Name: \`${oldSticker.name}\` ➔ \`${newSticker.name}\``);
  if (oldSticker.description !== newSticker.description) changes.push(`Description: ${newSticker.description || '*None*'}`);
  if (!changes.length) return;

  await logger.log({
    guildId: newSticker.guild.id,
    eventKey: 'sticker-update',
    title: 'Sticker updated',
    body: [
      `Sticker: **${newSticker.name}** (\`${newSticker.id}\`)`,
      ...changes
    ].join('\n'),
    thumbnailUrl: newSticker.url || null,
    footer: `ID: ${newSticker.id}`,
    color: 0xfee75c,
    metadata: { stickerId: newSticker.id, changes }
  }).catch((error) => console.error('Failed to log sticker update:', error));
});

client.on(Events.AutoModerationActionExecution, async (execution) => {
  await logger.log({
    guildId: execution.guild.id,
    eventKey: 'automod-execution',
    title: 'AutoMod action triggered',
    body: [
      `User: <@${execution.userId}>`,
      `Rule: **${execution.ruleTriggerType || 'AutoMod Rule'}**`,
      `Action: **${execution.action?.type || 'Blocked'}**`,
      execution.channelId ? `Channel: <#${execution.channelId}>` : null,
      execution.content ? `Content: ${execution.content}` : null,
      execution.matchedKeyword ? `Matched Keyword: \`${execution.matchedKeyword}\`` : null
    ].filter(Boolean).join('\n'),
    footer: `ID: ${execution.userId}`,
    color: 0xed4245,
    metadata: { userId: execution.userId, ruleTriggerType: execution.ruleTriggerType, action: execution.action }
  }).catch((error) => console.error('Failed to log automod execution:', error));
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!member.guild) return;
  const autoModEnabled = await permissions.isModuleEnabled(member.guild.id, ModuleKeys.AUTOMOD).catch(() => false);
  if (autoModEnabled) {
    await autoMod.handleGuildMemberAdd(member, logger, client).catch((error) => {
      console.error('Failed to process AutoMod member join:', error);
    });
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user?.bot) return;
  const guildId = reaction.message?.guildId;
  if (!guildId) return;
  if (await permissions.isIgnored(guildId, user.id).catch(() => false)) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }
  const enabled = await permissions.isModuleEnabled(guildId, ModuleKeys.REACTION_ROLES).catch(() => false);
  if (!enabled) return;
  const reactionAccess = await buildReactionPermissionInteraction(reaction, user).then((permissionInteraction) => permissions.checkPublicInteraction(permissionInteraction, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES)).catch(() => ({ allowed: false }));
  if (!reactionAccess.allowed) {
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }
  await handleReactionRole({ reaction, user, action: 'add', logger }).catch((error) => console.error('Failed to handle reaction role add:', error));
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user?.bot) return;
  const guildId = reaction.message?.guildId;
  if (!guildId) return;
  if (await permissions.isIgnored(guildId, user.id).catch(() => false)) return;
  const enabled = await permissions.isModuleEnabled(guildId, ModuleKeys.REACTION_ROLES).catch(() => false);
  if (!enabled) return;
  const reactionAccess = await buildReactionPermissionInteraction(reaction, user).then((permissionInteraction) => permissions.checkPublicInteraction(permissionInteraction, ActionKeys.RolePanelsUse, ModuleKeys.REACTION_ROLES)).catch(() => ({ allowed: false }));
  if (!reactionAccess.allowed) return;
  await handleReactionRole({ reaction, user, action: 'remove', logger }).catch((error) => console.error('Failed to handle reaction role remove:', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId) {
    guildAnalyticsService.trackCommand(interaction.guildId);
  }

  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command && typeof command.autocomplete === 'function') {
      await command.autocomplete(interaction).catch((error) => console.error(`Autocomplete failed: ${interaction.commandName}`, error));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    if (interaction.guildId && await permissions.isIgnored(interaction.guildId, interaction.user.id)) {
      await replyPrivate(interaction, 'You are currently blocked from interacting with SlickBot.');
      return;
    }

    if (interaction.isMessageContextMenuCommand?.()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) {
        await replyPrivate(interaction, 'Unknown command.');
        return;
      }
      const actionKey = typeof command.getActionKey === 'function' ? command.getActionKey(interaction) : command.actionKey;
      const moduleKey = typeof command.getModuleKey === 'function' ? command.getModuleKey(interaction) : command.moduleKey;
      const permissionResult = await permissions.checkInteraction(interaction, actionKey, moduleKey);
      if (!permissionResult.allowed) {
        await replyPrivate(interaction, permissionResult.reason || 'You do not have permission to use this command.');
        return;
      }
      try {
        await command.execute(interaction, { client, permissions, logger, status, moderation });
      } catch (error) {
        console.error(`Context command failed: ${interaction.commandName}`, error);
        await replyPrivate(interaction, 'Something went wrong while running that command. Check the bot logs for details.').catch(() => {});
      }
      return;
    }

    await handleComponentInteraction(interaction, { client, permissions, logger, status, moderation }).catch(async (error) => {
      if (error?.code === 10062) {
        console.warn(`[interactionCreate] Interaction expired (DiscordAPIError 10062) for customId "${interaction.customId}":`, error.message);
        return;
      }
      console.error('Component interaction failed:', error);
      await replyPrivate(interaction, 'Something went wrong while processing this action. Check the bot logs for details.').catch(() => {});
    });
    return;
  }

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    await replyPrivate(interaction, 'Unknown command.');
    return;
  }

  const actionKey = typeof command.getActionKey === 'function' ? command.getActionKey(interaction) : command.actionKey;
  const moduleKey = typeof command.getModuleKey === 'function' ? command.getModuleKey(interaction) : command.moduleKey;

  if (typeof command.isPublic === 'function' && command.isPublic(interaction)) {
    const publicResult = await permissions.checkPublicInteraction(interaction, actionKey, moduleKey);
    if (!publicResult.allowed) {
      await replyPrivate(interaction, publicResult.reason || 'You cannot use this command.');
      return;
    }
  } else {
    const permissionResult = await permissions.checkInteraction(interaction, actionKey, moduleKey);
    if (!permissionResult.allowed) {
      await replyPrivate(interaction, permissionResult.reason || 'You do not have permission to use this command.');
      return;
    }
  }

  try {
    await command.execute(interaction, {
      client,
      permissions,
      logger,
      status,
      moderation
    });
  } catch (error) {
    console.error(`Command failed: ${interaction.commandName}`, error);

    if (interaction.guildId) {
      await logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: `command.${interaction.commandName}.failed`,
        severity: 'ERROR',
        summary: `Command failed: ${interaction.commandName}`,
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {});
    }

    await replyPrivate(interaction, 'Something went wrong while running that command. Check the bot logs for details.');
  }
});


function messageToPermissionInteraction(message) {
  return {
    guildId: message.guild?.id,
    guild: message.guild,
    channelId: message.channelId,
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions
  };
}

async function buildReactionPermissionInteraction(reaction, user) {
  const guild = reaction.message?.guild;
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
  return {
    guildId: guild?.id,
    guild,
    channelId: reaction.message?.channelId,
    user,
    member,
    memberPermissions: member?.permissions
  };
}

async function main() {
  await initDatabase();

  if (shouldAutoDeployCommands) {
    await deployCommands();
  }

  await client.login(env.DISCORD_TOKEN);
}

main().catch(async (error) => {
  console.error('SlickBot startup failed:', error);
  await closeDatabase().catch(() => {});
  process.exit(1);
});

async function shutdown() {
  console.log('Shutting down SlickBot gracefully...');
  taskScheduler.stop();
  if (healthServer && typeof healthServer.close === 'function') {
    await new Promise((resolve) => healthServer.close(() => resolve())).catch(() => {});
  }
  if (client) {
    await client.destroy().catch(() => {});
  }
  await closeDatabase().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown().catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown().catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});
