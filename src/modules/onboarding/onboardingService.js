const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { CustomIds } = require('../ui/customIds');
const { ModuleKeys } = require('../moduleRegistry');
const { createBaseEmbed, createSuccessEmbed, SlickBotColors } = require('../ui/uiService');
const { query } = require('../../services/db');

const activeSessions = new Map();

function generateSessionId(guildId, userId) {
  return `${guildId}_${userId}_${Date.now()}`;
}

async function autoCreateRole(guild, { name, color = '#7869ff', mentionable = false, permissions = [], reason = 'SlickBot auto-role setup' }) {
  if (!guild || typeof guild.roles?.create !== 'function') throw new Error('Guild roles manager not available.');
  const existing = guild.roles.cache ? guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase()) : null;
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
  const existing = guild.channels.cache ? guild.channels.cache.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type) : null;
  if (existing) return existing;

  const overwrites = [];
  const everyoneId = guild.roles?.everyone?.id || guild.id;
  const botMember = guild.members?.me || (guild.client?.user ? guild.members?.cache?.get(guild.client.user.id) : null);

  if (isPrivate && everyoneId) {
    overwrites.push({
      id: everyoneId,
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
      async getCurrent(guild) {
        const res = await query(`SELECT role_id, permission_level FROM role_permission_levels WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        if (!res.rows.length) return null;
        return res.rows.map((r) => `${r.permission_level}: <@&${r.role_id}>`).join(', ');
      },
      async applyDefault(guild) {
        const adminRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'admin' || r.name.toLowerCase() === 'administrator');
        const modRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'moderator' || r.name.toLowerCase() === 'mod');
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: adminRole?.id || null, modRoleId: modRole?.id || null });
        return { result: adminRole || modRole ? 'Matched server roles' : 'Default permissions saved' };
      },
      async applySelection(guild, roleId) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: roleId });
      },
      async autoCreate(guild) {
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'core' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels.cache.find((c) => c.name.toLowerCase().includes('log') && c.type === ChannelType.GuildText);
        if (existing) {
          const { LoggingService } = require('../logging/loggingService');
          const logging = new LoggingService();
          await logging.setModuleChannel(guild.id, 'core', existing.id);
          return { result: `Routed to <#${existing.id}>` };
        }
        return { result: 'Default audit settings saved' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setModuleChannel(guild.id, 'core', channelId);
      },
      async autoCreate(guild) {
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id, enabled FROM welcome_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        const welcomeChan = guild.channels.cache.find((c) => c.name.toLowerCase() === 'welcome' && c.type === ChannelType.GuildText);
        if (welcomeChan) {
          await upsertWelcomeConfig({ guildId: guild.id, channelId: welcomeChan.id, enabled: true });
          return { result: `Assigned existing <#${welcomeChan.id}>` };
        }
        await upsertWelcomeConfig({ guildId: guild.id, enabled: true });
        return { result: 'Default welcome configuration saved' };
      },
      async applySelection(guild, channelId) {
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId, enabled: true });
      },
      async autoCreate(guild) {
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
      async getCurrent(guild) {
        const res = await query(`SELECT category_id FROM ticket_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.category_id ? `Category <#${res.rows[0].category_id}>` : null;
      },
      async applyDefault(guild) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        const existingCat = guild.channels.cache.find((c) => c.name.toLowerCase() === 'tickets' && c.type === ChannelType.GuildCategory);
        if (existingCat) {
          await tickets.updateConfig(guild.id, { categoryId: existingCat.id });
          return { result: `Assigned existing category <#${existingCat.id}>` };
        }
        await tickets.updateConfig(guild.id, { deleteSeconds: 10, transcriptsEnabled: true });
        return { result: 'Default ticket settings saved' };
      },
      async applySelection(guild, categoryId) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId });
      },
      async autoCreate(guild) {
        const category = await autoCreateChannel(guild, { name: 'Tickets', type: ChannelType.GuildCategory, isPrivate: true });
        const panelChannel = await autoCreateChannel(guild, { name: 'support-tickets', isPrivate: false, topic: 'Open a support ticket with staff' });
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId: category.id });
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
      async getCurrent(guild) {
        const res = await query(`SELECT member_channel_id, enabled FROM server_stats_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.member_channel_id ? `<#${res.rows[0].member_channel_id}> (Enabled: ${res.rows[0].enabled})` : null;
      },
      async applyDefault(guild) {
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, { enabled: true });
        return { result: 'Server stats counters enabled' };
      },
      async applySelection(guild, categoryId) {
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, { enabled: true });
      },
      async autoCreate(guild) {
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
      id: 'log_core',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Core System & Bot Audit Logs',
      description: 'Select where SlickBot logs administrative changes, permissions, module configuration, and server status.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #bot-logs',
      autoCreateDescription: 'Creates private #bot-logs for staff.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'core' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'bot-logs' || c.name.toLowerCase() === 'logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'CORE_SYSTEM', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Core & System log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'CORE_SYSTEM', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'bot-logs', isPrivate: true, reason: 'SlickBot Core Audit Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'CORE_SYSTEM', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'log_moderation',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Moderation, Safety & Lockdown Logs',
      description: 'Select where SlickBot logs disciplinary actions, bans, warns, notes, lockdowns, and temporary roles.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #mod-logs',
      autoCreateDescription: 'Creates private #mod-logs for staff.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'moderation' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'mod-logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'MODERATION_SAFETY', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Moderation & Safety log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MODERATION_SAFETY', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'mod-logs', isPrivate: true, reason: 'SlickBot Moderation Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MODERATION_SAFETY', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'log_member_message',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Member & Message Activity Logs',
      description: 'Select where member joins, leaves, role updates, nickname changes, message edits, and deletions are logged.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #member-logs',
      autoCreateDescription: 'Creates private #member-logs channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'member' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'member-logs' || c.name.toLowerCase() === 'msg-logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'MEMBER_MESSAGE', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Member & Message log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MEMBER_MESSAGE', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'member-logs', isPrivate: true, reason: 'SlickBot Member Activity Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MEMBER_MESSAGE', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'log_voice',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Voice Activity & Join-to-Create Logs',
      description: 'Select where voice channel joins, leaves, moves, and temporary channel activity are logged.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #voice-logs',
      autoCreateDescription: 'Creates private #voice-logs channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'voice' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'voice-logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'VOICE_ACTIVITY', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Voice log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'VOICE_ACTIVITY', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'voice-logs', isPrivate: true, reason: 'SlickBot Voice Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'VOICE_ACTIVITY', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'log_support_tickets',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Support, Tickets & Review Logs',
      description: 'Select where ticket opens, claims, transcripts, user reports, applications, and appeals are logged.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #support-logs',
      autoCreateDescription: 'Creates private #support-logs channel for staff.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'tickets' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'support-logs' || c.name.toLowerCase() === 'ticket-logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'SUPPORT_TICKETS', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Support & Tickets log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'SUPPORT_TICKETS', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'support-logs', isPrivate: true, reason: 'SlickBot Support & Ticket Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'SUPPORT_TICKETS', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'log_community_feeds',
      moduleKey: ModuleKeys.LOGGING,
      title: 'Community, Feeds & Engagement Logs',
      description: 'Select where giveaways, leveling, birthdays, reactions, games, suggestions, FAQ, custom commands, and social feeds are logged.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #community-logs',
      autoCreateDescription: 'Creates private #community-logs channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'giveaways' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'community-logs');
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        if (existing) {
          await logging.setupLogGroup(guild.id, 'COMMUNITY_FEEDS', existing.id);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Community & Engagement log group initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'COMMUNITY_FEEDS', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'community-logs', isPrivate: true, reason: 'SlickBot Community & Feed Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'COMMUNITY_FEEDS', channel.id);
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM welcome_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { upsertWelcomeConfig } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, enabled: true });
        return { result: 'Welcome announcements enabled' };
      },
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
    },
    {
      id: 'welcome_autorole',
      moduleKey: ModuleKeys.WELCOME,
      title: 'Auto-Assigned Member Role',
      description: 'Select a role to assign automatically to new members when they join.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Member',
      autoCreateDescription: 'Creates standard @Member role assigned on join.',
      async getCurrent(guild) {
        const res = await query(`SELECT role_id FROM welcome_auto_roles WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows.length ? res.rows.map((r) => `<@&${r.role_id}>`).join(', ') : null;
      },
      async applyDefault(guild) {
        const memberRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'member');
        if (memberRole) {
          const { addAutoRole } = require('../community/welcomeService');
          await addAutoRole(guild.id, memberRole.id).catch(() => {});
          return { result: `Assigned existing <@&${memberRole.id}>` };
        }
        return { result: 'No auto-role assigned by default' };
      },
      async applySelection(guild, roleId) {
        const { addAutoRole } = require('../community/welcomeService');
        await addAutoRole(guild.id, roleId);
      },
      async autoCreate(guild) {
        const role = await autoCreateRole(guild, { name: 'Member', color: '#2ecc71' });
        const { addAutoRole } = require('../community/welcomeService');
        await addAutoRole(guild.id, role.id);
        return { created: `@${role.name}` };
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
      async getCurrent(guild) {
        const res = await query(`SELECT category_id FROM ticket_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.category_id ? `Category <#${res.rows[0].category_id}>` : null;
      },
      async applyDefault(guild) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { transcriptsEnabled: true, deleteSeconds: 10 });
        return { result: 'Default ticket configuration applied' };
      },
      async applySelection(guild, categoryId) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId });
      },
      async autoCreate(guild) {
        const category = await autoCreateChannel(guild, { name: 'Tickets', type: ChannelType.GuildCategory, isPrivate: true });
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId: category.id });
        return { created: `Category "${category.name}"` };
      }
    },
    {
      id: 'ticket_staff_role',
      moduleKey: ModuleKeys.TICKETS,
      title: 'Ticket Support Staff Role',
      description: 'Select the role that can view, claim, and respond to member tickets.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Support Staff',
      autoCreateDescription: 'Creates @Support Staff role for ticket management.',
      async getCurrent(guild) {
        const res = await query(`SELECT staff_role_id FROM ticket_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.staff_role_id ? `<@&${res.rows[0].staff_role_id}>` : null;
      },
      async applyDefault(guild) {
        const modRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'support' || r.name.toLowerCase() === 'moderator');
        if (modRole) {
          const { TicketService } = require('../support/supportService');
          const tickets = new TicketService();
          await tickets.updateConfig(guild.id, { staffRoleId: modRole.id });
          return { result: `Assigned <@&${modRole.id}>` };
        }
        return { result: 'Default staff access applied' };
      },
      async applySelection(guild, roleId) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { staffRoleId: roleId });
      },
      async autoCreate(guild) {
        const role = await autoCreateRole(guild, { name: 'Support Staff', color: '#3498db' });
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { staffRoleId: role.id });
        return { created: `@${role.name}` };
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
      async getCurrent(guild) {
        const res = await query(`SELECT default_channel_id FROM giveaway_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_channel_id ? `<#${res.rows[0].default_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { GiveawayService } = require('../community/giveawayService');
        const giveaways = new GiveawayService();
        await giveaways.updateConfig(guild.id, { panelColor: '#7869ff' });
        return { result: 'Default giveaway settings saved' };
      },
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM birthday_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.setup(guild.id, { enabled: true });
        return { result: 'Birthday announcements enabled' };
      },
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM suggestion_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { SuggestionService } = require('../community/suggestionService');
        const suggestions = new SuggestionService();
        await suggestions.setup(guild.id, { panelActive: true });
        return { result: 'Suggestions enabled' };
      },
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM bot_updates_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { BotUpdatesService } = require('../status/botUpdatesService');
        const botUpdates = new BotUpdatesService();
        await botUpdates.updateConfig(guild.id, { enabled: true });
        return { result: 'Bot updates enabled' };
      },
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
      async getCurrent(guild) {
        const res = await query(`SELECT default_channel_id FROM feed_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_channel_id ? `<#${res.rows[0].default_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.setup(guild.id, { enabled: true });
        return { result: 'Social feeds initialized' };
      },
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
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM join_create_hubs WHERE guild_id = $1 AND enabled = true LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault() {
        return { result: 'Join-to-Create voice system initialized' };
      },
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

  async advanceSession(session, guild, action = 'NEXT', payload = {}) {
    const currentStep = session.steps[session.stepIndex];

    if (action === 'SKIP') {
      session.completedSteps.push({ step: currentStep, result: 'Skipped' });
    } else if (action === 'KEEP_DEFAULT') {
      let applied = 'Applied default';
      if (currentStep && typeof currentStep.applyDefault === 'function') {
        const def = await currentStep.applyDefault(guild, session).catch((err) => ({ error: err.message }));
        applied = def?.result || 'Default applied';
      }
      session.completedSteps.push({ step: currentStep, result: applied });
    } else if (action === 'KEEP_CURRENT') {
      let currentVal = null;
      if (currentStep && typeof currentStep.getCurrent === 'function') {
        currentVal = await currentStep.getCurrent(guild).catch(() => null);
      }
      if (currentVal) {
        session.completedSteps.push({ step: currentStep, result: `Kept current: ${currentVal}` });
      } else {
        // Fallback to default if no current setup stored
        let applied = 'Applied default (no current setup stored)';
        if (currentStep && typeof currentStep.applyDefault === 'function') {
          const def = await currentStep.applyDefault(guild, session).catch((err) => ({ error: err.message }));
          applied = def?.result ? `${def.result} (no current setup stored)` : applied;
        }
        session.completedSteps.push({ step: currentStep, result: applied });
      }
    } else if (action === 'AUTO_CREATE') {
      session.completedSteps.push({ step: currentStep, result: payload.created || 'Auto-created' });
    } else if (action === 'SELECT') {
      session.completedSteps.push({ step: currentStep, result: payload.selected || 'Configured' });
    }

    session.stepIndex += 1;
    if (session.stepIndex >= session.steps.length) {
      activeSessions.delete(session.id);
      return { done: true, session };
    }
    return { done: false, session };
  }

  buildOnboardingPayload(session, currentVal = null) {
    if (!session || session.stepIndex >= session.steps.length) {
      const completedList = (session?.completedSteps || [])
        .map((item, idx) => `**Step ${idx + 1}: ${item.step?.title || 'Configuration'}**\n└ ${item.result || 'Completed'}`)
        .join('\n\n');

      return {
        embeds: [createSuccessEmbed(
          '🎉 Onboarding Complete!',
          `All setup steps have been completed! Your server is now fully configured and ready to go.\n\n${completedList || ''}`
        )],
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
      `**Current Setting:** ${currentVal ? `\`${currentVal}\`` : '*None (Not configured yet)*'}`,
      currentStep.autoCreateDescription ? `💡 *Tip: Click **${currentStep.autoCreateLabel || 'Auto-Create for Me'}** to let SlickBot provision and link everything automatically.*` : ''
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
        .setPlaceholder('Or choose an existing channel...')
        .setChannelTypes(currentStep.channelTypes || [ChannelType.GuildText]);
      components.push(new ActionRowBuilder().addComponents(channelSelect));
    } else if (currentStep.pickerType === 'ROLE') {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId(`${CustomIds.OnboardingRoleSelectPrefix}${session.id}`)
        .setPlaceholder('Or choose an existing role...');
      components.push(new ActionRowBuilder().addComponents(roleSelect));
    }

    // Row 2: Action buttons (Auto-create, Keep Current, Keep Default, Skip, Exit)
    const buttonRow = new ActionRowBuilder();

    if (currentStep.autoCreateLabel) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.OnboardingAutoCreatePrefix}${session.id}`)
          .setLabel(currentStep.autoCreateLabel)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✨')
      );
    }

    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingKeepCurrentPrefix}${session.id}`)
        .setLabel('Keep Current')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📌'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingKeepDefaultPrefix}${session.id}`)
        .setLabel('Keep Default')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingSkipPrefix}${session.id}`)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏭️'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingCancelPrefix}${session.id}`)
        .setLabel('Exit')
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
