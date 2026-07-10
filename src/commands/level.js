const { SlashCommandBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { LevelingService, formatMultiplier } = require('../modules/community/levelingService');

const leveling = new LevelingService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Manage SlickBot leveling and XP.')
    .addSubcommand((sub) => sub.setName('manager').setDescription('Open the leveling manager.'))
    .addSubcommand((sub) => sub.setName('setup').setDescription('Configure automatic message XP.')
      .addBooleanOption((o) => o.setName('enabled').setDescription('Enable or disable XP awards.').setRequired(false))
      .addIntegerOption((o) => o.setName('xp_min').setDescription('Minimum XP per eligible message.').setMinValue(1).setMaxValue(1000).setRequired(false))
      .addIntegerOption((o) => o.setName('xp_max').setDescription('Maximum XP per eligible message.').setMinValue(1).setMaxValue(1000).setRequired(false))
      .addIntegerOption((o) => o.setName('cooldown_seconds').setDescription('XP cooldown per user.').setMinValue(5).setMaxValue(86400).setRequired(false))
      .addIntegerOption((o) => o.setName('minimum_length').setDescription('Minimum message length for XP.').setMinValue(1).setMaxValue(500).setRequired(false))
      .addChannelOption((o) => o.setName('level_up_channel').setDescription('Channel for level-up announcements.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addStringOption((o) => o.setName('level_up_message').setDescription('Supports {user}, {username}, {level}, {roles}, and {server}.').setMaxLength(1500).setRequired(false))
      .addStringOption((o) => o.setName('level_up_mode').setDescription('Choose which level-ups are announced.').setRequired(false).addChoices(
        { name: 'Announce every level', value: 'ALL_LEVELS' },
        { name: 'Only announce levels with role rewards', value: 'ROLE_REWARDS_ONLY' }
      )))
    .addSubcommand((sub) => sub.setName('rank').setDescription('View a user’s XP rank.').addUserOption((o) => o.setName('user').setDescription('User to view. Defaults to you.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the top XP users.'))
    .addSubcommand((sub) => sub.setName('role-add').setDescription('Assign a role automatically at a level.')
      .addIntegerOption((o) => o.setName('level').setDescription('Required level.').setMinValue(1).setMaxValue(10000).setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to assign.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('role-remove').setDescription('Remove a level role reward.')
      .addIntegerOption((o) => o.setName('level').setDescription('Reward level.').setMinValue(1).setMaxValue(10000).setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Specific role to remove. Leave blank to remove all rewards at this level.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('multiplier-add').setDescription('Add or update an XP multiplier role.')
      .addRoleOption((o) => o.setName('role').setDescription('Role that receives multiplied message XP.').setRequired(true))
      .addNumberOption((o) => o.setName('multiplier').setDescription('XP multiplier, such as 1.5 or 2.').setMinValue(0.1).setMaxValue(100).setRequired(true)))
    .addSubcommand((sub) => sub.setName('multiplier-remove').setDescription('Remove an XP multiplier role.')
      .addRoleOption((o) => o.setName('role').setDescription('Multiplier role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('multiplier-list').setDescription('List configured XP multiplier roles.'))
    .addSubcommand((sub) => sub.setName('analyze').setDescription('Analyze the XP curve and export all levels to CSV.')
      .addIntegerOption((o) => o.setName('max_level').setDescription('Highest level to analyze. Defaults to 100.').setMinValue(1).setMaxValue(1000).setRequired(false))
      .addNumberOption((o) => o.setName('multiplier').setDescription('Optional multiplier to use in message estimates.').setMinValue(0.1).setMaxValue(100).setRequired(false)))
    .addSubcommand((sub) => sub.setName('ignored-channel-add').setDescription('Prevent XP in a channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel to ignore.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((sub) => sub.setName('ignored-channel-remove').setDescription('Allow XP in a previously ignored channel.').addChannelOption((o) => o.setName('channel').setDescription('Channel to remove from the ignore list.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((sub) => sub.setName('ignored-role-add').setDescription('Prevent XP for members with a role.').addRoleOption((o) => o.setName('role').setDescription('Role to ignore.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('ignored-role-remove').setDescription('Remove a role from the XP ignore list.').addRoleOption((o) => o.setName('role').setDescription('Role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('set-xp').setDescription('Set a user’s total XP.').addUserOption((o) => o.setName('user').setDescription('User to update.').setRequired(true)).addIntegerOption((o) => o.setName('xp').setDescription('New total XP.').setMinValue(0).setMaxValue(2147483647).setRequired(true)))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset a user’s XP profile.').addUserOption((o) => o.setName('user').setDescription('User to reset.').setRequired(true)).addBooleanOption((o) => o.setName('confirm').setDescription('Must be true to reset the profile.').setRequired(true))),
  moduleKey: ModuleKeys.LEVELING,
  actionKey: ActionKeys.LevelingView,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'rank' || sub === 'leaderboard') return ActionKeys.LevelingUse;
    if (sub === 'manager' || sub === 'multiplier-list' || sub === 'analyze') return ActionKeys.LevelingView;
    if (sub === 'set-xp' || sub === 'reset') return ActionKeys.LevelingAdjust;
    return ActionKeys.LevelingConfigure;
  },
  isPublic(interaction) {
    return ['rank', 'leaderboard'].includes(interaction.options.getSubcommand());
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'manager') return replyPrivate(interaction, await leveling.buildManagerPanel(interaction.guildId));

    if (sub === 'setup') {
      const config = await leveling.saveConfig(interaction.guildId, {
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        xpMin: interaction.options.getInteger('xp_min') ?? undefined,
        xpMax: interaction.options.getInteger('xp_max') ?? undefined,
        cooldownSeconds: interaction.options.getInteger('cooldown_seconds') ?? undefined,
        minimumMessageLength: interaction.options.getInteger('minimum_length') ?? undefined,
        levelUpChannelId: interaction.options.getChannel('level_up_channel')?.id,
        levelUpMessage: interaction.options.getString('level_up_message') ?? undefined,
        levelUpAnnounceMode: interaction.options.getString('level_up_mode') ?? undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'leveling-config', title: 'Leveling Config Updated', body: `Updated By: <@${interaction.user.id}>\nXP: **${config.xp_min}–${config.xp_max}**\nCooldown: **${config.cooldown_seconds}s**\nAnnouncements: **${config.level_up_announce_mode === 'ROLE_REWARDS_ONLY' ? 'Reward levels only' : 'All levels'}**`, actorUserId: interaction.user.id });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Leveling Configuration Saved', `Message XP is **${config.enabled ? 'enabled' : 'disabled'}**.\nXP Range: **${config.xp_min}–${config.xp_max}**\nCooldown: **${config.cooldown_seconds}s**\nAnnouncements: **${config.level_up_announce_mode === 'ROLE_REWARDS_ONLY' ? 'Reward levels only' : 'All levels'}**`)] });
    }

    if (sub === 'rank') {
      const user = interaction.options.getUser('user') || interaction.user;
      return replyPrivate(interaction, { embeds: [leveling.buildRankEmbed(user, await leveling.getRank(interaction.guildId, user.id))], deleteAfterSeconds: 15 });
    }
    if (sub === 'leaderboard') return replyPrivate(interaction, { embeds: [leveling.buildLeaderboardEmbed(await leveling.leaderboard(interaction.guildId, 10))], deleteAfterSeconds: 20 });

    if (sub === 'role-add') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      await leveling.addRoleReward(interaction.guildId, level, role.id);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'leveling-config', title: 'Level Role Added', body: `Level: **${level}**\nRole: ${role}\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Level Role Added', `${role} will be assigned at level **${level}**.`)] });
    }
    if (sub === 'role-remove') {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role');
      const removed = await leveling.removeRoleReward(interaction.guildId, level, role?.id || null);
      return replyPrivate(interaction, { embeds: [removed.length ? createSuccessEmbed('Level Role Removed', `Removed **${removed.length}** reward(s) at level **${level}**.`) : createWarningEmbed('No Reward Found', 'No matching active level-role reward was found.')] });
    }

    if (sub === 'multiplier-add') {
      const role = interaction.options.getRole('role', true);
      const multiplier = interaction.options.getNumber('multiplier', true);
      const saved = await leveling.addMultiplierRole(interaction.guildId, role.id, multiplier);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'leveling-config', title: 'XP Multiplier Role Saved', body: `Role: ${role}\nMultiplier: **${formatMultiplier(saved.multiplier)}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('XP Multiplier Saved', `${role} now earns **${formatMultiplier(saved.multiplier)} XP** per eligible message. If a user has multiple multiplier roles, the highest multiplier is used.`)] });
    }
    if (sub === 'multiplier-remove') {
      const role = interaction.options.getRole('role', true);
      const removed = await leveling.removeMultiplierRole(interaction.guildId, role.id);
      return replyPrivate(interaction, { embeds: [removed ? createSuccessEmbed('XP Multiplier Removed', `${role} no longer provides an XP multiplier.`) : createWarningEmbed('Multiplier Not Found', `${role} is not an active multiplier role.`)] });
    }
    if (sub === 'multiplier-list') {
      const multipliers = await leveling.listMultiplierRoles(interaction.guildId);
      return replyPrivate(interaction, { embeds: [createBaseEmbed({
        title: 'SlickBot XP Multiplier Roles',
        description: multipliers.length
          ? multipliers.map((item) => `<@&${item.role_id}> — **${formatMultiplier(item.multiplier)} XP**`).join('\n')
          : 'No XP multiplier roles are configured.',
        color: multipliers.length ? SlickBotColors.PRIMARY : SlickBotColors.WARNING
      })] });
    }

    if (sub === 'analyze') {
      const config = await leveling.getConfig(interaction.guildId) || await leveling.saveConfig(interaction.guildId, {});
      const maxLevel = interaction.options.getInteger('max_level') || 100;
      const multiplier = interaction.options.getNumber('multiplier') || 1;
      const analysis = leveling.buildXpAnalysis(config, maxLevel, multiplier);
      const csv = leveling.buildXpAnalysisCsv(analysis);
      const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `slickbot-xp-levels-1-${analysis.maxLevel}.csv` });
      return replyPrivate(interaction, { embeds: [leveling.buildXpAnalysisEmbed(analysis)], files: [attachment] });
    }

    if (sub === 'ignored-channel-add' || sub === 'ignored-channel-remove') {
      const channel = interaction.options.getChannel('channel', true);
      if (sub.endsWith('add')) await leveling.addIgnoredChannel(interaction.guildId, channel.id); else await leveling.removeIgnoredChannel(interaction.guildId, channel.id);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('XP Channel List Updated', `${channel} was ${sub.endsWith('add') ? 'added to' : 'removed from'} the ignored channel list.`)] });
    }
    if (sub === 'ignored-role-add' || sub === 'ignored-role-remove') {
      const role = interaction.options.getRole('role', true);
      if (sub.endsWith('add')) await leveling.addIgnoredRole(interaction.guildId, role.id); else await leveling.removeIgnoredRole(interaction.guildId, role.id);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('XP Role List Updated', `${role} was ${sub.endsWith('add') ? 'added to' : 'removed from'} the ignored role list.`)] });
    }

    if (sub === 'set-xp') {
      const user = interaction.options.getUser('user', true);
      const xp = interaction.options.getInteger('xp', true);
      const profile = await leveling.setXp(interaction.guildId, user, xp);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'leveling-adjustment', title: 'XP Adjusted', body: `User: <@${user.id}>\nXP: **${profile.xp}**\nLevel: **${profile.level}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('XP Updated', `${user} now has **${Number(profile.xp).toLocaleString()} XP** and is level **${profile.level}**.`)] });
    }

    if (sub === 'reset') {
      const user = interaction.options.getUser('user', true);
      if (!interaction.options.getBoolean('confirm', true)) return replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Required', 'Set `confirm` to true to reset this XP profile.')] });
      const removed = await leveling.resetProfile(interaction.guildId, user.id);
      return replyPrivate(interaction, { embeds: [removed ? createSuccessEmbed('XP Profile Reset', `Reset the leveling profile for ${user}.`) : createBaseEmbed({ title: 'No XP Profile Found', description: `${user} does not have a leveling profile.`, color: SlickBotColors.WARNING })] });
    }
  }
};
