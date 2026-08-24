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

const STANDARD_CATEGORIES = Object.freeze({
  STATS: Object.freeze({ name: '📊 Server Stats', position: 0, keywords: ['server stats', 'stats', 'counter', 'metric'], isPrivate: false }),
  START_HERE: Object.freeze({ name: '📌 Start Here', position: 1, keywords: ['start here', 'start', 'welcome', 'info', 'information', 'rules', 'getting-started', 'read-first', 'guide'], isPrivate: false }),
  SUPPORT: Object.freeze({ name: '🎫 Help & Support', position: 2, keywords: ['help & support', 'help and support', 'support hub', 'support desk', 'helpdesk', 'help center', 'assistance'], isPrivate: false }),
  COMMUNITY: Object.freeze({ name: '🎉 Community Hub', position: 4, keywords: ['community hub', 'community', 'general', 'lounge', 'chat', 'social', 'hangout'], isPrivate: false }),
  GAMES: Object.freeze({ name: '🎮 Games & Activities', position: 5, keywords: ['games & activities', 'games and activities', 'game lounge', 'games', 'arcade', 'activities'], isPrivate: false }),
  VOICE: Object.freeze({ name: '🔊 Dynamic Voice', position: 6, keywords: ['dynamic voice', 'voice channels', 'voice', 'call', 'talk'], isPrivate: false }),
  STAFF: Object.freeze({ name: '🛡️ Staff Area', position: 7, keywords: ['staff area', 'staff', 'admin', 'mod', 'management', 'officers', 'moderation', 'team'], isPrivate: true }),
  LOGS: Object.freeze({ name: '📋 Server Logs', position: 8, keywords: ['server logs', 'logging', 'audit logs', 'log', 'logs', 'audit', 'records'], isPrivate: true })
});

async function autoCreateRole(guild, { name, color = null, mentionable = false, permissions = [], reason = 'SlickBot auto-role setup' }) {
  if (!guild || typeof guild.roles?.create !== 'function') throw new Error('Guild roles manager not available.');
  const existing = guild.roles.cache ? guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase()) : null;
  if (existing) return existing;

  let roleColor = undefined;
  if (color) {
    if (typeof color === 'string' && color.startsWith('#')) {
      roleColor = Number.parseInt(color.slice(1), 16);
    } else if (typeof color === 'number' && Number.isFinite(color) && color > 0) {
      roleColor = color;
    }
  }

  const rolePayload = {
    name,
    mentionable: Boolean(mentionable),
    permissions: permissions.length ? permissions : undefined,
    reason
  };
  if (roleColor !== undefined && Number.isFinite(roleColor)) {
    rolePayload.colors = { primaryColor: roleColor };
  }
  return guild.roles.create(rolePayload);
}

async function ensureCategory(guild, { name, keywords = [], isPrivate = false, staffRoles = [], position = undefined, reason = 'SlickBot auto-provisioned category' }) {
  if (!guild || typeof guild.channels?.create !== 'function') return null;
  const cacheList = Array.from(guild.channels.cache?.values?.() || guild.channels.cache || []);

  const cleanName = name.toLowerCase().trim();
  const strippedName = cleanName.replace(/^[^\w\s]+/, '').trim();

  let targetPosition = position;
  if (targetPosition === undefined) {
    const meta = Object.values(STANDARD_CATEGORIES).find((c) => c.name === name);
    if (meta && typeof meta.position === 'number') {
      targetPosition = meta.position;
    } else if (cleanName.includes('open tickets') || cleanName === 'tickets') {
      targetPosition = 3;
    }
  }

  // 1. Exact match by full category name or stripped emoji name
  let existing = cacheList.find((c) => {
    if (c?.type !== ChannelType.GuildCategory) return false;
    const catName = c.name.toLowerCase().trim();
    const strippedCatName = catName.replace(/^[^\w\s]+/, '').trim();
    return catName === cleanName || strippedCatName === strippedName;
  });

  // 2. Match by specific keywords (excluding active ticket channels from matching Help & Support)
  if (!existing && keywords.length > 0) {
    const searchKeywords = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
    existing = cacheList.find((c) => {
      if (c?.type !== ChannelType.GuildCategory) return false;
      const catName = c.name.toLowerCase().trim();
      const strippedCatName = catName.replace(/^[^\w\s]+/, '').trim();
      if (!isPrivate && (catName === 'tickets' || catName === 'open tickets' || catName.includes('open tickets'))) return false;
      return searchKeywords.some((word) => catName === word || strippedCatName === word || (word.length >= 4 && catName.includes(word)));
    });
  }

  if (existing) {
    if (targetPosition !== undefined && typeof existing.setPosition === 'function' && existing.position !== targetPosition) {
      await existing.setPosition(targetPosition).catch(() => {});
    }
    return existing;
  }

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
  } else if (!isPrivate && everyoneId) {
    overwrites.push({
      id: everyoneId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    position: targetPosition !== undefined ? targetPosition : undefined,
    permissionOverwrites: overwrites.length ? overwrites : undefined,
    reason
  });
}

async function autoCreateChannel(guild, {
  name,
  type = ChannelType.GuildText,
  categoryName = null,
  parentId = null,
  position = undefined,
  topic = null,
  isPrivate = false,
  staffRoles = [],
  allowedRoles = [],
  reason = 'SlickBot auto-channel setup'
}) {
  if (!guild || typeof guild.channels?.create !== 'function') throw new Error('Guild channels manager not available.');
  const cacheList = Array.from(guild.channels.cache?.values?.() || guild.channels.cache || []);
  const existing = cacheList.find((c) => c?.name?.toLowerCase() === name.toLowerCase() && (type === undefined || c.type === type));
  if (existing) return existing;

  let finalParentId = parentId;
  if (!finalParentId && categoryName) {
    const catMeta = Object.values(STANDARD_CATEGORIES).find((c) => c.name === categoryName) || { name: categoryName, isPrivate, keywords: [] };
    const category = await ensureCategory(guild, {
      name: catMeta.name,
      keywords: catMeta.keywords || [],
      isPrivate: catMeta.isPrivate ?? isPrivate,
      position: catMeta.position,
      staffRoles
    });
    if (category?.id) {
      finalParentId = category.id;
    }
  }

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
    for (const role of allowedRoles) {
      if (role?.id) {
        overwrites.push({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory
          ],
          deny: [
            PermissionFlagsBits.SendMessages
          ]
        });
      }
    }
  }

  return guild.channels.create({
    name,
    type,
    parent: finalParentId || undefined,
    topic: topic || undefined,
    permissionOverwrites: overwrites.length ? overwrites : undefined,
    reason
  });
}

const COLOR_PRESET_OPTIONS = Object.freeze([
  { name: 'Red', hex: '#e74c3c', emoji: '🔴' },
  { name: 'Orange', hex: '#e67e22', emoji: '🟠' },
  { name: 'Yellow', hex: '#f1c40f', emoji: '🟡' },
  { name: 'Green', hex: '#2ecc71', emoji: '🟢' },
  { name: 'Blue', hex: '#3498db', emoji: '🔵' },
  { name: 'Purple', hex: '#9b59b6', emoji: '🟣' },
  { name: 'Pink', hex: '#e91e63', emoji: '🌸' },
  { name: 'Cyan', hex: '#1abc9c', emoji: '🩵' }
]);

const ONBOARDING_STEPS = Object.freeze({
  SERVER_ONBOARDING: [
    {
      id: 'server_admin_role',
      moduleKey: ModuleKeys.PERMISSIONS,
      moduleName: 'Staff Roles & Permissions',
      categoryKey: 'CORE',
      categoryLabel: 'Core & Administration',
      moduleOverview: 'Manage administrative and moderator role hierarchies to define who can moderate members and configure bot settings.',
      title: 'Administrator Staff Role',
      description: 'Select your server\'s Administrator role (or auto-create @Admin) to grant full bot management and administrative permissions.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Admin Role',
      autoCreateDescription: 'Creates an @Admin role with Administrator permissions.',
      async getCurrent(guild) {
        const res = await query(`SELECT role_id FROM role_permission_levels WHERE guild_id = $1 AND permission_level = 'ADMINISTRATOR'`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.role_id ? `<@&${res.rows[0].role_id}>` : null;
      },
      async applyDefault(guild) {
        const adminRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'admin' || r.name.toLowerCase() === 'administrator');
        if (adminRole) {
          const { PermissionService } = require('../permissions/permissionService');
          const permissions = new PermissionService();
          await permissions.setupRoles(guild.id, { adminRoleId: adminRole.id });
          return { result: `Assigned existing <@&${adminRole.id}>` };
        }
        return { result: 'Default administrator role mapped' };
      },
      async applySelection(guild, roleId) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: roleId });
      },
      async autoCreate(guild) {
        const adminRole = await autoCreateRole(guild, { name: 'Admin', permissions: [PermissionFlagsBits.Administrator] });
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: adminRole.id });
        return { created: `@${adminRole.name}` };
      }
    },
    {
      id: 'server_mod_role',
      moduleKey: ModuleKeys.PERMISSIONS,
      moduleName: 'Staff Roles & Permissions',
      categoryKey: 'CORE',
      categoryLabel: 'Core & Administration',
      moduleOverview: 'Manage administrative and moderator role hierarchies to define who can moderate members and configure bot settings.',
      title: 'Moderator Staff Role',
      description: 'Select your server\'s Moderator role (or auto-create @Moderator) to grant moderation powers (warnings, timeouts, kicks, bans, and cases).',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Moderator Role',
      autoCreateDescription: 'Creates an @Moderator role with moderation permissions.',
      async getCurrent(guild) {
        const res = await query(`SELECT role_id FROM role_permission_levels WHERE guild_id = $1 AND permission_level = 'MODERATOR'`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.role_id ? `<@&${res.rows[0].role_id}>` : null;
      },
      async applyDefault(guild) {
        const modRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'moderator' || r.name.toLowerCase() === 'mod');
        if (modRole) {
          const { PermissionService } = require('../permissions/permissionService');
          const permissions = new PermissionService();
          await permissions.setupRoles(guild.id, { modRoleId: modRole.id });
          return { result: `Assigned existing <@&${modRole.id}>` };
        }
        return { result: 'Default moderator role mapped' };
      },
      async applySelection(guild, roleId) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { modRoleId: roleId });
      },
      async autoCreate(guild) {
        const modRole = await autoCreateRole(guild, { name: 'Moderator', permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] });
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { modRoleId: modRole.id });
        return { created: `@${modRole.name}` };
      }
    },
    {
      id: 'server_logging',
      moduleKey: ModuleKeys.LOGGING,
      moduleName: 'Audit & Moderation Logging',
      categoryKey: 'CORE',
      categoryLabel: 'Core & Administration',
      moduleOverview: 'Centralized audit log hubs recording moderation actions, member joins/leaves, role edits, message updates, and system events across all 6 log hubs.',
      title: 'Audit & Server Logging Channels',
      description: 'Select your server\'s primary log channel (or auto-create complete log hubs) where SlickBot will deliver audit records and moderation actions.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create All 6 Logging Hubs',
      autoCreateDescription: 'Creates category "📋 Server Logs" with all 6 dedicated channels (#bot-logs, #mod-logs, #member-logs, #voice-logs, #support-logs, #community-logs) and configures all 30 log modules.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = 'core' AND enabled = true`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels.cache.find((c) => c.name.toLowerCase().includes('log') && c.type === ChannelType.GuildText);
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService(guild.client);
        if (existing) {
          await logging.setupStarterChannels(guild.id, { defaultChannelId: existing.id });
          return { result: `Routed all log modules to <#${existing.id}>` };
        }
        return { result: 'Default audit settings saved' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService(guild.client);
        await logging.setupStarterChannels(guild.id, { defaultChannelId: channelId });
      },
      async autoCreate(guild) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService(guild.client);
        const { category, createdChannels } = await logging.autoCreateAllLogChannels(guild);
        const names = Object.values(createdChannels).map((c) => `#${c.name}`).join(', ');
        return { created: `Category "${category.name}" & 6 channels (${names})` };
      }
    },
    {
      id: 'server_automod',
      moduleKey: ModuleKeys.AUTOMOD,
      moduleName: 'Automated Moderation & Anti-Raid',
      categoryKey: 'CORE',
      categoryLabel: 'Core & Administration',
      moduleOverview: 'Real-time defense against spam, mass mentions, invite links, scam words, and raid surges with automatic timeouts and lockdowns.',
      title: 'Anti-Raid Alert Channel & Timeout Role',
      description: 'Select the staff channel where emergency raid alerts will be sent and configure the @Timeout quarantine role.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      autoCreateLabel: 'Auto-Create #staff-alerts & @Timeout',
      autoCreateDescription: 'Creates private #staff-alerts channel and provisions @Timeout role.',
      async getCurrent(guild) {
        const res = await query(`SELECT raid_alert_channel_id, timeout_role_id FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        const id = res.rows[0]?.raid_alert_channel_id;
        const roleId = res.rows[0]?.timeout_role_id;
        if (!id && !roleId) return null;
        return [id ? `<#${id}>` : null, roleId ? `<@&${roleId}>` : null].filter(Boolean).join(', ');
      },
      async applyDefault(guild) {
        const target = guild.channels?.cache?.find((c) => ['mod-log', 'mod-logs', 'staff', 'admin-logs', 'staff-alerts'].includes(c.name.toLowerCase()));
        if (target) {
          await query(
            `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
             VALUES ($1, $2, true, true)
             ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
            [guild.id, target.id]
          );
          return { result: `Assigned raid alerts to <#${target.id}>` };
        }
        return { result: 'Auto-Mod & Anti-Raid shield ready' };
      },
      async applySelection(guild, channelId) {
        await query(
          `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
           VALUES ($1, $2, true, true)
           ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
          [guild.id, channelId]
        );
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'staff-alerts', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, topic: 'Emergency server alerts and anti-raid notifications' });
        const { AutoModService } = require('../moderation/autoModService');
        const autoMod = new AutoModService();
        const roleRes = await autoMod.createTimeoutRole(guild).catch(() => null);
        await query(
          `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
           VALUES ($1, $2, true, true)
           ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
          [guild.id, channel.id]
        );
        return { created: `#${channel.name}${roleRes?.role ? `, @${roleRes.role.name}` : ''}` };
      }
    },
    {
      id: 'server_welcome',
      moduleKey: ModuleKeys.WELCOME,
      moduleName: 'Welcome Greetings & Auto-Roles',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Greet new members with personalized arrival embeds and assign starter roles automatically upon joining.',
      title: 'Welcome Channel & Member Role',
      description: 'Set a channel to greet new members when they join, and assign an automatic starting role.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #welcome & @Member',
      autoCreateDescription: 'Creates public #welcome channel in "📌 Start Here" and @Member role assigned on join.',
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
        const welcomeChannel = await autoCreateChannel(guild, { name: 'welcome', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Welcome new members to the server!' });
        const memberRole = await autoCreateRole(guild, { name: 'Member' });
        const { upsertWelcomeConfig, addAutoRole } = require('../community/welcomeService');
        await upsertWelcomeConfig({ guildId: guild.id, channelId: welcomeChannel.id, enabled: true });
        await addAutoRole(guild.id, memberRole.id).catch(() => {});
        return { created: `#${welcomeChannel.name}, @${memberRole.name}` };
      }
    },
    {
      id: 'server_reaction_roles',
      moduleKey: ModuleKeys.REACTION_ROLES,
      moduleName: 'Self-Assignable Role Panels',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Allow members to toggle notification, interest, and community roles through interactive button panels.',
      title: 'Notification & Community Roles (Buttons Preset)',
      description: 'Create self-assignable notification roles (Announcements, Events, Giveaways, Bot Updates) with interactive toggle buttons.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #get-roles & Notification Panel',
      autoCreateDescription: 'Creates public #get-roles channel in "📌 Start Here", 4 starter roles (@Announcements, @Events, @Giveaways, @Bot Updates), and publishes the button toggle panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND name = 'notification-roles' AND active = true`, [guild.id]).catch(() => ({ rows: [{ count: 0 }] }));
        return (res.rows[0]?.count || 0) > 0 ? 'Notification Roles panel active' : null;
      },
      async applyDefault(guild) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'notification-roles', title: '🔔 Notification Roles', description: 'Select your notification roles below.' }).catch(() => {});
        return { result: 'Starter notification role panel created' };
      },
      async applySelection(guild, channelId) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'notification-roles', title: '🔔 Notification Roles', description: 'Select your notification roles below.' }).catch(() => {});
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'get-roles', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Self-assignable member roles' });
        const announceRole = await autoCreateRole(guild, { name: 'Announcements' });
        const eventsRole = await autoCreateRole(guild, { name: 'Events' });
        const giveRole = await autoCreateRole(guild, { name: 'Giveaways' });
        const botUpdatesRole = await autoCreateRole(guild, { name: 'Bot Updates' });
        const { createPanel, addOption, buildRolePanelMessage } = require('../community/rolePanelService');
        const panel = await createPanel({
          guildId: guild.id,
          name: 'notification-roles',
          title: '🔔 Notification & Community Roles',
          description: 'Click the buttons below to toggle roles and customize what notifications you receive!',
          color: '#5865f2',
          mode: 'MULTI',
          displayMode: 'BUTTONS'
        });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: announceRole.id, label: 'Announcements', emoji: '📢', buttonColor: '#3498db' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: eventsRole.id, label: 'Events', emoji: '🎉', buttonColor: '#9b59b6' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: giveRole.id, label: 'Giveaways', emoji: '🎁', buttonColor: '#f1c40f' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: botUpdatesRole.id, label: 'Bot Updates', emoji: '🤖', buttonColor: '#5865f2' });
        const panelPayload = await buildRolePanelMessage(panel);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Notification Role Panel published), 4 roles` };
      }
    },
    {
      id: 'server_color_roles',
      moduleKey: ModuleKeys.REACTION_ROLES,
      moduleName: 'Name Color Roles (Dropdown Preset)',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Offer self-assignable chat username colors using a sleek dropdown select menu.',
      title: 'Chat Username Colors (Dropdown Preset)',
      description: 'Select a channel where members can choose their favorite chat username color from a dropdown menu (Single-choice).',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create 8 Color Roles & Dropdown Panel',
      autoCreateDescription: 'Creates 8 color roles (Red, Orange, Yellow, Green, Blue, Purple, Pink, Cyan) and publishes a Dropdown Menu panel in #get-roles.',
      async getCurrent(guild) {
        const res = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND name = 'color-roles' AND active = true`, [guild.id]).catch(() => ({ rows: [{ count: 0 }] }));
        return (res.rows[0]?.count || 0) > 0 ? 'Color Roles dropdown active' : null;
      },
      async applyDefault(guild) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'color-roles', title: '🎨 Name Colors', mode: 'SINGLE', displayMode: 'DROPDOWN' }).catch(() => {});
        return { result: 'Color roles preset initialized' };
      },
      async applySelection(guild, channelId) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'color-roles', title: '🎨 Name Colors', mode: 'SINGLE', displayMode: 'DROPDOWN' }).catch(() => {});
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'get-roles', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Self-assignable member roles' });
        const createdRoles = [];
        for (const c of COLOR_PRESET_OPTIONS) {
          const r = await autoCreateRole(guild, { name: c.name, color: c.hex });
          createdRoles.push({ ...c, roleId: r.id });
        }
        const { createPanel, addOption, buildRolePanelMessage } = require('../community/rolePanelService');
        const panel = await createPanel({
          guildId: guild.id,
          name: 'color-roles',
          title: '🎨 Pick Your Name Color',
          description: 'Choose a color from the dropdown menu below to customize your username color in chat!',
          color: '#5865f2',
          mode: 'SINGLE',
          displayMode: 'DROPDOWN'
        });
        for (const c of createdRoles) {
          await addOption({
            guildId: guild.id,
            panelName: 'color-roles',
            roleId: c.roleId,
            label: c.name,
            emoji: c.emoji,
            description: `Set your username color to ${c.name}`,
            buttonColor: c.hex
          });
        }
        const panelPayload = await buildRolePanelMessage(panel);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (8 Color Roles & Dropdown Panel published)` };
      }
    },
    {
      id: 'server_tickets',
      moduleKey: ModuleKeys.TICKETS,
      moduleName: 'Support Tickets System',
      categoryKey: 'SUPPORT',
      categoryLabel: 'Support & Helpdesk',
      moduleOverview: 'Private support channels where members can open tickets with staff, complete custom intake questions, and receive automated transcripts on close.',
      title: 'Support Tickets Category & Submission Hub',
      description: 'Select the category where private tickets will open and publish a public submit-tickets panel.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildCategory],
      autoCreateLabel: 'Auto-Create Tickets & Publish Panel',
      autoCreateDescription: 'Creates private "📁 Open Tickets" category, #submit-tickets in "🎫 Help & Support", @Support Staff role, and posts the live interactive Ticket Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT category_id FROM ticket_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.category_id ? `Category <#${res.rows[0].category_id}>` : null;
      },
      async applyDefault(guild) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        const existingCat = guild.channels.cache.find((c) => (c.name.toLowerCase() === 'open tickets' || c.name.toLowerCase() === 'tickets') && c.type === ChannelType.GuildCategory);
        if (existingCat) {
          await tickets.updateConfig(guild.id, { categoryId: existingCat.id });
          return { result: `Assigned existing category <#${existingCat.id}>` };
        }
        await tickets.updateConfig(guild.id, { closeDeleteSeconds: 10, transcriptEnabled: true });
        return { result: 'Default ticket settings saved' };
      },
      async applySelection(guild, categoryId) {
        const { TicketService } = require('../support/supportService');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId });
      },
      async autoCreate(guild) {
        const staffRole = await autoCreateRole(guild, { name: 'Support Staff' });
        const category = await ensureCategory(guild, { name: '📁 Open Tickets', keywords: ['open tickets', 'active tickets', 'ticket channels', 'tickets'], isPrivate: true, staffRoles: [staffRole], reason: 'SlickBot Open Tickets Category' });
        const panelChannel = await autoCreateChannel(guild, { name: 'submit-tickets', categoryName: STANDARD_CATEGORIES.SUPPORT.name, isPrivate: false, topic: 'Open a support ticket with staff' });
        const { TicketService } = require('../support/supportService');
        const { buildPublicTicketPanel } = require('../support/supportUi');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId: category.id, staffRoleId: staffRole.id });
        const types = await tickets.listTypes(guild.id);
        const cfg = await tickets.getConfig(guild.id);
        const panelPayload = await buildPublicTicketPanel(types, cfg);
        if (panelChannel && typeof panelChannel.send === 'function') {
          await panelChannel.send(panelPayload).catch(() => {});
        }
        return { created: `Category "${category.name}", #${panelChannel.name} (Ticket Panel published), @${staffRole.name}` };
      }
    },
    {
      id: 'server_reports',
      moduleKey: ModuleKeys.REPORTS,
      moduleName: 'User & Content Reports',
      categoryKey: 'SUPPORT',
      categoryLabel: 'Support & Helpdesk',
      moduleOverview: 'Discreet reporting system allowing members to privately report disruptive behavior or rule violations directly to staff review channels.',
      title: 'Report Review Hub & Public Submission Panel',
      description: 'Select the staff channel where user reports will be delivered for review.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create Reports & Publish Panel',
      autoCreateDescription: 'Creates private #mod-reports review channel in "🛡️ Staff Area", public #submit-reports in "🎫 Help & Support", and posts the live Report Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM report_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'report-reviews' || c.name.toLowerCase() === 'reports');
        if (existing) {
          await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, existing.id]);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Reports system initialized' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const reviewChannel = await autoCreateChannel(guild, { name: 'mod-reports', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Member Reports Review Channel' });
        const panelChannel = await autoCreateChannel(guild, { name: 'submit-reports', categoryName: STANDARD_CATEGORIES.SUPPORT.name, isPrivate: false, topic: 'Privately report a concern to server staff' });
        const { ReportService } = require('../support/supportService');
        const { buildPublicReportPanel } = require('../support/supportUi');
        const reports = new ReportService();
        await reports.updateConfig(guild.id, { reviewChannelId: reviewChannel.id });
        const cfg = await reports.getConfig(guild.id);
        const panelPayload = buildPublicReportPanel(cfg);
        if (panelChannel && typeof panelChannel.send === 'function') {
          await panelChannel.send(panelPayload).catch(() => {});
        }
        return { created: `#${reviewChannel.name} (Review Hub), #${panelChannel.name} (Report Panel published)` };
      }
    },
    {
      id: 'server_applications',
      moduleKey: ModuleKeys.APPLICATIONS,
      moduleName: 'Staff & Member Applications',
      categoryKey: 'SUPPORT',
      categoryLabel: 'Support & Helpdesk',
      moduleOverview: 'Interactive application forms with custom intake questions handled via private DMs and reviewed in staff channels.',
      title: 'Application Review Hub & Apply Panel',
      description: 'Select the staff channel where completed application submissions will be sent for review.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create Applications & Publish Panel',
      autoCreateDescription: 'Creates private #app-review in "🛡️ Staff Area", public #apply-here in "🎫 Help & Support", and posts the live Application Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM application_types WHERE guild_id = $1 AND enabled = true LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault() {
        return { result: 'Applications system ready' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO application_types (guild_id, name, review_channel_id, enabled) VALUES ($1, 'Staff Application', $2, true) ON CONFLICT DO NOTHING`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const reviewChannel = await autoCreateChannel(guild, { name: 'app-review', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Applications Review Channel' });
        const panelChannel = await autoCreateChannel(guild, { name: 'apply-here', categoryName: STANDARD_CATEGORIES.SUPPORT.name, isPrivate: false, topic: 'Apply for server staff or roles' });
        const { ApplicationService } = require('../support/supportService');
        const { buildPublicApplicationPanel } = require('../support/supportUi');
        const applications = new ApplicationService();
        await applications.ensureDefaultType(guild.id, reviewChannel.id);
        const types = await applications.listTypes(guild.id);
        const panelPayload = buildPublicApplicationPanel(types);
        if (panelChannel && typeof panelChannel.send === 'function') {
          await panelChannel.send(panelPayload).catch(() => {});
        }
        return { created: `#${reviewChannel.name} (Review Hub), #${panelChannel.name} (Application Panel published)` };
      }
    },
    {
      id: 'server_appeals',
      moduleKey: ModuleKeys.APPEALS,
      moduleName: 'Infraction & Ban Appeals',
      categoryKey: 'SUPPORT',
      categoryLabel: 'Support & Helpdesk',
      moduleOverview: 'Structured appeal system allowing timed-out or punished members to submit appeals for staff review with automated DM decision notices.',
      title: 'Appeal Review Hub & Public Appeal Panel',
      description: 'Select the private staff channel where member punishment appeals will be delivered.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create Appeals & Publish Panel',
      autoCreateDescription: 'Creates private #appeal-review in "🛡️ Staff Area", public #ban-appeals in "🎫 Help & Support", and posts the live Appeal Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'appeal-reviews' || c.name.toLowerCase() === 'appeals');
        if (existing) {
          await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, existing.id]);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Appeals system initialized' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const reviewChannel = await autoCreateChannel(guild, { name: 'appeal-review', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Appeals Review Channel' });
        const panelChannel = await autoCreateChannel(guild, { name: 'ban-appeals', categoryName: STANDARD_CATEGORIES.SUPPORT.name, isPrivate: false, topic: 'Submit an appeal for infractions or timeouts' });
        const { AppealService } = require('../support/supportService');
        const { buildPublicAppealPanel } = require('../support/supportUi');
        const appeals = new AppealService();
        await appeals.updateConfig(guild.id, { reviewChannelId: reviewChannel.id, dmDecisionEnabled: true });
        const cfg = await appeals.getConfig(guild.id);
        const panelPayload = buildPublicAppealPanel(cfg);
        if (panelChannel && typeof panelChannel.send === 'function') {
          await panelChannel.send(panelPayload).catch(() => {});
        }
        return { created: `#${reviewChannel.name} (Review Hub), #${panelChannel.name} (Appeal Panel published)` };
      }
    },
    {
      id: 'server_suggestions',
      moduleKey: ModuleKeys.SUGGESTIONS,
      moduleName: 'Server Suggestions & Community Voting',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Interactive suggestion hub where members submit ideas, receive community upvotes/downvotes, and staff can review or accept proposals.',
      title: 'Suggestions Channel & Submission Hub',
      description: 'Select the channel where member suggestions will be posted for voting and discussion.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #suggestions & Publish Panel',
      autoCreateDescription: 'Creates public #suggestions channel in "🎉 Community Hub" and posts the interactive Suggestion Panel.',
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
        const channel = await autoCreateChannel(guild, { name: 'suggestions', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Server suggestions & voting' });
        const { SuggestionService } = require('../community/suggestionService');
        const suggestions = new SuggestionService();
        await suggestions.setup(guild.id, { channelId: channel.id, panelActive: true });
        const cfg = await suggestions.getConfig(guild.id);
        const panelPayload = suggestions.buildPanelPayload(cfg);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Suggestion Panel published)` };
      }
    },
    {
      id: 'server_giveaways',
      moduleKey: ModuleKeys.GIVEAWAYS,
      moduleName: 'Community Giveaways',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Host automated prize giveaways with timer countdowns, customizable winner counts, role requirements, and automated rerolls.',
      title: 'Default Giveaway Channel',
      description: 'Select the text channel where giveaways will be hosted by default.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #giveaways & Guide',
      autoCreateDescription: 'Creates a public #giveaways channel in "🎮 Games & Activities" and publishes the Giveaway Guide.',
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
        const channel = await autoCreateChannel(guild, { name: 'giveaways', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Community Giveaways' });
        const { GiveawayService } = require('../community/giveawayService');
        const giveaways = new GiveawayService();
        await giveaways.updateConfig(guild.id, { defaultChannelId: channel.id });
        const guideEmbed = createBaseEmbed({
          title: '🎁 Community Giveaways',
          description: [
            'Welcome to the server giveaways channel!',
            '',
            'Active prize draws will appear here. Click the **🎉 Enter Giveaway** button on any giveaway post to participate.',
            '',
            'Staff can launch new giveaways anytime using `/giveaway start` or `/giveaway create`.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Giveaways'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [guideEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Giveaway Guide published)` };
      }
    },
    {
      id: 'server_birthdays',
      moduleKey: ModuleKeys.BIRTHDAYS,
      moduleName: 'Member Birthday Celebrations',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Track member birthdays and automatically post celebratory shoutouts with custom timezone handling.',
      title: 'Birthday Announcement Channel & Registration Panel',
      description: 'Select the text channel where birthday wishes will be posted and publish the member birthday registration panel.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #birthdays & Birthday Panel',
      autoCreateDescription: 'Creates public #birthdays channel in "🎉 Community Hub", @Birthday Star role, and posts the interactive Set Birthday button panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM birthday_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { enabled: true });
        return { result: 'Birthday announcements enabled' };
      },
      async applySelection(guild, channelId) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'birthdays', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Community Birthdays' });
        const birthdayRole = await autoCreateRole(guild, { name: 'Birthday Star' });
        const { BirthdayService, buildBirthdayPublicPanel } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { channelId: channel.id, birthdayRoleId: birthdayRole.id, enabled: true });
        const cfg = await birthdays.getConfig(guild.id);
        const panelPayload = buildBirthdayPublicPanel(cfg);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Birthday Registration Panel published), @${birthdayRole.name}` };
      }
    },
    {
      id: 'server_leveling',
      moduleKey: ModuleKeys.LEVELING,
      moduleName: 'Text & Voice Leveling XP',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Reward active chatters and voice participants with XP, customizable rank cards, level-up milestones, and role rewards.',
      title: 'Level Up Milestone Channel',
      description: 'Select the channel where member rank and level-up announcements will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #level-ups & Rewards Guide',
      autoCreateDescription: 'Creates public #level-ups channel in "🎉 Community Hub" and publishes the Leveling XP Guide.',
      async getCurrent(guild) {
        const res = await query(`SELECT level_up_channel_id, enabled FROM leveling_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.level_up_channel_id ? `<#${res.rows[0].level_up_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { enabled: true });
        return { result: 'Leveling XP active' };
      },
      async applySelection(guild, channelId) {
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { levelUpChannelId: channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'level-ups', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Member level up celebrations & XP announcements' });
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { levelUpChannelId: channel.id, enabled: true });
        const levelEmbed = createBaseEmbed({
          title: '🏆 Leveling & XP Rewards System',
          description: [
            'Earn XP automatically by chatting in text channels, participating in voice channels, and playing community games!',
            '',
            '**Useful Commands:**',
            '• `/level rank` — View your current level, rank, and XP progress',
            '• `/level leaderboard` — View the top ranked server members',
            '• `/level card` — Customize your rank card background and theme'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Leveling'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [levelEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Leveling Rewards Guide published)` };
      }
    },
    {
      id: 'server_starboard',
      moduleKey: ModuleKeys.STARBOARD,
      moduleName: 'Starboard / Community Hall of Fame',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Pin top-voted community messages automatically to a showcase channel when members react with stars.',
      title: 'Starboard Showcase Channel',
      description: 'Select the showcase channel where top-starred community messages will be pinned automatically.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      autoCreateLabel: 'Auto-Create #starboard & Guide',
      autoCreateDescription: 'Creates a public #starboard showcase channel in "🎉 Community Hub" and publishes the Hall of Fame guide.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM starboard_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const cacheList = Array.from(guild.channels?.cache?.values?.() || guild.channels?.cache || []);
        const existing = cacheList.find((c) => ['starboard', 'hall-of-fame', 'stars', 'highlights'].includes(c?.name?.toLowerCase()));
        if (existing) {
          await query(
            `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
             VALUES ($1, $2, true, 3, '⭐')
             ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
            [guild.id, existing.id]
          );
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Starboard enabled' };
      },
      async applySelection(guild, channelId) {
        await query(
          `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
           VALUES ($1, $2, true, 3, '⭐')
           ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
          [guild.id, channelId]
        );
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'starboard', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Community Hall of Fame — Starred messages' });
        await query(
          `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
           VALUES ($1, $2, true, 3, '⭐')
           ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
          [guild.id, channel.id]
        );
        const starEmbed = createBaseEmbed({
          title: '⭐ Community Starboard / Hall of Fame',
          description: [
            'Welcome to the server Hall of Fame!',
            '',
            'When great messages, funny quotes, or impressive achievements receive **3 or more ⭐ reactions**, they are automatically featured here.',
            '',
            'React to your favorite messages with ⭐ to vote them onto the board!'
          ].join('\n'),
          color: 0xf1c40f,
          footer: 'SlickBot Starboard • Threshold: 3 ⭐'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [starEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Hall of Fame Guide published)` };
      }
    },
    {
      id: 'server_join_to_create',
      moduleKey: ModuleKeys.JOIN_TO_CREATE,
      moduleName: 'Dynamic Join-to-Create Voice Hubs',
      categoryKey: 'VOICE',
      categoryLabel: 'Voice & Audio Systems',
      moduleOverview: 'Temporary private voice channels automatically created when members join a generator hub, with full owner control panels.',
      title: 'Dynamic Voice Hub Channel',
      description: 'Select or create the voice hub channel that spawns temporary private voice channels when joined.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildVoice],
      autoCreateLabel: 'Auto-Create Voice Hub',
      autoCreateDescription: 'Creates "🔊 Dynamic Voice" category and "➕ Create Voice" hub channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT source_channel_id as channel_id FROM join_create_hubs WHERE guild_id = $1 AND (enabled = true OR enabled IS NULL) LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
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
        const category = await ensureCategory(guild, { name: STANDARD_CATEGORIES.VOICE.name, keywords: STANDARD_CATEGORIES.VOICE.keywords, isPrivate: false });
        const channel = await autoCreateChannel(guild, { name: '➕ Create Voice', type: ChannelType.GuildVoice, parentId: category?.id });
        const { JoinCreateService } = require('../voice/joinCreateService');
        const joinCreate = new JoinCreateService();
        await joinCreate.registerHub(guild.id, channel.id, { enabled: true, categoryId: category?.id });
        return { created: `Category "${category?.name || 'Voice'}" & Voice Hub "${channel.name}"` };
      }
    },
    {
      id: 'server_community_games',
      moduleKey: ModuleKeys.COMMUNITY_GAMES,
      moduleName: 'Community Games & Activities',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Engage server members with interactive board games (Tic-Tac-Toe, Connect Four) and a cooperative counting challenge.',
      title: 'Community Games Lounge & Counting Channels',
      description: 'Select channels for community board games and the server counting challenge.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #game-lounge & Games Panel',
      autoCreateDescription: 'Creates #game-lounge and #counting in "🎮 Games & Activities", enables games, and publishes the Game Lounge challenge panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM counting_game_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { CommunityGameService, GAME_KEYS } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.setGameEnabled(guild.id, GAME_KEYS.TIC_TAC_TOE, true);
        await games.setGameEnabled(guild.id, GAME_KEYS.CONNECT_FOUR, true);
        return { result: 'Tic-Tac-Toe & Connect Four enabled' };
      },
      async applySelection(guild, channelId) {
        const { CommunityGameService, GAME_KEYS } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.updateCountingConfig(guild.id, { channelId });
        await games.setGameEnabled(guild.id, GAME_KEYS.COUNTING, true);
        await games.setGameEnabled(guild.id, GAME_KEYS.TIC_TAC_TOE, true);
        await games.setGameEnabled(guild.id, GAME_KEYS.CONNECT_FOUR, true);
      },
      async autoCreate(guild) {
        const loungeChannel = await autoCreateChannel(guild, { name: 'game-lounge', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Challenge friends to Tic-Tac-Toe and Connect Four!' });
        const countChannel = await autoCreateChannel(guild, { name: 'counting', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Community counting challenge — Count up one number at a time!' });
        const { CommunityGameService, GAME_KEYS } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.setGameEnabled(guild.id, GAME_KEYS.TIC_TAC_TOE, true);
        await games.setGameEnabled(guild.id, GAME_KEYS.CONNECT_FOUR, true);
        await games.updateBoardGameConfig(guild.id, GAME_KEYS.TIC_TAC_TOE, { enabled: true, channelId: loungeChannel.id, winXp: 50 });
        await games.updateBoardGameConfig(guild.id, GAME_KEYS.CONNECT_FOUR, { enabled: true, channelId: loungeChannel.id, winXp: 50 });
        await games.updateCountingConfig(guild.id, { channelId: countChannel.id, startingNumber: 1, resetOnIncorrect: true });
        await games.setGameEnabled(guild.id, GAME_KEYS.COUNTING, true);
        if (loungeChannel && typeof loungeChannel.send === 'function') {
          await games.createGamePanel({
            guildId: guild.id,
            channel: loungeChannel,
            title: '🎮 SlickBot Game Lounge',
            description: 'Challenge your friends to **Tic-Tac-Toe** or **Connect Four** and earn XP! Select a game below to begin.'
          }).catch(() => {});
        }
        return { created: `#${loungeChannel.name} (Games Panel published), #${countChannel.name}` };
      }
    },
    {
      id: 'server_faq',
      moduleKey: ModuleKeys.FAQ,
      moduleName: 'FAQ & Knowledge Base',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Organized server knowledge base and frequently asked questions searchable by keywords or browseable via interactive menus.',
      title: 'FAQ & Knowledge Hub Channel',
      description: 'Select the channel for your server knowledge base and FAQ guides.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #faq-help & Publish Panel',
      autoCreateDescription: 'Creates public #faq-help in "📌 Start Here" and publishes the interactive FAQ Search Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT forum_channel_id FROM faq_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.forum_channel_id ? `<#${res.rows[0].forum_channel_id}>` : null;
      },
      async applyDefault() {
        return { result: 'FAQ system ready' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO faq_configs (guild_id, forum_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET forum_channel_id = EXCLUDED.forum_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'faq-help', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Frequently asked questions & knowledge base' });
        await query(`INSERT INTO faq_configs (guild_id, forum_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET forum_channel_id = EXCLUDED.forum_channel_id, updated_at = NOW()`, [guild.id, channel.id]);
        const { createBaseEmbed, createButtonRow, createPanelButton, ButtonStyle, SlickBotColors } = require('../ui/uiService');
        const { CustomIds } = require('../ui/customIds');
        const faqEmbed = createBaseEmbed({
          title: '📖 Server FAQ & Knowledge Base',
          description: 'Welcome to the FAQ hub! Click **Search FAQ** below to search for answers, view common guidelines, or open support if you need further help.',
          color: SlickBotColors.INFO,
          footer: 'SlickBot Knowledge Base'
        });
        const row = createButtonRow([
          createPanelButton(CustomIds.FaqSearchModal, 'Search FAQ', ButtonStyle.Primary, '🔍'),
          createPanelButton(CustomIds.TicketsRefresh, 'Open Support', ButtonStyle.Secondary, '🎟️')
        ]);
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [faqEmbed], components: [row] }).catch(() => {});
        }
        return { created: `#${channel.name} (FAQ Guide Panel published)` };
      }
    },
    {
      id: 'server_achievements',
      moduleKey: ModuleKeys.ACHIEVEMENTS,
      moduleName: 'Community Achievements & Milestones',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Unlockable achievements for chat activity, voice time, ticket resolutions, and server participation.',
      title: 'Achievement Unlocks Channel',
      description: 'Select the channel where member achievement tier milestones will be celebrated.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #achievements & Showcase',
      autoCreateDescription: 'Creates public #achievements channel in "🎉 Community Hub", initializes starter milestone tiers, and publishes the Achievements Showcase.',
      async getCurrent(guild) {
        const res = await query(`SELECT announcement_channel_id FROM achievement_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.announcement_channel_id ? `<#${res.rows[0].announcement_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { enabled: true, dmEnabled: true });
        return { result: 'Achievement tiers and tracking enabled' };
      },
      async applySelection(guild, channelId) {
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { announcementChannelId: channelId, enabled: true, dmEnabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'achievements', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Member activity achievement milestones' });
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { announcementChannelId: channel.id, enabled: true, dmEnabled: true });
        const achieveEmbed = createBaseEmbed({
          title: '🏅 Community Achievements & Milestones',
          description: [
            'Unlock achievements and showcase badges as you participate in the server!',
            '',
            'Milestones are tracked for message counts, voice time, ticket resolutions, and community game victories.',
            '',
            '**Check Your Progress:** Use `/achievement list` to see available milestones and unlock status.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Achievements'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [achieveEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Achievements Showcase published)` };
      }
    },
    {
      id: 'server_stats',
      moduleKey: ModuleKeys.SERVER_STATS,
      moduleName: 'Live Server Stats Counters',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Real-time server counters displayed as locked voice channels at the top of your sidebar (Members, Bots, Voice Activity).',
      title: 'Server Stats Category & Live Counters',
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
      async applySelection(guild) {
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, { enabled: true });
      },
      async autoCreate(guild) {
        const category = await ensureCategory(guild, { name: STANDARD_CATEGORIES.STATS.name, keywords: STANDARD_CATEGORIES.STATS.keywords, isPrivate: false });
        const memberCount = guild.memberCount || 1;
        const memberChannel = await autoCreateChannel(guild, { name: `👥 Members: ${memberCount}`, type: ChannelType.GuildVoice, parentId: category?.id });
        const voiceChannel = await autoCreateChannel(guild, { name: `🎙️ In Voice: 0`, type: ChannelType.GuildVoice, parentId: category?.id });
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, {
          enabled: true,
          memberChannelId: memberChannel.id,
          voiceChannelId: voiceChannel.id
        });
        return { created: `Category "${category?.name || 'Server Stats'}" & live counter channels` };
      }
    },
    {
      id: 'server_referrals',
      moduleKey: ModuleKeys.REFERRALS,
      moduleName: 'Member Referral Rewards',
      categoryKey: 'COMMUNITY',
      categoryLabel: 'Community & Engagement',
      moduleOverview: 'Reward members with bonus XP when their friends join using their personal invite links.',
      title: 'Member Referral Program Channel',
      description: 'Select the channel where the referral program guide will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #referrals & Referral Guide',
      autoCreateDescription: 'Creates public #referrals in "🎉 Community Hub" and enables 500 XP bonus per invite.',
      async getCurrent(guild) {
        const res = await query(`SELECT referral_xp, enabled FROM referral_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.enabled !== false ? `${res.rows[0]?.referral_xp || 500} XP Bonus (Enabled)` : null;
      },
      async applyDefault(guild) {
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
        return { result: 'Referrals tracking enabled (500 bonus XP)' };
      },
      async applySelection(guild) {
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'referrals', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Invite friends and earn referral bonus XP' });
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
        const refEmbed = createBaseEmbed({
          title: '🤝 Member Referral Program',
          description: [
            'Invite your friends to the server and earn **500 Bonus XP** for every verified member who joins through your link!',
            '',
            '**How It Works:**',
            '1. Run `/referral link` to generate your unique server invite link.',
            '2. Share your link with friends.',
            '3. When they join, your referral count increases and bonus XP is awarded automatically!',
            '',
            'Use `/referral stats` to track your total invites and bonus XP earned.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Referrals • 500 XP per invite'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [refEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Referral Guide published)` };
      }
    },
    {
      id: 'server_bot_updates',
      moduleKey: ModuleKeys.BOT_UPDATES,
      moduleName: 'Bot News & Patch Notes',
      categoryKey: 'AUTOMATION',
      categoryLabel: 'Automation & Feeds',
      moduleOverview: 'Stay informed with automated announcements when SlickBot releases new features, updates, and performance patches.',
      title: 'Bot Updates Announcement Channel',
      description: 'Select where SlickBot announces new releases, features, and patch notes.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #bot-news & Opt-In Role',
      autoCreateDescription: 'Creates #bot-news in "📌 Start Here" (opt-in only), @Bot Updates role, and publishes the Release Hub announcement.',
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
        const botUpdatesRole = await autoCreateRole(guild, { name: 'Bot Updates' });
        const channel = await autoCreateChannel(guild, {
          name: 'bot-news',
          categoryName: STANDARD_CATEGORIES.START_HERE.name,
          isPrivate: true,
          allowedRoles: [botUpdatesRole],
          topic: 'SlickBot updates and release notes (Opt-in via #get-roles)'
        });
        const { BotUpdatesService } = require('../status/botUpdatesService');
        const botUpdates = new BotUpdatesService();
        await botUpdates.setChannel(guild.id, channel.id);
        const releaseEmbed = createBaseEmbed({
          title: '🚀 SlickBot Updates & Release Hub',
          description: [
            'This channel receives official release announcements, new module highlights, and patch notes for **SlickBot**.',
            '',
            'Members can toggle this channel on or off in **#get-roles** using the **🤖 Bot Updates** button.',
            '',
            'Stay tuned here for new feature rollouts and system improvements!'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot System Updates'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [releaseEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Gated to @${botUpdatesRole.name} • Release Hub published)` };
      }
    },
    {
      id: 'server_social_feeds',
      moduleKey: ModuleKeys.SOCIAL_FEEDS,
      moduleName: 'Social Streams & Video Feeds',
      categoryKey: 'AUTOMATION',
      categoryLabel: 'Automation & Feeds',
      moduleOverview: 'Automatic notifications when creators go live on Twitch, publish YouTube videos, or post TikToks.',
      title: 'Social Streams & Live Directory Hub Channel',
      description: 'Select the channel for Twitch, YouTube, and TikTok notifications and pin the Live Stream Directory.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #stream-alerts & Pin Live Hub',
      autoCreateDescription: 'Creates public #stream-alerts in "🎉 Community Hub", configures feeds, and pins the live Creator Hub Directory.',
      async getCurrent(guild) {
        const res = await query(`SELECT default_channel_id FROM social_feed_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_channel_id ? `<#${res.rows[0].default_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { enabled: true });
        return { result: 'Social feeds initialized' };
      },
      async applySelection(guild, channelId) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { defaultChannelId: channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'stream-alerts', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Live stream & video notifications' });
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { defaultChannelId: channel.id, liveDirectoryChannelId: channel.id, enabled: true });
        const dirPayload = await feeds.buildLiveDirectoryPayload(guild.id, guild.client);
        if (channel && typeof channel.send === 'function') {
          const sentMsg = await channel.send(dirPayload).catch(() => null);
          if (sentMsg?.id) {
            await sentMsg.pin().catch(() => {});
            await query(`UPDATE social_feed_configs SET live_directory_message_id = $2 WHERE guild_id = $1`, [guild.id, sentMsg.id]).catch(() => {});
          }
        }
        return { created: `#${channel.name} (Live Creator Hub pinned)` };
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
      autoCreateDescription: 'Creates private #bot-logs in "📋 Server Logs" for staff.',
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
        const channel = await autoCreateChannel(guild, { name: 'bot-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Core Audit Logs' });
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
      autoCreateDescription: 'Creates private #mod-logs in "📋 Server Logs" for staff.',
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
        const channel = await autoCreateChannel(guild, { name: 'mod-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Moderation Logs' });
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
      autoCreateDescription: 'Creates private #member-logs in "📋 Server Logs" channel.',
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
        const channel = await autoCreateChannel(guild, { name: 'member-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Member Activity Logs' });
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
      autoCreateDescription: 'Creates private #voice-logs in "📋 Server Logs" channel.',
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
        const channel = await autoCreateChannel(guild, { name: 'voice-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Voice Logs' });
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
      autoCreateDescription: 'Creates private #support-logs in "📋 Server Logs" channel for staff.',
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
        const channel = await autoCreateChannel(guild, { name: 'support-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Support & Ticket Logs' });
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
      autoCreateDescription: 'Creates private #community-logs in "📋 Server Logs" channel.',
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
        const channel = await autoCreateChannel(guild, { name: 'community-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Community & Feed Logs' });
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
      autoCreateDescription: 'Creates a public #welcome in "📌 Start Here" channel for new arrivals.',
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
        const channel = await autoCreateChannel(guild, { name: 'welcome', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Welcome new members!' });
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
        const role = await autoCreateRole(guild, { name: 'Member' });
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
      title: 'Ticket Category & Submission Hub',
      description: 'Select the category channel where new tickets will be created and publish the public ticket panel.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildCategory],
      autoCreateLabel: 'Auto-Create Tickets & Publish Panel',
      autoCreateDescription: 'Creates private "📁 Open Tickets" category, #submit-tickets in "🎫 Help & Support", and posts the live Ticket Panel.',
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
        const staffRole = await autoCreateRole(guild, { name: 'Support Staff' });
        const category = await ensureCategory(guild, { name: '📁 Open Tickets', keywords: ['open tickets', 'active tickets', 'ticket channels', 'tickets'], isPrivate: true, staffRoles: [staffRole], reason: 'SlickBot Open Tickets Category' });
        const panelChannel = await autoCreateChannel(guild, { name: 'submit-tickets', categoryName: STANDARD_CATEGORIES.SUPPORT.name, isPrivate: false, topic: 'Open a support ticket with staff' });
        const { TicketService } = require('../support/supportService');
        const { buildPublicTicketPanel } = require('../support/supportUi');
        const tickets = new TicketService();
        await tickets.updateConfig(guild.id, { categoryId: category.id, staffRoleId: staffRole.id });
        const types = await tickets.listTypes(guild.id);
        const cfg = await tickets.getConfig(guild.id);
        const panelPayload = await buildPublicTicketPanel(types, cfg);
        if (panelChannel && typeof panelChannel.send === 'function') {
          await panelChannel.send(panelPayload).catch(() => {});
        }
        return { created: `Category "${category.name}", #${panelChannel.name} (Ticket Panel published), @${staffRole.name}` };
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
        const role = await autoCreateRole(guild, { name: 'Support Staff' });
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
      autoCreateLabel: 'Auto-Create #giveaways & Guide',
      autoCreateDescription: 'Creates a public #giveaways in "🎮 Games & Activities" and publishes the Giveaway Guide.',
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
        const channel = await autoCreateChannel(guild, { name: 'giveaways', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Community Giveaways' });
        const { GiveawayService } = require('../community/giveawayService');
        const giveaways = new GiveawayService();
        await giveaways.updateConfig(guild.id, { defaultChannelId: channel.id });
        const guideEmbed = createBaseEmbed({
          title: '🎁 Community Giveaways',
          description: [
            'Welcome to the server giveaways channel!',
            '',
            'Active prize draws will appear here. Click the **🎉 Enter Giveaway** button on any giveaway post to participate.',
            '',
            'Staff can launch new giveaways anytime using `/giveaway start` or `/giveaway create`.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Giveaways'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [guideEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Giveaway Guide published)` };
      }
    }
  ],

  [ModuleKeys.BIRTHDAYS]: [
    {
      id: 'birthday_channel',
      moduleKey: ModuleKeys.BIRTHDAYS,
      title: 'Birthday Announcement Channel & Registration Panel',
      description: 'Select the text channel where birthday wishes will be posted and publish the birthday registration panel.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #birthdays & Birthday Panel',
      autoCreateDescription: 'Creates a public #birthdays in "🎉 Community Hub", @Birthday Star role, and posts the interactive Set Birthday button panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM birthday_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { enabled: true });
        return { result: 'Birthday announcements enabled' };
      },
      async applySelection(guild, channelId) {
        const { BirthdayService } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'birthdays', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Community Birthdays' });
        const birthdayRole = await autoCreateRole(guild, { name: 'Birthday Star' });
        const { BirthdayService, buildBirthdayPublicPanel } = require('../community/birthdayService');
        const birthdays = new BirthdayService();
        await birthdays.updateConfig(guild.id, { channelId: channel.id, birthdayRoleId: birthdayRole.id, enabled: true });
        const cfg = await birthdays.getConfig(guild.id);
        const panelPayload = buildBirthdayPublicPanel(cfg);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Birthday Registration Panel published), @${birthdayRole.name}` };
      }
    }
  ],

  [ModuleKeys.SUGGESTIONS]: [
    {
      id: 'suggestions_channel',
      moduleKey: ModuleKeys.SUGGESTIONS,
      title: 'Suggestions Channel & Submission Hub',
      description: 'Select the text channel where member suggestions will be posted for voting.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #suggestions & Publish Panel',
      autoCreateDescription: 'Creates a public #suggestions in "🎉 Community Hub" and posts the interactive Suggestion Panel.',
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
        const channel = await autoCreateChannel(guild, { name: 'suggestions', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Server suggestions & voting' });
        const { SuggestionService } = require('../community/suggestionService');
        const suggestions = new SuggestionService();
        await suggestions.setup(guild.id, { channelId: channel.id, panelActive: true });
        const cfg = await suggestions.getConfig(guild.id);
        const panelPayload = suggestions.buildPanelPayload(cfg);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Suggestion Panel published)` };
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
      autoCreateLabel: 'Auto-Create #bot-news & Opt-In Role',
      autoCreateDescription: 'Creates #bot-news in "📌 Start Here" (opt-in only), @Bot Updates role, and publishes the Release Hub announcement.',
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
        const botUpdatesRole = await autoCreateRole(guild, { name: 'Bot Updates' });
        const channel = await autoCreateChannel(guild, {
          name: 'bot-news',
          categoryName: STANDARD_CATEGORIES.START_HERE.name,
          isPrivate: true,
          allowedRoles: [botUpdatesRole],
          topic: 'SlickBot updates and release notes (Opt-in via #get-roles)'
        });
        const { BotUpdatesService } = require('../status/botUpdatesService');
        const botUpdates = new BotUpdatesService();
        await botUpdates.setChannel(guild.id, channel.id);
        const releaseEmbed = createBaseEmbed({
          title: '🚀 SlickBot Updates & Release Hub',
          description: [
            'This channel receives official release announcements, new module highlights, and patch notes for **SlickBot**.',
            '',
            'Members can toggle this channel on or off in **#get-roles** using the **🤖 Bot Updates** button.',
            '',
            'Stay tuned here for new feature rollouts and system improvements!'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot System Updates'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [releaseEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Gated to @${botUpdatesRole.name} • Release Hub published)` };
      }
    }
  ],

  [ModuleKeys.SOCIAL_FEEDS]: [
    {
      id: 'feeds_channel',
      moduleKey: ModuleKeys.SOCIAL_FEEDS,
      title: 'Social Streams & Live Directory Hub Channel',
      description: 'Select the channel for Twitch, YouTube, and TikTok notifications and pin the Live Stream Directory.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #stream-alerts & Pin Live Hub',
      autoCreateDescription: 'Creates public #stream-alerts in "🎉 Community Hub", configures feeds, and pins the live Creator Hub Directory.',
      async getCurrent(guild) {
        const res = await query(`SELECT default_channel_id FROM social_feed_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_channel_id ? `<#${res.rows[0].default_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { enabled: true });
        return { result: 'Social feeds initialized' };
      },
      async applySelection(guild, channelId) {
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { defaultChannelId: channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'stream-alerts', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Live stream & video notifications' });
        const { SocialFeedService } = require('../automation/socialFeedService');
        const feeds = new SocialFeedService();
        await feeds.updateConfig(guild.id, { defaultChannelId: channel.id, liveDirectoryChannelId: channel.id, enabled: true });
        const dirPayload = await feeds.buildLiveDirectoryPayload(guild.id, guild.client);
        if (channel && typeof channel.send === 'function') {
          const sentMsg = await channel.send(dirPayload).catch(() => null);
          if (sentMsg?.id) {
            await sentMsg.pin().catch(() => {});
            await query(`UPDATE social_feed_configs SET live_directory_message_id = $2 WHERE guild_id = $1`, [guild.id, sentMsg.id]).catch(() => {});
          }
        }
        return { created: `#${channel.name} (Live Creator Hub pinned)` };
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
      autoCreateDescription: 'Creates a voice hub channel in "🔊 Dynamic Voice" ready for instant use.',
      async getCurrent(guild) {
        const res = await query(`SELECT source_channel_id as channel_id FROM join_create_hubs WHERE guild_id = $1 AND (enabled = true OR enabled IS NULL) LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
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
        const category = await ensureCategory(guild, { name: STANDARD_CATEGORIES.VOICE.name, keywords: STANDARD_CATEGORIES.VOICE.keywords, isPrivate: false });
        const channel = await autoCreateChannel(guild, { name: '➕ Join to Create', type: ChannelType.GuildVoice, parentId: category?.id });
        const { JoinCreateService } = require('../voice/joinCreateService');
        const joinCreate = new JoinCreateService();
        await joinCreate.registerHub(guild.id, channel.id, { enabled: true, categoryId: category?.id });
        return { created: `Voice Hub "${channel.name}"` };
      }
    }
  ],

  [ModuleKeys.PERMISSIONS]: [
    {
      id: 'perms_admin_role',
      moduleKey: ModuleKeys.PERMISSIONS,
      title: 'Administrator Staff Role',
      description: 'Select the primary Administrator role with full permissions to configure bot settings and staff commands.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Admin Role',
      autoCreateDescription: 'Creates an @Admin role with Administrator permissions.',
      async getCurrent(guild) {
        const res = await query(`SELECT role_id FROM role_permission_levels WHERE guild_id = $1 AND permission_level = 'ADMINISTRATOR'`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.role_id ? `<@&${res.rows[0].role_id}>` : null;
      },
      async applyDefault(guild) {
        const adminRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'admin' || r.name.toLowerCase() === 'administrator');
        if (adminRole) {
          const { PermissionService } = require('../permissions/permissionService');
          const permissions = new PermissionService();
          await permissions.setupRoles(guild.id, { adminRoleId: adminRole.id });
          return { result: `Assigned existing <@&${adminRole.id}>` };
        }
        return { result: 'Default administrator role mapped' };
      },
      async applySelection(guild, roleId) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: roleId });
      },
      async autoCreate(guild) {
        const adminRole = await autoCreateRole(guild, { name: 'Admin', permissions: [PermissionFlagsBits.Administrator] });
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { adminRoleId: adminRole.id });
        return { created: `@${adminRole.name}` };
      }
    },
    {
      id: 'perms_mod_role',
      moduleKey: ModuleKeys.PERMISSIONS,
      title: 'Moderator Staff Role',
      description: 'Select the Moderator role for staff who manage warnings, timeouts, and cases.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Moderator Role',
      autoCreateDescription: 'Creates an @Moderator role with moderation permissions.',
      async getCurrent(guild) {
        const res = await query(`SELECT role_id FROM role_permission_levels WHERE guild_id = $1 AND permission_level = 'MODERATOR'`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.role_id ? `<@&${res.rows[0].role_id}>` : null;
      },
      async applyDefault(guild) {
        const modRole = guild.roles.cache.find((r) => r.name.toLowerCase() === 'moderator' || r.name.toLowerCase() === 'mod');
        if (modRole) {
          const { PermissionService } = require('../permissions/permissionService');
          const permissions = new PermissionService();
          await permissions.setupRoles(guild.id, { modRoleId: modRole.id });
          return { result: `Assigned existing <@&${modRole.id}>` };
        }
        return { result: 'Default moderator role mapped' };
      },
      async applySelection(guild, roleId) {
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { modRoleId: roleId });
      },
      async autoCreate(guild) {
        const modRole = await autoCreateRole(guild, { name: 'Moderator', permissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] });
        const { PermissionService } = require('../permissions/permissionService');
        const permissions = new PermissionService();
        await permissions.setupRoles(guild.id, { modRoleId: modRole.id });
        return { created: `@${modRole.name}` };
      }
    }
  ],

  [ModuleKeys.MODERATION]: [
    {
      id: 'mod_log_channel',
      moduleKey: ModuleKeys.MODERATION,
      title: 'Moderation Log Channel',
      description: 'Select the channel where warns, timeouts, kicks, bans, and cases will be logged.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #mod-logs',
      autoCreateDescription: 'Creates private #mod-logs in "📋 Server Logs" for staff.',
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
        return { result: 'Moderation logs initialized' };
      },
      async applySelection(guild, channelId) {
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MODERATION_SAFETY', channelId);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'mod-logs', categoryName: STANDARD_CATEGORIES.LOGS.name, isPrivate: true, reason: 'SlickBot Moderation Logs' });
        const { LoggingService } = require('../logging/loggingService');
        const logging = new LoggingService();
        await logging.setupLogGroup(guild.id, 'MODERATION_SAFETY', channel.id);
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'mod_timeout_role',
      moduleKey: ModuleKeys.MODERATION,
      title: 'Server Timeout & Restriction Role',
      description: 'Select or auto-create a dedicated @Timeout role given to timed-out members to restrict access server-wide while preserving appeals channel access.',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Timeout Role',
      autoCreateDescription: 'Creates @Timeout role and syncs channel permissions server-wide with appeals exemption.',
      async getCurrent(guild) {
        const res = await query(`SELECT timeout_role_id FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.timeout_role_id ? `<@&${res.rows[0].timeout_role_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.roles?.cache?.find((r) => ['timeout', 'muted', 'mute'].includes(r.name.toLowerCase()));
        if (existing) {
          const { AutoModService } = require('../moderation/autoModService');
          const autoMod = new AutoModService();
          await autoMod.upsertConfig(guild.id, { timeout_role_id: existing.id });
          await autoMod.syncTimeoutRolePermissions(guild, { timeoutRoleId: existing.id });
          return { result: `Assigned existing <@&${existing.id}>` };
        }
        return { result: 'Default timeout settings saved' };
      },
      async applySelection(guild, roleId) {
        const { AutoModService } = require('../moderation/autoModService');
        const autoMod = new AutoModService();
        await autoMod.upsertConfig(guild.id, { timeout_role_id: roleId });
        await autoMod.syncTimeoutRolePermissions(guild, { timeoutRoleId: roleId });
      },
      async autoCreate(guild) {
        const { AutoModService } = require('../moderation/autoModService');
        const autoMod = new AutoModService();
        const res = await autoMod.createTimeoutRole(guild);
        return { created: `@${res.role?.name || 'Timeout'}` };
      }
    }
  ],

  [ModuleKeys.LOCKDOWN]: [
    {
      id: 'lockdown_updates',
      moduleKey: ModuleKeys.LOCKDOWN,
      title: 'Lockdown Announcement & Updates Channel',
      description: 'Select the public channel where emergency announcements and status updates will be displayed during lockdowns.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      autoCreateLabel: 'Auto-Create #server-announcements',
      autoCreateDescription: 'Creates public #server-announcements in "📌 Start Here" and default lockdown preset.',
      async getCurrent(guild) {
        const res = await query(`SELECT updates_channel_id FROM lockdown_presets WHERE guild_id = $1 AND active = true LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.updates_channel_id ? `<#${res.rows[0].updates_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { LockdownService } = require('../safety/lockdownService');
        const lockdown = new LockdownService();
        await lockdown.ensureDefaultPreset(guild.id);
        return { result: 'Default lockdown preset ready' };
      },
      async applySelection(guild, channelId) {
        const { LockdownService } = require('../safety/lockdownService');
        const lockdown = new LockdownService();
        await lockdown.upsertPreset({ guildId: guild.id, name: 'Default Lockdown', updatesChannelId: channelId });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'server-announcements', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Server announcements & emergency updates' });
        const { LockdownService } = require('../safety/lockdownService');
        const lockdown = new LockdownService();
        await lockdown.upsertPreset({ guildId: guild.id, name: 'Default Lockdown', updatesChannelId: channel.id });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.TEMP_ROLES]: [
    {
      id: 'temp_roles_setup',
      moduleKey: ModuleKeys.TEMP_ROLES,
      title: 'Temporary Roles System',
      description: 'Enable timed role assignments with automatic background expiry sweeps.',
      async getCurrent() {
        return 'Active & Ready';
      },
      async applyDefault() {
        return { result: 'Temporary roles system initialized' };
      },
      async applySelection() {
        return { result: 'Temporary roles system initialized' };
      },
      async autoCreate() {
        return { created: 'Temporary Roles initialized' };
      }
    }
  ],

  [ModuleKeys.UTILITY]: [
    {
      id: 'utility_poll_channel',
      moduleKey: ModuleKeys.UTILITY,
      title: 'Default Poll Channel',
      description: 'Select the default channel for interactive server polls and community votes.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #community-polls',
      autoCreateDescription: 'Creates public #community-polls in "🎉 Community Hub" channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT default_poll_channel_id FROM utility_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_poll_channel_id ? `<#${res.rows[0].default_poll_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { UtilityService } = require('../utility/utilityService');
        const utility = new UtilityService();
        await utility.upsertConfig(guild.id, { enabled: true, polls_enabled: true, purge_enabled: true, reminders_enabled: true, afk_enabled: true, embeds_enabled: true, snipe_enabled: true });
        return { result: 'Utility module features enabled' };
      },
      async applySelection(guild, channelId) {
        const { UtilityService } = require('../utility/utilityService');
        const utility = new UtilityService();
        await utility.upsertConfig(guild.id, { default_poll_channel_id: channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'community-polls', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Community votes & interactive polls' });
        const { UtilityService } = require('../utility/utilityService');
        const utility = new UtilityService();
        await utility.upsertConfig(guild.id, { default_poll_channel_id: channel.id, enabled: true });
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.REPORTS]: [
    {
      id: 'reports_review_channel',
      moduleKey: ModuleKeys.REPORTS,
      title: 'Member Reports Review Channel',
      description: 'Select the private staff channel where member and message reports will be delivered for review.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #report-reviews',
      autoCreateDescription: 'Creates private #report-reviews in "🛡️ Staff Area" channel for staff.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM report_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'report-reviews' || c.name.toLowerCase() === 'reports');
        if (existing) {
          await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, existing.id]);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Reports system initialized' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'report-reviews', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Member Reports Review Channel' });
        await query(`INSERT INTO report_configs (guild_id, review_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channel.id]);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.APPLICATIONS]: [
    {
      id: 'applications_review_channel',
      moduleKey: ModuleKeys.APPLICATIONS,
      title: 'Staff Applications Review Channel',
      description: 'Select the private staff channel where completed application submissions will be sent.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #application-reviews',
      autoCreateDescription: 'Creates private #application-reviews in "🛡️ Staff Area" channel and default Staff Application.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM application_types WHERE guild_id = $1 AND enabled = true LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault() {
        return { result: 'Applications system ready' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO application_types (guild_id, name, review_channel_id, enabled) VALUES ($1, 'Staff Application', $2, true) ON CONFLICT DO NOTHING`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'application-reviews', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Applications Review Channel' });
        await query(`INSERT INTO application_types (guild_id, name, review_channel_id, enabled) VALUES ($1, 'Staff Application', $2, true) ON CONFLICT DO NOTHING`, [guild.id, channel.id]);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.APPEALS]: [
    {
      id: 'appeals_review_channel',
      moduleKey: ModuleKeys.APPEALS,
      title: 'Punishment Appeals Review Channel',
      description: 'Select the private staff channel where member punishment appeals will be delivered.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #appeal-reviews',
      autoCreateDescription: 'Creates private #appeal-reviews in "🛡️ Staff Area" channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.review_channel_id ? `<#${res.rows[0].review_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'appeal-reviews' || c.name.toLowerCase() === 'appeals');
        if (existing) {
          await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, existing.id]);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Appeals system initialized' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'appeal-reviews', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, reason: 'SlickBot Appeals Review Channel' });
        await query(`INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()`, [guild.id, channel.id]);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.REACTION_ROLES]: [
    {
      id: 'reaction_roles_channel',
      moduleKey: ModuleKeys.REACTION_ROLES,
      title: 'Notification & Community Roles (Buttons Preset)',
      description: 'Select the channel where self-assignable notification role panels and button menus will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #get-roles & Notification Panel',
      autoCreateDescription: 'Creates public #get-roles in "📌 Start Here", 4 starter roles (@Announcements, @Events, @Giveaways, @Bot Updates), and publishes the button toggle panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND name = 'notification-roles' AND active = true`, [guild.id]).catch(() => ({ rows: [{ count: 0 }] }));
        return (res.rows[0]?.count || 0) > 0 ? 'Notification Roles panel active' : null;
      },
      async applyDefault(guild) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'notification-roles', title: '🔔 Notification Roles', description: 'Select your notification roles below.' }).catch(() => {});
        return { result: 'Starter notification role panel created' };
      },
      async applySelection(guild, channelId) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'notification-roles', title: '🔔 Notification Roles', description: 'Select your notification roles below.' }).catch(() => {});
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'get-roles', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Self-assignable member roles' });
        const announceRole = await autoCreateRole(guild, { name: 'Announcements' });
        const eventsRole = await autoCreateRole(guild, { name: 'Events' });
        const giveRole = await autoCreateRole(guild, { name: 'Giveaways' });
        const botUpdatesRole = await autoCreateRole(guild, { name: 'Bot Updates' });
        const { createPanel, addOption, buildRolePanelMessage } = require('../community/rolePanelService');
        const panel = await createPanel({
          guildId: guild.id,
          name: 'notification-roles',
          title: '🔔 Notification & Community Roles',
          description: 'Click the buttons below to toggle roles and customize what notifications you receive!',
          color: '#5865f2',
          mode: 'MULTI',
          displayMode: 'BUTTONS'
        });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: announceRole.id, label: 'Announcements', emoji: '📢', buttonColor: '#3498db' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: eventsRole.id, label: 'Events', emoji: '🎉', buttonColor: '#9b59b6' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: giveRole.id, label: 'Giveaways', emoji: '🎁', buttonColor: '#f1c40f' });
        await addOption({ guildId: guild.id, panelName: 'notification-roles', roleId: botUpdatesRole.id, label: 'Bot Updates', emoji: '🤖', buttonColor: '#5865f2' });
        const panelPayload = await buildRolePanelMessage(panel);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (Notification Role Panel published), 4 roles` };
      }
    },
    {
      id: 'color_roles_channel',
      moduleKey: ModuleKeys.REACTION_ROLES,
      title: 'Chat Username Colors (Dropdown Preset)',
      description: 'Select a channel where members can choose their favorite chat username color from a dropdown menu (Single-choice).',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create 8 Color Roles & Dropdown Panel',
      autoCreateDescription: 'Creates 8 color roles (Red, Orange, Yellow, Green, Blue, Purple, Pink, Cyan) and publishes a Dropdown Menu panel in #get-roles in "📌 Start Here".',
      async getCurrent(guild) {
        const res = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND name = 'color-roles' AND active = true`, [guild.id]).catch(() => ({ rows: [{ count: 0 }] }));
        return (res.rows[0]?.count || 0) > 0 ? 'Color Roles dropdown active' : null;
      },
      async applyDefault(guild) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'color-roles', title: '🎨 Name Colors', mode: 'SINGLE', displayMode: 'DROPDOWN' }).catch(() => {});
        return { result: 'Color roles preset initialized' };
      },
      async applySelection(guild, channelId) {
        const { createPanel } = require('../community/rolePanelService');
        await createPanel({ guildId: guild.id, name: 'color-roles', title: '🎨 Name Colors', mode: 'SINGLE', displayMode: 'DROPDOWN' }).catch(() => {});
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'get-roles', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Self-assignable member roles' });
        const createdRoles = [];
        for (const c of COLOR_PRESET_OPTIONS) {
          const r = await autoCreateRole(guild, { name: c.name, color: c.hex });
          createdRoles.push({ ...c, roleId: r.id });
        }
        const { createPanel, addOption, buildRolePanelMessage } = require('../community/rolePanelService');
        const panel = await createPanel({
          guildId: guild.id,
          name: 'color-roles',
          title: '🎨 Pick Your Name Color',
          description: 'Choose a color from the dropdown menu below to customize your username color in chat!',
          color: '#5865f2',
          mode: 'SINGLE',
          displayMode: 'DROPDOWN'
        });
        for (const c of createdRoles) {
          await addOption({
            guildId: guild.id,
            panelName: 'color-roles',
            roleId: c.roleId,
            label: c.name,
            emoji: c.emoji,
            description: `Set your username color to ${c.name}`,
            buttonColor: c.hex
          });
        }
        const panelPayload = await buildRolePanelMessage(panel);
        if (channel && typeof channel.send === 'function') {
          await channel.send(panelPayload).catch(() => {});
        }
        return { created: `#${channel.name} (8 Color Roles & Dropdown Panel published)` };
      }
    }
  ],

  [ModuleKeys.LEVELING]: [
    {
      id: 'leveling_channel',
      moduleKey: ModuleKeys.LEVELING,
      title: 'Level Up Announcement Channel',
      description: 'Select the channel where member rank and level-up announcements will be posted.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #level-ups & Rewards Guide',
      autoCreateDescription: 'Creates public #level-ups in "🎉 Community Hub" and publishes the Leveling XP Guide.',
      async getCurrent(guild) {
        const res = await query(`SELECT level_up_channel_id, enabled FROM leveling_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.level_up_channel_id ? `<#${res.rows[0].level_up_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { enabled: true });
        return { result: 'Leveling XP active' };
      },
      async applySelection(guild, channelId) {
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { levelUpChannelId: channelId, enabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'level-ups', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Member level up celebrations & XP announcements' });
        const { LevelingService } = require('../community/levelingService');
        const leveling = new LevelingService();
        await leveling.upsertConfig(guild.id, { levelUpChannelId: channel.id, enabled: true });
        const levelEmbed = createBaseEmbed({
          title: '🏆 Leveling & XP Rewards System',
          description: [
            'Earn XP automatically by chatting in text channels, participating in voice channels, and playing community games!',
            '',
            '**Useful Commands:**',
            '• `/level rank` — View your current level, rank, and XP progress',
            '• `/level leaderboard` — View the top ranked server members',
            '• `/level card` — Customize your rank card background and theme'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Leveling'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [levelEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Leveling Rewards Guide published)` };
      }
    }
  ],

  [ModuleKeys.COMMUNITY_GAMES]: [
    {
      id: 'games_lounge_channel',
      moduleKey: ModuleKeys.COMMUNITY_GAMES,
      title: 'Community Games Lounge & Counting Channels',
      description: 'Select channels for community board games and the server counting challenge.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #game-lounge & Games Panel',
      autoCreateDescription: 'Creates #game-lounge and #counting in "🎮 Games & Activities", enables games, and publishes the Game Lounge challenge panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM counting_game_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { CommunityGameService } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.upsertGameConfig(guild.id, 'TIC_TAC_TOE', { enabled: true });
        await games.upsertGameConfig(guild.id, 'CONNECT_FOUR', { enabled: true });
        return { result: 'Tic-Tac-Toe & Connect Four enabled' };
      },
      async applySelection(guild, channelId) {
        const { CommunityGameService } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.upsertGameConfig(guild.id, 'COUNTING', { enabled: true, channelId });
        await games.upsertCountingConfig(guild.id, { channelId });
        await games.upsertGameConfig(guild.id, 'TIC_TAC_TOE', { enabled: true });
        await games.upsertGameConfig(guild.id, 'CONNECT_FOUR', { enabled: true });
      },
      async autoCreate(guild) {
        const loungeChannel = await autoCreateChannel(guild, { name: 'game-lounge', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Challenge friends to Tic-Tac-Toe and Connect Four!' });
        const countChannel = await autoCreateChannel(guild, { name: 'counting', categoryName: STANDARD_CATEGORIES.GAMES.name, isPrivate: false, topic: 'Community counting challenge — Count up one number at a time!' });
        const { CommunityGameService, GAME_KEYS } = require('../community/gameService');
        const games = new CommunityGameService();
        await games.updateBoardGameConfig(guild.id, GAME_KEYS.TIC_TAC_TOE, { enabled: true, channelId: loungeChannel.id, winXp: 50 });
        await games.updateBoardGameConfig(guild.id, GAME_KEYS.CONNECT_FOUR, { enabled: true, channelId: loungeChannel.id, winXp: 50 });
        await games.updateCountingConfig(guild.id, { channelId: countChannel.id, startingNumber: 1, resetOnIncorrect: true });
        if (loungeChannel && typeof loungeChannel.send === 'function') {
          await games.createGamePanel({
            guildId: guild.id,
            channel: loungeChannel,
            title: '🎮 SlickBot Game Lounge',
            description: 'Challenge your friends to **Tic-Tac-Toe** or **Connect Four** and earn XP! Select a game below to begin.'
          }).catch(() => {});
        }
        return { created: `#${loungeChannel.name} (Games Panel published), #${countChannel.name}` };
      }
    }
  ],

  [ModuleKeys.FAQ]: [
    {
      id: 'faq_channel',
      moduleKey: ModuleKeys.FAQ,
      title: 'Knowledge Base / FAQ Forum',
      description: 'Select the forum channel where FAQ questions and answers are organized.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildForum, ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #faq-help & Publish Panel',
      autoCreateDescription: 'Creates public #faq-help in "📌 Start Here" and publishes the interactive FAQ Search Panel.',
      async getCurrent(guild) {
        const res = await query(`SELECT forum_channel_id FROM faq_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.forum_channel_id ? `<#${res.rows[0].forum_channel_id}>` : null;
      },
      async applyDefault() {
        return { result: 'FAQ system ready' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO faq_configs (guild_id, forum_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET forum_channel_id = EXCLUDED.forum_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'faq-help', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Frequently asked questions & knowledge base' });
        await query(`INSERT INTO faq_configs (guild_id, forum_channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET forum_channel_id = EXCLUDED.forum_channel_id, updated_at = NOW()`, [guild.id, channel.id]);
        const { createBaseEmbed, createButtonRow, createPanelButton, ButtonStyle, SlickBotColors } = require('../ui/uiService');
        const { CustomIds } = require('../ui/customIds');
        const faqEmbed = createBaseEmbed({
          title: '📖 Server FAQ & Knowledge Base',
          description: 'Welcome to the FAQ hub! Click **Search FAQ** below to search for answers, view common guidelines, or open support if you need further help.',
          color: SlickBotColors.INFO,
          footer: 'SlickBot Knowledge Base'
        });
        const row = createButtonRow([
          createPanelButton(CustomIds.FaqSearchModal, 'Search FAQ', ButtonStyle.Primary, '🔍'),
          createPanelButton(CustomIds.TicketsRefresh, 'Open Support', ButtonStyle.Secondary, '🎟️')
        ]);
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [faqEmbed], components: [row] }).catch(() => {});
        }
        return { created: `#${channel.name} (FAQ Guide Panel published)` };
      }
    }
  ],

  [ModuleKeys.REFERRALS]: [
    {
      id: 'referrals_config',
      moduleKey: ModuleKeys.REFERRALS,
      title: 'Member Referral Tracking & Bonus XP',
      description: 'Enable member referral rewards and tracking.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #referrals & Referral Guide',
      autoCreateDescription: 'Creates public #referrals in "🎉 Community Hub" and enables 500 XP bonus per invite.',
      async getCurrent(guild) {
        const res = await query(`SELECT referral_xp, enabled FROM referral_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.enabled !== false ? `${res.rows[0]?.referral_xp || 500} XP Bonus (Enabled)` : null;
      },
      async applyDefault(guild) {
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
        return { result: 'Referrals tracking enabled (500 bonus XP)' };
      },
      async applySelection(guild) {
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'referrals', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Invite friends and earn referral bonus XP' });
        const { ReferralService } = require('../community/referralService');
        const referrals = new ReferralService();
        await referrals.upsertConfig(guild.id, { enabled: true, referralXp: 500 });
        const refEmbed = createBaseEmbed({
          title: '🤝 Member Referral Program',
          description: [
            'Invite your friends to the server and earn **500 Bonus XP** for every verified member who joins through your link!',
            '',
            '**How It Works:**',
            '1. Run `/referral link` to generate your unique server invite link.',
            '2. Share your link with friends.',
            '3. When they join, your referral count increases and bonus XP is awarded automatically!',
            '',
            'Use `/referral stats` to track your total invites and bonus XP earned.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Referrals • 500 XP per invite'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [refEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Referral Guide published)` };
      }
    }
  ],

  [ModuleKeys.ACHIEVEMENTS]: [
    {
      id: 'achievements_channel',
      moduleKey: ModuleKeys.ACHIEVEMENTS,
      title: 'Achievement Unlocks Announcement Channel',
      description: 'Select the channel where member achievement tier milestones will be celebrated.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #achievements & Showcase',
      autoCreateDescription: 'Creates public #achievements in "🎉 Community Hub", initializes starter milestone tiers, and publishes the Achievements Showcase.',
      async getCurrent(guild) {
        const res = await query(`SELECT announcement_channel_id FROM achievement_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.announcement_channel_id ? `<#${res.rows[0].announcement_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { enabled: true, dmEnabled: true });
        return { result: 'Achievement tiers and tracking enabled' };
      },
      async applySelection(guild, channelId) {
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { announcementChannelId: channelId, enabled: true, dmEnabled: true });
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'achievements', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Member activity achievement milestones' });
        const { AchievementService } = require('../community/achievementService');
        const achievements = new AchievementService();
        await achievements.ensureDefaultTiers(guild.id);
        await achievements.upsertConfig(guild.id, { announcementChannelId: channel.id, enabled: true, dmEnabled: true });
        const achieveEmbed = createBaseEmbed({
          title: '🏅 Community Achievements & Milestones',
          description: [
            'Unlock achievements and showcase badges as you participate in the server!',
            '',
            'Milestones are tracked for message counts, voice time, ticket resolutions, and community game victories.',
            '',
            '**Check Your Progress:** Use `/achievement list` to see available milestones and unlock status.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Achievements'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [achieveEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Achievements Showcase published)` };
      }
    }
  ],

  [ModuleKeys.SERVER_STATS]: [
    {
      id: 'stats_category',
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
      async applySelection(guild) {
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, { enabled: true });
      },
      async autoCreate(guild) {
        const category = await ensureCategory(guild, { name: STANDARD_CATEGORIES.STATS.name, keywords: STANDARD_CATEGORIES.STATS.keywords, isPrivate: false });
        const memberCount = guild.memberCount || 1;
        const memberChannel = await autoCreateChannel(guild, { name: `👥 Members: ${memberCount}`, type: ChannelType.GuildVoice, parentId: category?.id });
        const voiceChannel = await autoCreateChannel(guild, { name: `🎙️ In Voice: 0`, type: ChannelType.GuildVoice, parentId: category?.id });
        const { ServerStatsService } = require('../community/serverStatsService');
        const stats = new ServerStatsService();
        await stats.upsertConfig(guild.id, {
          enabled: true,
          memberChannelId: memberChannel.id,
          voiceChannelId: voiceChannel.id
        });
        return { created: `Category "${category?.name || 'Server Stats'}" & live counters` };
      }
    }
  ],

  [ModuleKeys.CUSTOM_COMMANDS]: [
    {
      id: 'custom_commands_prefix',
      moduleKey: ModuleKeys.CUSTOM_COMMANDS,
      title: 'Custom Commands Trigger Prefix',
      description: 'Set your server prefix for custom text triggers (e.g. `!` or `?`).',
      async getCurrent(guild) {
        const res = await query(`SELECT prefix, enabled FROM custom_command_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.prefix ? `Prefix: \`${res.rows[0].prefix}\`` : null;
      },
      async applyDefault(guild) {
        const { CustomCommandService } = require('../custom/customCommandService');
        const customCommands = new CustomCommandService();
        await customCommands.upsertConfig(guild.id, { enabled: true, prefix: '!' });
        return { result: 'Custom commands enabled with prefix "!"' };
      },
      async applySelection(guild) {
        const { CustomCommandService } = require('../custom/customCommandService');
        const customCommands = new CustomCommandService();
        await customCommands.upsertConfig(guild.id, { enabled: true, prefix: '!' });
      },
      async autoCreate(guild) {
        const { CustomCommandService } = require('../custom/customCommandService');
        const customCommands = new CustomCommandService();
        await customCommands.upsertConfig(guild.id, { enabled: true, prefix: '!' });
        await customCommands.createCommand({
          guildId: guild.id,
          name: 'rules',
          response: 'Please respect all members, follow Discord Terms of Service, and enjoy your stay!',
          actorUserId: guild.ownerId || 'system'
        }).catch(() => {});
        return { created: 'Custom command "!rules" and prefix "!"' };
      }
    }
  ],

  [ModuleKeys.SCHEDULED_MESSAGES]: [
    {
      id: 'scheduled_channel',
      moduleKey: ModuleKeys.SCHEDULED_MESSAGES,
      title: 'Default Scheduled Announcements Channel',
      description: 'Select the default channel where scheduled recurring messages will post.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText],
      autoCreateLabel: 'Auto-Create #announcements',
      autoCreateDescription: 'Creates public #announcements in "📌 Start Here" channel.',
      async getCurrent(guild) {
        const res = await query(`SELECT default_channel_id FROM scheduled_message_configs WHERE guild_id = $1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.default_channel_id ? `<#${res.rows[0].default_channel_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.channels?.cache?.find((c) => c.name.toLowerCase() === 'announcements');
        if (existing) {
          await query(`INSERT INTO scheduled_message_configs (guild_id, default_channel_id, enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET default_channel_id = EXCLUDED.default_channel_id, updated_at = NOW()`, [guild.id, existing.id]);
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Scheduled messages enabled' };
      },
      async applySelection(guild, channelId) {
        await query(`INSERT INTO scheduled_message_configs (guild_id, default_channel_id, enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET default_channel_id = EXCLUDED.default_channel_id, updated_at = NOW()`, [guild.id, channelId]);
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'announcements', categoryName: STANDARD_CATEGORIES.START_HERE.name, isPrivate: false, topic: 'Scheduled server announcements' });
        await query(`INSERT INTO scheduled_message_configs (guild_id, default_channel_id, enabled) VALUES ($1, $2, true) ON CONFLICT (guild_id) DO UPDATE SET default_channel_id = EXCLUDED.default_channel_id, updated_at = NOW()`, [guild.id, channel.id]);
        return { created: `#${channel.name}` };
      }
    }
  ],

  [ModuleKeys.AUTOMOD]: [
    {
      id: 'automod_raid_alert',
      moduleKey: ModuleKeys.AUTOMOD,
      title: 'Anti-Raid Emergency Alert Channel',
      description: 'Select the moderation or staff channel where emergency join surge alerts and lockdown prompts will be dispatched.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      autoCreateLabel: 'Use #mod-log / #staff',
      autoCreateDescription: 'Sets up emergency raid notification routing.',
      async getCurrent(guild) {
        const res = await query(`SELECT raid_alert_channel_id, alert_channel_id FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        const id = res.rows[0]?.raid_alert_channel_id || res.rows[0]?.alert_channel_id;
        return id ? `<#${id}>` : null;
      },
      async applyDefault(guild) {
        const target = guild.channels?.cache?.find((c) => ['mod-log', 'mod-logs', 'staff', 'admin-logs'].includes(c.name.toLowerCase()));
        if (target) {
          await query(
            `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
             VALUES ($1, $2, true, true)
             ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
            [guild.id, target.id]
          );
          return { result: `Assigned raid alerts to <#${target.id}>` };
        }
        return { result: 'Auto-Mod & Anti-Raid shield ready' };
      },
      async applySelection(guild, channelId) {
        await query(
          `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
           VALUES ($1, $2, true, true)
           ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
          [guild.id, channelId]
        );
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'mod-log', categoryName: STANDARD_CATEGORIES.STAFF.name, isPrivate: true, topic: 'Moderation logs and emergency raid alerts' });
        await query(
          `INSERT INTO automod_configs (guild_id, raid_alert_channel_id, enabled, raid_shield_enabled)
           VALUES ($1, $2, true, true)
           ON CONFLICT (guild_id) DO UPDATE SET raid_alert_channel_id = EXCLUDED.raid_alert_channel_id, updated_at = NOW()`,
          [guild.id, channel.id]
        );
        return { created: `#${channel.name}` };
      }
    },
    {
      id: 'automod_timeout_role',
      moduleKey: ModuleKeys.AUTOMOD,
      title: 'Auto-Mod Timeout & Restriction Role',
      description: 'Configure a dedicated server role given to members punished with timeouts to restrict channel access (exempting appeals).',
      pickerType: 'ROLE',
      autoCreateLabel: 'Auto-Create @Timeout Role',
      autoCreateDescription: 'Creates @Timeout role and syncs channel permissions with appeals exemption.',
      async getCurrent(guild) {
        const res = await query(`SELECT timeout_role_id FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.timeout_role_id ? `<@&${res.rows[0].timeout_role_id}>` : null;
      },
      async applyDefault(guild) {
        const existing = guild.roles?.cache?.find((r) => ['timeout', 'muted', 'mute'].includes(r.name.toLowerCase()));
        if (existing) {
          const { AutoModService } = require('../moderation/autoModService');
          const autoMod = new AutoModService();
          await autoMod.upsertConfig(guild.id, { timeout_role_id: existing.id });
          await autoMod.syncTimeoutRolePermissions(guild, { timeoutRoleId: existing.id });
          return { result: `Assigned existing <@&${existing.id}>` };
        }
        return { result: 'Auto-Mod timeout configuration saved' };
      },
      async applySelection(guild, roleId) {
        const { AutoModService } = require('../moderation/autoModService');
        const autoMod = new AutoModService();
        await autoMod.upsertConfig(guild.id, { timeout_role_id: roleId });
        await autoMod.syncTimeoutRolePermissions(guild, { timeoutRoleId: roleId });
      },
      async autoCreate(guild) {
        const { AutoModService } = require('../moderation/autoModService');
        const autoMod = new AutoModService();
        const res = await autoMod.createTimeoutRole(guild);
        return { created: `@${res.role?.name || 'Timeout'}` };
      }
    }
  ],

  [ModuleKeys.STARBOARD]: [
    {
      id: 'starboard_channel',
      moduleKey: ModuleKeys.STARBOARD,
      title: 'Starboard Showcase Channel',
      description: 'Select the showcase channel where top-starred community messages will be pinned automatically.',
      pickerType: 'CHANNEL',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      autoCreateLabel: 'Auto-Create #starboard & Guide',
      autoCreateDescription: 'Creates a public #starboard in "🎉 Community Hub" showcase channel and publishes the Hall of Fame guide.',
      async getCurrent(guild) {
        const res = await query(`SELECT channel_id FROM starboard_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
        return res.rows[0]?.channel_id ? `<#${res.rows[0].channel_id}>` : null;
      },
      async applyDefault(guild) {
        const cacheList = Array.from(guild.channels?.cache?.values?.() || guild.channels?.cache || []);
        const existing = cacheList.find((c) => ['starboard', 'hall-of-fame', 'stars', 'highlights'].includes(c?.name?.toLowerCase()));
        if (existing) {
          await query(
            `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
             VALUES ($1, $2, true, 3, '⭐')
             ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
            [guild.id, existing.id]
          );
          return { result: `Assigned existing <#${existing.id}>` };
        }
        return { result: 'Starboard enabled' };
      },
      async applySelection(guild, channelId) {
        await query(
          `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
           VALUES ($1, $2, true, 3, '⭐')
           ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
          [guild.id, channelId]
        );
      },
      async autoCreate(guild) {
        const channel = await autoCreateChannel(guild, { name: 'starboard', categoryName: STANDARD_CATEGORIES.COMMUNITY.name, isPrivate: false, topic: 'Community Hall of Fame — Starred messages' });
        await query(
          `INSERT INTO starboard_configs (guild_id, channel_id, enabled, threshold, emoji)
           VALUES ($1, $2, true, 3, '⭐')
           ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, updated_at = NOW()`,
          [guild.id, channel.id]
        );
        const starEmbed = createBaseEmbed({
          title: '⭐ Community Starboard / Hall of Fame',
          description: [
            'Welcome to the server Hall of Fame!',
            '',
            'When great messages, funny quotes, or impressive achievements receive **3 or more ⭐ reactions**, they are automatically featured here.',
            '',
            'React to your favorite messages with ⭐ to vote them onto the board!'
          ].join('\n'),
          color: 0xf1c40f,
          footer: 'SlickBot Starboard • Threshold: 3 ⭐'
        });
        if (channel && typeof channel.send === 'function') {
          await channel.send({ embeds: [starEmbed] }).catch(() => {});
        }
        return { created: `#${channel.name} (Hall of Fame Guide published)` };
      }
    }
  ]
});

const CATEGORY_ONBOARDING_MAP = Object.freeze({
  CORE: [
    ...ONBOARDING_STEPS[ModuleKeys.PERMISSIONS],
    ONBOARDING_STEPS[ModuleKeys.LOGGING][0],
    ...ONBOARDING_STEPS[ModuleKeys.MODERATION],
    ...ONBOARDING_STEPS[ModuleKeys.LOCKDOWN],
    ...ONBOARDING_STEPS[ModuleKeys.AUTOMOD]
  ],
  SUPPORT: [
    ...ONBOARDING_STEPS[ModuleKeys.TICKETS],
    ...ONBOARDING_STEPS[ModuleKeys.REPORTS],
    ...ONBOARDING_STEPS[ModuleKeys.APPLICATIONS],
    ...ONBOARDING_STEPS[ModuleKeys.APPEALS]
  ],
  COMMUNITY: [
    ...ONBOARDING_STEPS[ModuleKeys.WELCOME],
    ...ONBOARDING_STEPS[ModuleKeys.REACTION_ROLES],
    ...ONBOARDING_STEPS[ModuleKeys.SERVER_STATS],
    ...ONBOARDING_STEPS[ModuleKeys.GIVEAWAYS],
    ...ONBOARDING_STEPS[ModuleKeys.BIRTHDAYS],
    ...ONBOARDING_STEPS[ModuleKeys.COMMUNITY_GAMES],
    ...ONBOARDING_STEPS[ModuleKeys.SUGGESTIONS],
    ...ONBOARDING_STEPS[ModuleKeys.STARBOARD],
    ...ONBOARDING_STEPS[ModuleKeys.LEVELING],
    ...ONBOARDING_STEPS[ModuleKeys.ACHIEVEMENTS],
    ...ONBOARDING_STEPS[ModuleKeys.REFERRALS],
    ...ONBOARDING_STEPS[ModuleKeys.FAQ]
  ],
  AUTOMATION: [
    ...ONBOARDING_STEPS[ModuleKeys.BOT_UPDATES],
    ...ONBOARDING_STEPS[ModuleKeys.SOCIAL_FEEDS],
    ...ONBOARDING_STEPS[ModuleKeys.SCHEDULED_MESSAGES]
  ]
});

function renderProgressBar(current, total, length = 10) {
  if (!total || total <= 0) return '░'.repeat(length);
  const percent = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(percent * length);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, length - filled));
}

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
    const key = String(moduleKey || '').toUpperCase();
    const steps = CATEGORY_ONBOARDING_MAP[key] || ONBOARDING_STEPS[key] || ONBOARDING_STEPS[moduleKey];
    if (!steps || !steps.length) return null;

    const sessionId = generateSessionId(guildId, userId);
    const isCategory = Boolean(CATEGORY_ONBOARDING_MAP[key]);
    const session = {
      id: sessionId,
      guildId,
      userId,
      type: isCategory ? 'CATEGORY_ONBOARDING' : 'MODULE_ONBOARDING',
      categoryKey: isCategory ? key : null,
      moduleKey: isCategory ? null : key,
      stepIndex: 0,
      steps,
      completedSteps: [],
      createdAt: Date.now()
    };
    activeSessions.set(sessionId, session);
    return session;
  }

  async advanceSession(session, guild, action = 'NEXT', payload = {}, permissions = null) {
    const currentStep = session.steps[session.stepIndex];
    const moduleKey = currentStep?.moduleKey;

    if (action === 'SKIP') {
      let isConfigured = false;
      if (currentStep && typeof currentStep.getCurrent === 'function' && guild) {
        const currentVal = await currentStep.getCurrent(guild).catch(() => null);
        if (currentVal) isConfigured = true;
      }

      if (permissions && moduleKey && guild) {
        const currentlyEnabled = await permissions.isModuleEnabled(guild.id, moduleKey).catch(() => false);
        if (!isConfigured && !currentlyEnabled) {
          await permissions.setModuleEnabled(guild.id, moduleKey, false).catch(() => {});
          session.completedSteps.push({ step: currentStep, result: 'Skipped (Disabled)' });
        } else {
          session.completedSteps.push({ step: currentStep, result: 'Skipped (Kept Active)' });
        }
      } else {
        session.completedSteps.push({ step: currentStep, result: 'Skipped' });
      }
    } else if (action === 'KEEP_DEFAULT') {
      let applied = 'Applied default';
      if (currentStep && typeof currentStep.applyDefault === 'function') {
        const def = await currentStep.applyDefault(guild, session).catch((err) => ({ error: err.message }));
        applied = def?.result || 'Default applied';
      }
      if (permissions && moduleKey && guild) {
        await permissions.setModuleEnabled(guild.id, moduleKey, true).catch(() => {});
      }
      session.completedSteps.push({ step: currentStep, result: applied });
    } else if (action === 'KEEP_CURRENT') {
      let currentVal = null;
      if (currentStep && typeof currentStep.getCurrent === 'function' && guild) {
        currentVal = await currentStep.getCurrent(guild).catch(() => null);
      }
      if (currentVal) {
        if (permissions && moduleKey && guild) {
          await permissions.setModuleEnabled(guild.id, moduleKey, true).catch(() => {});
        }
        session.completedSteps.push({ step: currentStep, result: `Kept current: ${currentVal}` });
      } else {
        // Fallback to default if no current setup stored
        let applied = 'Applied default (no current setup stored)';
        if (currentStep && typeof currentStep.applyDefault === 'function') {
          const def = await currentStep.applyDefault(guild, session).catch((err) => ({ error: err.message }));
          applied = def?.result ? `${def.result} (no current setup stored)` : applied;
        }
        if (permissions && moduleKey && guild) {
          await permissions.setModuleEnabled(guild.id, moduleKey, true).catch(() => {});
        }
        session.completedSteps.push({ step: currentStep, result: applied });
      }
    } else if (action === 'AUTO_CREATE') {
      if (permissions && moduleKey && guild) {
        await permissions.setModuleEnabled(guild.id, moduleKey, true).catch(() => {});
      }
      session.completedSteps.push({ step: currentStep, result: payload.created ? `${payload.created} (Enabled)` : 'Auto-created & Enabled' });
    } else if (action === 'SELECT') {
      if (permissions && moduleKey && guild) {
        await permissions.setModuleEnabled(guild.id, moduleKey, true).catch(() => {});
      }
      session.completedSteps.push({ step: currentStep, result: payload.selected ? `${payload.selected} (Enabled)` : 'Configured & Enabled' });
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
        .map((item, idx) => `**Step ${idx + 1}: ${item.step?.title || 'Configuration'}** (\`${item.step?.moduleKey || 'MODULE'}\`)\n└ ${item.result || 'Completed'}`)
        .join('\n\n');

      return {
        embeds: [createSuccessEmbed(
          '🎉 Server Onboarding Complete!',
          `All setup steps have been completed! Your server modules, channels, roles, and interactive panels have been provisioned and configured.\n\n${completedList || ''}`
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
    const currentStepNum = session.stepIndex + 1;

    // Track unique modules across the session
    const uniqueModules = [];
    for (const s of session.steps) {
      if (s?.moduleKey && !uniqueModules.includes(s.moduleKey)) {
        uniqueModules.push(s.moduleKey);
      }
    }
    const currentModuleKey = currentStep.moduleKey || 'CUSTOM';
    const currentModuleIndex = Math.max(0, uniqueModules.indexOf(currentModuleKey));
    const totalUniqueModules = Math.max(1, uniqueModules.length);

    // Module-level sub-step calculations
    const moduleSteps = session.steps.filter((s) => s?.moduleKey === currentModuleKey);
    const moduleStepIndex = Math.max(0, moduleSteps.findIndex((s) => s.id === currentStep.id));
    const totalModuleSteps = Math.max(1, moduleSteps.length);

    // Progress bar calculations
    const overallPercent = Math.round((session.stepIndex / totalSteps) * 100);
    const overallBar = renderProgressBar(session.stepIndex, totalSteps, 10);

    const modulePercent = Math.round(((moduleStepIndex + 1) / totalModuleSteps) * 100);
    const moduleBar = renderProgressBar(moduleStepIndex + 1, totalModuleSteps, 8);

    const moduleHeader = `📦 **Module ${currentModuleIndex + 1} of ${totalUniqueModules}:** **${currentStep.moduleName || currentModuleKey}** (\`${currentModuleKey}\`) • **Category:** *${currentStep.categoryLabel || 'Server System'}*`;
    const moduleOverviewText = currentStep.moduleOverview ? `📖 *${currentStep.moduleOverview}*` : '';

    const lines = [
      `🌐 **Overall Progress:** \`[${overallBar}]\` **${overallPercent}%** (Module ${currentModuleIndex + 1}/${totalUniqueModules} • Step ${currentStepNum}/${totalSteps})`,
      totalModuleSteps > 1 ? `🔹 **Module Setup:** \`[${moduleBar}]\` **Step ${moduleStepIndex + 1} of ${totalModuleSteps}** (${modulePercent}%)` : '',
      '',
      moduleHeader,
      moduleOverviewText,
      '',
      `🎯 **Step ${currentStepNum}: ${currentStep.title}**`,
      currentStep.description,
      '',
      `**Current Setting:** ${currentVal ? `\`${currentVal}\`` : '*None (Not configured yet)*'}`,
      currentStep.autoCreateDescription ? `💡 *Tip: Click **${currentStep.autoCreateLabel || 'Auto-Create for Me'}** to let SlickBot provision channels, roles, and live interactive panels automatically.*` : ''
    ].filter(Boolean);

    const embed = createBaseEmbed({
      title: session.type === 'SERVER_ONBOARDING'
        ? `🚀 SlickBot Guided Server Onboarding (${currentStepNum}/${totalSteps})`
        : `🚀 Guided Setup: ${currentStep.moduleName || currentStep.title}`,
      description: lines.join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: `SlickBot Setup • Step ${currentStepNum}/${totalSteps} • ${currentStep.categoryLabel || 'Onboarding'}`
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
  ensureCategory,
  STANDARD_CATEGORIES,
  ONBOARDING_STEPS,
  CATEGORY_ONBOARDING_MAP
};
