const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate, replyPublic } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { ReferralService } = require('../modules/community/referralService');

const referrals = new ReferralService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('referral')
    .setDescription('Submit and manage server referrals.')
    .addSubcommand((sub) => sub
      .setName('submit')
      .setDescription('Record who referred you to this server. One time only.')
      .addUserOption((option) => option.setName('user').setDescription('The member who referred you.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('leaderboard')
      .setDescription('View the lifetime referral leaderboard.'))
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('View referral status for yourself or another member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to check. Defaults to you.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('manager')
      .setDescription('Open the Referrals manager.'))
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure referral XP and enabled state.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable referrals.').setRequired(false))
      .addIntegerOption((option) => option.setName('bonus_xp').setDescription('XP awarded to the referring member.').setMinValue(0).setMaxValue(100000).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('set')
      .setDescription('Staff: retroactively set a member’s one-time referral.')
      .addUserOption((option) => option.setName('user').setDescription('The member being referred.').setRequired(true))
      .addUserOption((option) => option.setName('referrer').setDescription('The member who referred them.').setRequired(true))
      .addBooleanOption((option) => option.setName('award_xp').setDescription('Award the configured referral XP. Default: true.').setRequired(false))),
  moduleKey: ModuleKeys.REFERRALS,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'submit') return ActionKeys.ReferralsSubmit;
    if (sub === 'leaderboard' || sub === 'status') return ActionKeys.ReferralsView;
    if (sub === 'set') return ActionKeys.ReferralsManage;
    if (sub === 'manager') return ActionKeys.ReferralsManage;
    return ActionKeys.ReferralsConfigure;
  },
  isPublic(interaction) {
    return ['submit', 'leaderboard', 'status'].includes(interaction.options.getSubcommand());
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const config = await referrals.setup(interaction.guildId, {
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        referralXp: interaction.options.getInteger('bonus_xp') ?? undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'referral-config', title: 'Referrals Configured', body: `Updated By: <@${interaction.user.id}>\nStatus: **${config.enabled === false ? 'Disabled' : 'Enabled'}**\nBonus XP: **${config.referral_xp}**`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Referrals Configured', `Referrals are **${config.enabled === false ? 'disabled' : 'enabled'}**.\nReferral bonus: **${config.referral_xp} XP**.`)] });
    }

    if (sub === 'manager') return replyPrivate(interaction, await referrals.buildManagerPanel(interaction.guildId));

    if (sub === 'leaderboard') return replyPrivate(interaction, { embeds: [referrals.buildLeaderboardEmbed(await referrals.leaderboard(interaction.guildId, 10))], deleteAfterSeconds: 20 });

    if (sub === 'status') {
      const user = interaction.options.getUser('user') || interaction.user;
      const referral = await referrals.getReferralForUser(interaction.guildId, user.id);
      return replyPrivate(interaction, { embeds: [referrals.buildReferralStatusEmbed(user, referral)], deleteAfterSeconds: 20 });
    }

    if (sub === 'submit') {
      const referrer = interaction.options.getUser('user', true);
      const result = await referrals.submitReferral({ guild: interaction.guild, refereeUser: interaction.user, referrerUser: referrer, actorUser: interaction.user, logger: ctx.logger, source: 'SELF_SUBMIT' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Referral Not Recorded', result.reason)], deleteAfterSeconds: 15 });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Referral Recorded', `<@${referrer.id}> was recorded as your referrer. They earned **${result.xpResult.awarded ? result.xpResult.gained : 0} XP**.`)], deleteAfterSeconds: 15 });
    }

    if (sub === 'set') {
      const user = interaction.options.getUser('user', true);
      const referrer = interaction.options.getUser('referrer', true);
      const result = await referrals.submitReferral({ guild: interaction.guild, refereeUser: user, referrerUser: referrer, actorUser: interaction.user, logger: ctx.logger, awardXp: interaction.options.getBoolean('award_xp') ?? true, source: 'STAFF_SET' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Referral Not Set', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Referral Set', `<@${referrer.id}> was recorded as the referrer for <@${user.id}>. XP awarded: **${result.xpResult.awarded ? result.xpResult.gained : 0}**.`)] });
    }

    return replyPublic(interaction, { embeds: [createWarningEmbed('Unsupported Referral Action', 'This referral command is not available.')] });
  }
};
