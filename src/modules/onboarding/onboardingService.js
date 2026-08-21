const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { ModuleKeys } = require('../moduleRegistry');

// In-memory active onboarding sessions
// Map<sessionId, SessionObject>
const activeSessions = new Map();

function generateSessionId(guildId, userId) {
  return `${guildId}:${userId}:${Date.now()}`;
}

async function autoCreateRole(guild, { name, color = '#7869ff', mentionable = false, permissions = [], reason = 'SlickBot auto-role setup' }) {
  if (!guild || typeof guild.roles?.create !== 'function') throw new Error('Guild roles manager not available.');
  const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const hexColor = color.startsWith('#') ? Number.parseInt(color.slice(1), 16) : SlickBotColors.PRIMARY;
  return guild.roles.create({
    name,
    color: Number.isFinite(hexColor) ? hexColor : undefined,
    mentionable: Boolean(mentionable),
    permissions: permissions.length ? permissions : undefined,
    reason
  });
}

async function autoCreateChannel(guild, {
  name,
  type = ChannelType.GuildText,
  parentId = null,
  topic = null,
  isPrivate = false,
  staffRoles = [],
  reason = 'SlickBot auto-channel setup'
}) {
  if (!guild || typeof guild.channels?.create !== 'function') throw new Error('Guild channels manager not available.');
  const existing = guild.channels.cache.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type);
  if (existing) return existing;

  const overwrites = [];
  const clientUser = guild.client?.user;
  const botMember = clientUser ? guild.members.cache.get(clientUser.id) : null;

  if (isPrivate) {
    overwrites.push({
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    });
    if (botMember) {
      overwrites.push({
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      });
    }
    for (const role of staffRoles) {
      if (role?.id) {
        overwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        });
      }
    }
  }

  return guild.channels.create({
    name,
    type,
    parent: parentId || undefined,
    topic: topic || undefined,
    permissionOverwrites: overwrites.length ? overwrites : undefined,
    reason
  });
}

const ONBOARDING_STEPS = Object.freeze({
  SERVER_ONBOARDING: [
    {
      id: 'server_roles',
      moduleKey: ModuleKeys.PERMISSIONS,
      title: 'Administrator & Moderator Roles',
      description: 'Set your staff roles so SlickBot knows who has permission to configure modules, manage settings, and moderate members.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create Staff Roles',
      autoCreateDescription: 'Creates @Admin and @Moderator roles with standard management permissions.',
      async applySelection(guild, roleId, session) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: roleId });
      },
      async autoCreate(guild, session) {
        const adminRole = await autoCreateRole(guild, { name: 'Admin', color: '#e74c3c', permissions: [PermissionFlagsBits.Administrator] });
        const modRole = await autoCreateRole(guild, { name: 'Moderator', color: '#3498db', permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] });
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: adminRole.id, modRoleId: modRole.id });
        return { created: `@${adminRole.name}, @${modRole.name}` };
      }
    },
    {
      id: 'server_logging',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Audit & Moderation Logging',
      description: 'Choose where SlickBot records moderation events, role changes, member joins, and server audits.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #bot-logs',
      autoCreateDescription: 'Creates private #bot-logs and #mod-logs channels for staff.',
      async applySelection(guild, channelId, session) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setModuleChannel(guild.id, 'core', channelId);
      },
      async autoCreate(guild, session) {
        const botLogs = await autoCreateChannel(guild, { name: 'bot-logs', isPrivate: true, reason: 'SlickBot Audit Log Channel' });
        const modLogs = await autoCreateChannel(guild, { name: 'mod-logs', isPrivate: true, reason: 'SlickBot Moderation Log Channel' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setModuleChannel(guild.id, 'core', botLogs.id);
        await logging.setModuleChannel(guild.id, 'moderation', modLogs.id);
        return { created: `#${botLogs.name}, #${modLogs.name}` };
      }
    },
    {
      id: 'server_welcome',
      moduleKey: ModuleKeys.WELCOME,
      title: 'Welcome Channel & Member Role',
      description: 'Set a channel to greet new members when they join, and optionally give them a starting role.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #welcome & @Member',
      autoCreateDescription: 'Creates public #welcome channel and @Member role assigned on join.',
      async applySelection(guild, channelId, session) {
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId, enabled: true });
      },
      async autoCreate(guild, session) {
        const welcomeChannel = await autoCreateChannel(guild, { name: 'welcome', isPrivate: false, topic: 'Welcome new members to the server!' });
        const memberRole = await autoCreateRole(guild, { name: 'Member', color: '#2ecc71' });
        const { upsertWelcomeConfig, addAutoRole } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId: welcomeChannel.id, enabled: true });
        await addAutoRole(guild.id, memberRole.id).catch(() => {});
        return { created: `#${welcomeChannel.name}, @${memberRole.name}` };
      }
    },
    {
      id: 'server_support',
      moduleKey: ModuleKeys.TICKETS,
      title: 'Support Tickets System',
      description: 'Provide private support ticket channels where members can open tickets with staff.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildCategory],
      autoCreateLabel: 'Auto-Create "Tickets" Category',
      autoCreateDescription: 'Creates a private "Tickets" category and #support-tickets channel.',
      async applySelection(guild, categoryId, session) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.setup(guild.id, { categoryId });
      },
      async autoCreate(guild, session) {
        const category = await autoCreateChannel(guild, { name: 'Tickets', type: ChannelType.GuildCategory, isPrivate: true });
        const panelChannel = await autoCreateChannel(guild, { name: 'support-tickets', isPrivate: false, topic: 'Open a support ticket with staff' });
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.setup(guild.id, { categoryId: category.id });
        return { created: `Category "${category.name}", #${panelChannel.name}` };
      }
    },
    {
      id: 'server_community',
      moduleKey: ModuleKeys.SERVER_STATS,
      title: 'Live Server Stats Counters',
      description: 'Display real-time member count and voice activity counters at the top of your channel sidebar.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildCategory],
      autoCreateLabel: 'Auto-Create Server Stats Counters',
      autoCreateDescription: 'Creates a "📊 Server Stats" category with live member counter channels.',
      async applySelection(guild, categoryId, session) {
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, { enabled: true });
      },
      async autoCreate(guild, session) {
        const category = await autoCreateChannel(guild, { name: '📊 Server Stats', type: ChannelType.GuildCategory });
        const memberCount = guild.memberCount || 1;
        const memberChannel = await autoCreateChannel(guild, { name: `👥 Members: ${memberCount}`, type: ChannelType.GuildVoice, parentId: category.id });
        const voiceChannel = await autoCreateChannel(guild, { name: `🎙️ In Voice: 0`, type: ChannelType.GuildVoice, parentId: category.id });
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, {
          enabled: true,
          memberChannelId: memberChannel.id,
          voiceChannelId: voiceChannel.id
        });
        return { created: `Category "${category.name}" & live counter channels` };
      }
    }
  ],

  [ModuleKeys.LOGGING]: [
    {
      id: 'log_channel',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Default Audit Log Channel',
      description: 'Select the primary text channel where SlickBot posts audit events.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #bot-logs',
      autoCreateDescription: 'Creates a private #bot-logs channel for staff only.',
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setModuleChannel(guild.id, 'core', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'bot-logs', isPrivate: true, reason: 'SlickBot Audit Log Channel' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setModuleChannel(guild.id, 'core', channel.id);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.WELCOME]: [
    {
      id: 'welcome_channel',
      moduleKey: ModuleKeys.WELCOME,
      title: 'Welcome Announcement Channel',
      description: 'Select the channel where welcome greetings will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #welcome',
      autoCreateDescription: 'Creates a public #welcome channel for new arrivals.',
      async applySelection(guild, channelId) {
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'welcome', isPrivate: false, topic: 'Welcome new members!' });
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId: channel.id, enabled: true });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.TICKETS]: [
    {
      id: 'ticket_category',
      moduleKey: ModuleKeys.TICKETS,
      title: 'Ticket Category',
      description: 'Select the category channel where new tickets will be created.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildCategory],
      autoCreateLabel: 'Auto-Create "Tickets" Category',
      autoCreateDescription: 'Creates a private "Tickets" category.',
      async applySelection(guild, categoryId) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.setup(guild.id, { categoryId });
      },
      async autoCreate(guild) {
        const category = await autoCreateChannel(guild, { name: 'Tickets', type: ChannelType.GuildCategory, isPrivate: true });
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.setup(guild.id, { categoryId: category.id });
        return { created: `Category "${category.name}"` };
      }
    }
  ],

  [ModuleKeys.GIVEAWAYS]: [
    {
      id: 'giveaways_channel',
      moduleKey: ModuleKeys.GIVEAWAYS,
      title: 'Default Giveaway Channel',
      description: 'Select the text channel where giveaways will be hosted by default.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #giveaways',
      autoCreateDescription: 'Creates a public #giveaways channel.',
      async applySelection(guild, channelId) {
        const { GiveawayService } = require('../community/giveawayService');
        const giveaways = new GiveawayService();
        await giveaways.updateConfig(guild.id, { defaultChannelId: channelId });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'giveaways', isPrivate: false, topic: 'Community Giveaways' });
        const { GiveawayService } = require('../community/giveawayService');
        const giveaways = new GiveawayService();
        await giveaways.updateConfig(guild.id, { defaultChannelId: channel.id });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.BIRTHDAYS]: [
    {
      id: 'birthday_channel',
      moduleKey: ModuleKeys.BIRTHDAYS,
      title: 'Birthday Announcement Channel',
      description: 'Select the text channel where birthday wishes will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #birthdays',
      autoCreateDescription: 'Creates a public #birthdays channel.',
      async applySelection(guild, channelId) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.setup(guild.id, { channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'birthdays', isPrivate: false, topic: 'Community Birthdays' });
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.setup(guild.id, { channelId: channel.id, enabled: true });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.SUGGESTIONS]: [
    {
      id: 'suggestions_channel',
      moduleKey: ModuleKeys.SUGGESTIONS,
      title: 'Suggestions Voting Channel',
      description: 'Select the text channel where member suggestions will be posted for voting.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #suggestions',
      autoCreateDescription: 'Creates a public #suggestions channel.',
      async applySelection(guild, channelId) {
        const { SuggestionService } = require('../community/suggestionService');
        const suggestions = new SuggestionService();
        await suggestions.setup(guild.id, { channelId, panelActive: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'suggestions', isPrivate: false, topic: 'Server suggestions & voting' });
        const { SuggestionService } = require('../community/suggestionService');
        const suggestions = new SuggestionService();
        await suggestions.setup(guild.id, { channelId: channel.id, panelActive: true });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.BOT_UPDATES]: [
    {
      id: 'bot_updates_channel',
      moduleKey: ModuleKeys.BOT_UPDATES,
      title: 'Bot Update Announcements Channel',
      description: 'Select where SlickBot announces new releases, features, and patch notes.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #bot-news',
      autoCreateDescription: 'Creates a public #bot-news channel.',
      async applySelection(guild, channelId) {
        const { BotUpdatesService } = require('../status/botUpdatesService');
        const botUpdates = new BotUpdatesService();
        await botUpdates.setChannel(guild.id, channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'bot-news', isPrivate: false, topic: 'SlickBot updates and release notes' });
        const { BotUpdatesService } = require('../status/botUpdatesService');
        const botUpdates = new BotUpdatesService();
        await botUpdates.setChannel(guild.id, channel.id);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.SOCIAL_FEEDS]: [
    {
      id: 'feeds_channel',
      moduleKey: ModuleKeys.SOCIAL_FEEDS,
      title: 'Social Streams & Video Alerts Channel',
      description: 'Select the default channel for Twitch, YouTube, and TikTok notifications.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #stream-alerts',
      autoCreateDescription: 'Creates a public #stream-alerts channel.',
      async applySelection(guild, channelId) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.setup(guild.id, { defaultChannelId: channelId });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'stream-alerts', isPrivate: false, topic: 'Live stream & video notifications' });
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.setup(guild.id, { defaultChannelId: channel.id });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.JOIN_TO_CREATE]: [
    {
      id: 'jtc_hub',
      moduleKey: ModuleKeys.JOIN_TO_CREATE,
      title: 'Join-to-Create Voice Hub',
      description: 'Select or create the voice hub channel that spawns temporary private voice channels when joined.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildVoice],
      autoCreateLabel: 'Auto-Create "➕ Join to Create"',
      autoCreateDescription: 'Creates a voice hub channel ready for instant use.',
      async applySelection(guild, channelId) {
        const { JoinCreateService } = require('../voice/joinCreateService');
        const joinCreate = new JoinCreateService();
        await joinCreate.registerHub(guild.id, channelId, { enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: '➕ Join to Create', type: ChannelType.GuildVoice });
        const { JoinCreateService } = require('../voice/joinCreateService');
        const joinCreate = new JoinCreateService();
        await joinCreate.registerHub(guild.id, channel.id, { enabled: true });
        return { created: `Voice Hub "${channel.name}"` };
      }
    }
  ]
});

class OnboardingService {
  getSession(sessionId, userId = null) {
    const session = activeSessions.get(sessionId);
    if (!session) return null;
    if (userId && session.userId !== userId) return null;
    return session;
  }

  startServerOnboarding(guildId, userId) {
    const sessionId = generateSessionId(guildId, userId);
    const session = {
      id: sessionId,
      guildId,
      userId,
      type: 'SERVER_ONBOARDING',
      stepIndex: 0,
      steps: ONBOARDING_STEPS.SERVER_ONBOARDING,
      completedSteps: [],
      createdAt: Date.now()
    };
    activeSessions.set(sessionId, session);
    return session;
  }

  startModuleOnboarding(guildId, userId, moduleKey) {
    const steps = ONBOARDING_STEPS[moduleKey];
    if (!steps || !steps.length) return null;

    const sessionId = generateSessionId(guildId, userId);
    const session = {
      id: sessionId,
      guildId,
      userId,
      type: 'MODULE_ONBOARDING',
      moduleKey,
      stepIndex: 0,
      steps,
      completedSteps: [],
      createdAt: Date.now()
    };
    activeSessions.set(sessionId, session);
    return session;
  }

  async advanceSession(session, guild, action = 'NEXT') {
    if (action === 'SKIP') {
      session.completedSteps.push({ step: session.steps[session.stepIndex], result: 'Skipped' });
    }
    session.stepIndex += 1;
    if (session.stepIndex >= session.steps.length) {
      activeSessions.delete(session.id);
      return { done: true, session };
    }
    return { done: false, session };
  }

  buildOnboardingPayload(session) {
    if (!session || session.stepIndex >= session.steps.length) {
      return {
        embeds: [createSuccessEmbed('🎉 Onboarding Complete!', 'All setup steps have been completed! Your server is now fully configured and ready to go.')],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(CustomIds.SetupRefresh)
              .setLabel('Open Setup Center')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('⚙️')
          )
        ]
      };
    }

    const currentStep = session.steps[session.stepIndex];
    const totalSteps = session.steps.length;
    const progressPercent = Math.round(((session.stepIndex) / totalSteps) * 100);
    const progressBlocks = '█'.repeat(Math.floor(progressPercent / 10)) + '░'.repeat(10 - Math.floor(progressPercent / 10));

    const lines = [
      `Progress: \`[${progressBlocks}]\` **${progressPercent}%** (Step ${session.stepIndex + 1} of ${totalSteps})`,
      '',
      `**${currentStep.title}**`,
      currentStep.description,
      '',
      currentStep.autoCreateDescription ? `💡 *Tip: Click **${currentStep.autoCreateLabel}** to let SlickBot create and configure everything for you automatically.*` : ''
    ].filter(Boolean);

    const embed = createBaseEmbed({
      title: session.type === 'SERVER_ONBOARDING' ? '🚀 SlickBot Guided Server Onboarding' : `🚀 Guided Setup: ${currentStep.title}`,
      description: lines.join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: `SlickBot Setup • Step ${session.stepIndex + 1}/${totalSteps}`
    });

    const components = [];

    // Row 1: Pick existing resource (Channel or Role select menu)
    if (currentStep.pickerType === 'CHANNEL') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId(`${CustomIds.OnboardingChannelSelectPrefix}${session.id}`)
        .setPlaceholder('Or select an existing channel...')
        .setChannelTypes(currentStep.channelTypes || [ChannelType.GuildText]);
      components.push(new ActionRowBuilder().addComponents(channelSelect));
    } else if (currentStep.pickerType === 'ROLE') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId(`${CustomIds.OnboardingRoleSelectPrefix}${session.id}`)
        .setPlaceholder('Or select an existing role...');
      components.push(new ActionRowBuilder().addComponents(roleSelect));
    }

    // Row 2: Action buttons (Auto-create, Skip, Cancel)
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingAutoCreatePrefix}${session.id}`)
        .setLabel(currentStep.autoCreateLabel || '✨ Auto-Create for Me')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingSkipPrefix}${session.id}`)
        .setLabel('Skip / Keep Default')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏩'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingCancelPrefix}${session.id}`)
        .setLabel('Exit Onboarding')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('✖️')
    );
    components.push(buttonRow);

    return { embeds: [embed], components };
  }

  buildGuildJoinGreetingPayload(guild) {
    const embed = createBaseEmbed({
      title: '👋 Welcome to SlickBot!',
      description: [
        `Thanks for adding **SlickBot** to **${guild.name}**!`,
        '',
        'SlickBot is packed with modular systems including **Support Tickets, Audit Logging, Permissions, Welcome Auto-Roles, Giveaways, Birthdays, Leveling XP, Live Server Stats**, and much more.',
        '',
        '**Ready to get started?**',
        'Click **Start Quick Setup** below for a 60-second guided onboarding with one-click channel and role auto-creation, or open the **Setup Center** to browse module categories.'
      ].join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: 'SlickBot • Modular Server Management'
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.OnboardingStart)
        .setLabel('Start Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Open Setup Center')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row] };
  }
}

module.exports = {
  OnboardingService,
  autoCreateRole,
  autoCreateChannel,
  ONBOARDING_STEPS
};
