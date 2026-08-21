const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys, defaultModules } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildSetupPanel } = require('../modules/ui/panels');
const { StarterLogModuleKeys, getLogModule } = require('../modules/logging/logEventCatalog');
const { botOwnerIds } = require('../config/env');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the SlickBot setup center for this server.')
    .addChannelOption((option) =>
      option
        .setName('log_channel')
        .setDescription('Optional channel for core and moderation log modules. No noisy modules are routed by default.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName('admin_role')
        .setDescription('Optional role for bot administration.')
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName('moderator_role')
        .setDescription('Optional role for moderation commands.')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('start_onboarding')
        .setDescription('Launch the interactive guided setup wizard.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('module')
        .setDescription('Optionally choose a specific module to onboard.')
        .setRequired(false)
        .setAutocomplete(true)
    ),
  actionKey: ActionKeys.Setup,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction, ctx) {
    const logChannel = interaction.options.getChannel('log_channel', false);
    const adminRole = interaction.options.getRole('admin_role', false);
    const modRole = interaction.options.getRole('moderator_role', false);

    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (logChannel) {
      await query(
        `UPDATE guild_configs SET default_log_channel_id = $1, updated_at = NOW() WHERE guild_id = $2`,
        [logChannel.id, interaction.guildId]
      );

      for (const moduleKey of StarterLogModuleKeys) {
        const logModule = getLogModule(moduleKey);
        await query(
          `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, channel_id, enabled)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (guild_id, module_key)
           DO UPDATE SET
             channel_id = EXCLUDED.channel_id,
             enabled = true,
             delivery_mode = EXCLUDED.delivery_mode,
             updated_at = NOW()`,
          [interaction.guildId, moduleKey, logModule?.defaultDelivery || 'IMMEDIATE', logChannel.id]
        );
      }
    }

    if (adminRole) {
      await query(
        `INSERT INTO role_permission_levels (guild_id, role_id, permission_level)
         VALUES ($1, $2, 'ADMINISTRATOR')
         ON CONFLICT (guild_id, role_id) DO UPDATE SET permission_level = 'ADMINISTRATOR', updated_at = NOW()`,
        [interaction.guildId, adminRole.id]
      );
    }

    if (modRole) {
      await query(
        `INSERT INTO role_permission_levels (guild_id, role_id, permission_level)
         VALUES ($1, $2, 'MODERATOR')
         ON CONFLICT (guild_id, role_id) DO UPDATE SET permission_level = 'MODERATOR', updated_at = NOW()`,
        [interaction.guildId, modRole.id]
      );
    }

    for (const moduleConfig of defaultModules) {
      await query(
        `INSERT INTO module_configs (guild_id, module_key, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET enabled = module_configs.enabled, updated_at = NOW()`,
        [interaction.guildId, moduleConfig.key, moduleConfig.enabled]
      );
    }

    for (const ownerId of botOwnerIds) {
      await ctx.permissions.ensureOwnerTeam(interaction.guildId, ownerId);
    }

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.Setup,
      targetType: 'GuildConfig',
      targetId: interaction.guildId,
      summary: 'SlickBot setup center opened.',
      metadata: {
        starterLogModuleChannelId: logChannel?.id || null,
        adminRoleId: adminRole?.id || null,
        moderatorRoleId: modRole?.id || null
      }
    });

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'setup',
      title: 'SlickBot Setup Updated',
      body: [
        `Updated By: <@${interaction.user.id}>`,
        logChannel ? `Starter Log Channel: <#${logChannel.id}>` : null,
        adminRole ? `Admin Role: <@&${adminRole.id}>` : null,
        modRole ? `Moderator Role: <@&${modRole.id}>` : null
      ].filter(Boolean).join('\n') || 'SlickBot setup center opened.',
      metadata: {
        actorUserId: interaction.user.id,
        starterLogModuleChannelId: logChannel?.id || null,
        adminRoleId: adminRole?.id || null,
        moderatorRoleId: modRole?.id || null
      }
    });

    const startOnboarding = interaction.options.getBoolean('start_onboarding', false);
    const targetModule = interaction.options.getString('module', false);

    if (startOnboarding || targetModule) {
      const { OnboardingService } = require('../modules/onboarding/onboardingService');
      const onboarding = new OnboardingService();
      const session = targetModule
        ? onboarding.startModuleOnboarding(interaction.guildId, interaction.user.id, targetModule.toUpperCase())
        : onboarding.startServerOnboarding(interaction.guildId, interaction.user.id);

      if (session) {
        const firstStep = session.steps[0];
        const currentVal = firstStep && typeof firstStep.getCurrent === 'function' ? await firstStep.getCurrent(interaction.guild).catch(() => null) : null;
        return replyPrivate(interaction, onboarding.buildOnboardingPayload(session, currentVal));
      }
    }

    await replyPrivate(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'module') {
      const choices = [
        { name: '📋 Audit & Event Logging (LOGGING)', value: 'LOGGING' },
        { name: '🔐 Permissions & Staff Roles (PERMISSIONS)', value: 'PERMISSIONS' },
        { name: '👋 Welcome & Auto-Roles (WELCOME)', value: 'WELCOME' },
        { name: '🎟️ Support Tickets (TICKETS)', value: 'TICKETS' },
        { name: '🚩 User & Message Reports (REPORTS)', value: 'REPORTS' },
        { name: '📝 Staff Applications (APPLICATIONS)', value: 'APPLICATIONS' },
        { name: '⚖️ Punishment Appeals (APPEALS)', value: 'APPEALS' },
        { name: '🎉 Giveaways (GIVEAWAYS)', value: 'GIVEAWAYS' },
        { name: '🎂 Birthdays (BIRTHDAYS)', value: 'BIRTHDAYS' },
        { name: '📈 Leveling & XP (LEVELING)', value: 'LEVELING' },
        { name: '🏆 Achievements (ACHIEVEMENTS)', value: 'ACHIEVEMENTS' },
        { name: '🎲 Community Games (COMMUNITY_GAMES)', value: 'COMMUNITY_GAMES' },
        { name: '💡 Member Suggestions (SUGGESTIONS)', value: 'SUGGESTIONS' },
        { name: '📚 Knowledge Base / FAQ (FAQ)', value: 'FAQ' },
        { name: '👥 Member Referrals (REFERRALS)', value: 'REFERRALS' },
        { name: '📊 Server Stats Counters (SERVER_STATS)', value: 'SERVER_STATS' },
        { name: '💬 Custom Commands (CUSTOM_COMMANDS)', value: 'CUSTOM_COMMANDS' },
        { name: '🔊 Join-to-Create Voice (JOIN_TO_CREATE)', value: 'JOIN_TO_CREATE' },
        { name: '🗓️ Scheduled Messages (SCHEDULED_MESSAGES)', value: 'SCHEDULED_MESSAGES' },
        { name: '🔔 Bot Updates & Releases (BOT_UPDATES)', value: 'BOT_UPDATES' },
        { name: '📺 Social Stream Alerts (SOCIAL_FEEDS)', value: 'SOCIAL_FEEDS' },
        { name: '🛡️ Moderation & Cases (MODERATION)', value: 'MODERATION' },
        { name: '🔒 Emergency Lockdown (LOCKDOWN)', value: 'LOCKDOWN' },
        { name: '⏳ Temporary Roles (TEMP_ROLES)', value: 'TEMP_ROLES' }
      ];

      const queryText = String(focused.value || '').toLowerCase().trim();
      const filtered = choices.filter(
        (item) => item.name.toLowerCase().includes(queryText) || item.value.toLowerCase().includes(queryText)
      ).slice(0, 25);
      await interaction.respond(filtered).catch(() => {});
    }
  }
};
