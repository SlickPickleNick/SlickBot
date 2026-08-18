const { SlashCommandBuilder, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate, replyPublic } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');
const {
  AchievementService,
  achievementChoiceList,
  tieredAchievementChoiceList,
  oneTimeAchievementChoiceList,
  normalizeAchievementKey,
  DEFAULT_UNLOCK_MESSAGE
} = require('../modules/community/achievementService');

const achievements = new AchievementService();

const achievementChoices = achievementChoiceList();
const tieredAchievementChoices = tieredAchievementChoiceList();
const oneTimeAchievementChoices = oneTimeAchievementChoiceList();

function addAchievementChoiceOption(option) {
  return option
    .setName('achievement')
    .setDescription('Achievement to review or configure.')
    .setRequired(true)
    .addChoices(...achievementChoices);
}

function addTieredAchievementChoiceOption(option) {
  return option
    .setName('achievement')
    .setDescription('Tiered achievement to configure.')
    .setRequired(true)
    .addChoices(...tieredAchievementChoices);
}

function addOneTimeAchievementChoiceOption(option) {
  return option
    .setName('achievement')
    .setDescription('One-time achievement to configure.')
    .setRequired(true)
    .addChoices(...oneTimeAchievementChoices);
}

function resetToken(scope, targetId, actorId) {
  return `${scope}:${targetId || 'server'}:${actorId}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('View and configure server achievements.')
    .addSubcommand((sub) => sub
      .setName('profile')
      .setDescription('View your achievement profile or another member’s profile.')
      .addUserOption((option) => option.setName('user').setDescription('Member to view. Defaults to you.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('View available server achievements and tiers.'))
    .addSubcommand((sub) => sub
      .setName('leaderboard')
      .setDescription('View a leaderboard for one achievement stat.')
      .addStringOption(addTieredAchievementChoiceOption))
    .addSubcommand((sub) => sub
      .setName('manager')
      .setDescription('Open the Achievements manager panel.'))
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure achievement tracking and announcements.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable achievements.').setRequired(false))
      .addChannelOption((option) => option.setName('announcement_channel').setDescription('Channel for achievement unlock announcements.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addChannelOption((option) => option.setName('afk_channel').setDescription('Optional voice channel to exclude from voice time.').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice).setRequired(false))
      .addBooleanOption((option) => option.setName('clear_afk_channel').setDescription('Clear the configured AFK voice exclusion channel.').setRequired(false))
      .addStringOption((option) => option.setName('unlock_message').setDescription('Custom unlock message. Supports {user}, {achievement}, {tier}, {level}, {threshold}, {reward_xp}.').setMaxLength(1500).setRequired(false))
      .addStringOption((option) => option.setName('unlock_image_url').setDescription('Optional image URL for unlock announcements.').setMaxLength(1800).setRequired(false))
      .addBooleanOption((option) => option.setName('clear_image').setDescription('Clear the configured unlock image.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('tier-set')
      .setDescription('Create or update an achievement tier.')
      .addStringOption(addTieredAchievementChoiceOption)
      .addIntegerOption((option) => option.setName('level').setDescription('Standard tier: 1 Bronze, 2 Silver, 3 Gold, 4 Diamond.').setMinValue(1).setMaxValue(4).setRequired(true))
      .addIntegerOption((option) => option.setName('threshold').setDescription('Required stat value for this tier.').setMinValue(1).setRequired(true))
      .addIntegerOption((option) => option.setName('xp').setDescription('XP reward for this tier.').setMinValue(0).setMaxValue(100000).setRequired(false))
      .addRoleOption((option) => option.setName('role').setDescription('Optional role reward for this tier.').setRequired(false))
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable this tier.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('tier-remove')
      .setDescription('Remove an achievement tier.')
      .addStringOption(addTieredAchievementChoiceOption)
      .addIntegerOption((option) => option.setName('level').setDescription('Standard tier: 1 Bronze, 2 Silver, 3 Gold, 4 Diamond.').setMinValue(1).setMaxValue(4).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('rename')
      .setDescription('Rename or describe an achievement category.')
      .addStringOption(addAchievementChoiceOption)
      .addStringOption((option) => option.setName('name').setDescription('New achievement display name.').setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Optional updated description.').setMaxLength(500).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('one-time-config')
      .setDescription('Configure one-time achievements like Server Booster or Happy Birthday.')
      .addStringOption(addOneTimeAchievementChoiceOption)
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable this one-time achievement.').setRequired(false))
      .addBooleanOption((option) => option.setName('remove_when_lost').setDescription('Remove the achievement if the boost/birthday condition ends.').setRequired(false))
      .addIntegerOption((option) => option.setName('xp').setDescription('XP reward for unlocking this achievement.').setMinValue(0).setMaxValue(100000).setRequired(false))
      .addRoleOption((option) => option.setName('role').setDescription('Optional role reward for this one-time achievement.').setRequired(false)))
    .addSubcommandGroup((group) => group
      .setName('ignored-channel')
      .setDescription('Manage message channels ignored by achievement message stats.')
      .addSubcommand((sub) => sub
        .setName('add')
        .setDescription('Ignore a channel for message-count achievements.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to ignore.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum).setRequired(true)))
      .addSubcommand((sub) => sub
        .setName('remove')
        .setDescription('Stop ignoring a channel for message-count achievements.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to remove.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum).setRequired(true)))
      .addSubcommand((sub) => sub
        .setName('list')
        .setDescription('List ignored message-stat channels.')))
    .addSubcommand((sub) => sub
      .setName('reset')
      .setDescription('Reset achievement data for testing.')
      .addStringOption((option) => option
        .setName('scope')
        .setDescription('Reset one user or the full server setup/data.')
        .setRequired(true)
        .addChoices(
          { name: 'User', value: 'user' },
          { name: 'Server', value: 'server' }
        ))
      .addUserOption((option) => option.setName('user').setDescription('Required when resetting one user.').setRequired(false))),
  moduleKey: ModuleKeys.ACHIEVEMENTS,
  getActionKey(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (['profile', 'list', 'leaderboard'].includes(sub)) return ActionKeys.AchievementsUse;
    if (sub === 'manager') return ActionKeys.AchievementsView;
    if (sub === 'reset') return ActionKeys.AchievementsReset;
    if (group === 'ignored-channel' || ['setup', 'tier-set', 'tier-remove', 'rename', 'one-time-config'].includes(sub)) return ActionKeys.AchievementsConfigure;
    return ActionKeys.AchievementsView;
  },
  isPublic(interaction) {
    return ['profile', 'list', 'leaderboard'].includes(interaction.options.getSubcommand());
  },
  async execute(interaction, ctx) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (sub === 'profile') {
      const user = interaction.options.getUser('user') || interaction.user;
      return replyPublic(interaction, await achievements.buildProfilePayload(interaction.guild, user));
    }

    if (sub === 'list') {
      return replyPrivate(interaction, { embeds: [await achievements.buildListEmbed(interaction.guildId)], deleteAfterSeconds: 30 });
    }

    if (sub === 'leaderboard') {
      const key = normalizeAchievementKey(interaction.options.getString('achievement', true));
      return replyPublic(interaction, { embeds: [await achievements.buildLeaderboardEmbed(interaction.guildId, key, 10)] });
    }

    if (sub === 'manager') {
      return replyPrivate(interaction, await achievements.buildManagerPanel(interaction.guildId));
    }

    if (sub === 'setup') {
      const config = await achievements.setup(interaction.guildId, {
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        announcementChannelId: interaction.options.getChannel('announcement_channel')?.id,
        afkChannelId: interaction.options.getChannel('afk_channel')?.id,
        clearAfkChannel: interaction.options.getBoolean('clear_afk_channel') === true,
        unlockMessage: interaction.options.getString('unlock_message') ?? undefined,
        unlockImageUrl: interaction.options.getString('unlock_image_url') ?? undefined,
        clearImage: interaction.options.getBoolean('clear_image') === true
      });
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'achievement-config',
        title: 'Achievements Configured',
        body: `Updated By: <@${interaction.user.id}>\nStatus: **${config.enabled === false ? 'Disabled' : 'Enabled'}**`,
        actorUserId: interaction.user.id
      }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Achievements Configured', `Achievements are **${config.enabled === false ? 'disabled' : 'enabled'}**.\nAnnouncement Channel: ${config.announcement_channel_id ? `<#${config.announcement_channel_id}>` : 'Not configured'}\nAFK Channel Exclusion: ${config.afk_channel_id ? `<#${config.afk_channel_id}>` : 'Not configured'}`)] });
    }

    if (sub === 'tier-set') {
      const tier = await achievements.setTier({
        guildId: interaction.guildId,
        achievementKey: interaction.options.getString('achievement', true),
        level: interaction.options.getInteger('level', true),
        threshold: interaction.options.getInteger('threshold', true),
        xpReward: interaction.options.getInteger('xp') ?? undefined,
        roleRewardId: interaction.options.getRole('role')?.id,
        enabled: interaction.options.getBoolean('enabled') ?? true
      });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Achievement Tier Saved', `Saved **${tier.achievement_key} ${tier.tier_name || `Tier ${tier.tier_level}`}**.\nThreshold: **${tier.threshold_value}**\nXP: **${tier.xp_reward || 0}**${tier.role_reward_id ? `\nRole: <@&${tier.role_reward_id}>` : ''}`)] });
    }

    if (sub === 'tier-remove') {
      const ok = await achievements.removeTier({
        guildId: interaction.guildId,
        achievementKey: interaction.options.getString('achievement', true),
        level: interaction.options.getInteger('level', true)
      });
      return replyPrivate(interaction, { embeds: [ok ? createSuccessEmbed('Achievement Tier Removed', 'The selected tier was removed.') : createWarningEmbed('Tier Not Found', 'No matching tier was found.')] });
    }

    if (sub === 'rename') {
      const definition = await achievements.renameAchievement({
        guildId: interaction.guildId,
        achievementKey: interaction.options.getString('achievement', true),
        name: interaction.options.getString('name', true),
        description: interaction.options.getString('description') ?? undefined
      });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Achievement Renamed', `Updated **${definition.name}**.`)] });
    }

    if (sub === 'one-time-config') {
      const definition = await achievements.configureOneTimeAchievement({
        guildId: interaction.guildId,
        achievementKey: interaction.options.getString('achievement', true),
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        removeWhenLost: interaction.options.getBoolean('remove_when_lost') ?? undefined,
        xpReward: interaction.options.getInteger('xp') ?? undefined,
        roleRewardId: interaction.options.getRole('role')?.id
      });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('One-Time Achievement Configured', [
        `Achievement: **${definition.name}**`,
        `Status: **${definition.enabled === false ? 'Disabled' : 'Enabled'}**`,
        `XP: **${definition.one_time_xp_reward || 0}**`,
        definition.one_time_role_reward_id ? `Role: <@&${definition.one_time_role_reward_id}>` : 'Role: Not configured',
        `Remove if condition ends: **${definition.remove_when_condition_ends ? 'Yes' : 'No'}**`
      ].join('\n'))] });
    }

    if (group === 'ignored-channel') {
      const channel = interaction.options.getChannel('channel');
      if (sub === 'add') {
        await achievements.addIgnoredChannel(interaction.guildId, channel.id);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ignored Channel Added', `${channel} will no longer count toward message achievements.`)] });
      }
      if (sub === 'remove') {
        await achievements.removeIgnoredChannel(interaction.guildId, channel.id);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ignored Channel Removed', `${channel} can now count toward message achievements.`)] });
      }
      const ignored = await achievements.listIgnoredChannels(interaction.guildId);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ignored Message Channels', ignored.length ? ignored.map((id) => `<#${id}>`).join('\n') : 'No channels are ignored.')] });
    }

    if (sub === 'reset') {
      const scope = interaction.options.getString('scope', true);
      const user = interaction.options.getUser('user');
      if (scope === 'user' && !user) return replyPrivate(interaction, { embeds: [createWarningEmbed('User Required', 'Select a user when resetting user achievement data.')], deleteAfterSeconds: 15 });
      const token = resetToken(scope, scope === 'user' ? user.id : null, interaction.user.id);
      const embed = createWarningEmbed(
        'Confirm Achievement Reset',
        scope === 'server'
          ? 'This will clear all achievement setup, tiers, tracked stats, unlocks, ignored channels, and active voice sessions for this server. Existing Discord messages are not deleted.'
          : `This will clear achievement stats, unlock history, and active voice tracking for <@${user.id}>.`
      );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CustomIds.AchievementsResetConfirmPrefix}${token}`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`${CustomIds.AchievementsResetCancelPrefix}${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      return replyPrivate(interaction, { embeds: [embed], components: [row] });
    }

    return replyPrivate(interaction, { embeds: [createWarningEmbed('Unknown Achievement Action', 'That achievement action was not recognized.')], deleteAfterSeconds: 10 });
  }
};
