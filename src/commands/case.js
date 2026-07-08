const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ModerationService, formatCaseLine } = require('../modules/moderation/moderationService');
const { buildCaseEmbed, buildRecentCasesPanel } = require('../modules/moderation/moderationUi');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { truncate } = require('../utils/format');

const moderation = new ModerationService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('View and manage SlickBot moderation cases.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('View recent moderation cases.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View a moderation case by case number.')
        .addIntegerOption((option) => option.setName('case_number').setDescription('Case number.').setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('View recent cases for a user.')
        .addUserOption((option) => option.setName('user').setDescription('User to look up.').setRequired(true))
        .addIntegerOption((option) => option.setName('limit').setDescription('Number of cases to show.').setRequired(false).setMinValue(1).setMaxValue(20))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('close')
        .setDescription('Close a moderation case.')
        .addIntegerOption((option) => option.setName('case_number').setDescription('Case number.').setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName('note').setDescription('Optional close note.').setRequired(false).setMaxLength(500))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reopen')
        .setDescription('Reopen a moderation case.')
        .addIntegerOption((option) => option.setName('case_number').setDescription('Case number.').setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName('note').setDescription('Optional reopen note.').setRequired(false).setMaxLength(500))
    ),
  actionKey: ActionKeys.CasesView,
  moduleKey: ModuleKeys.MODERATION,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'close' || subcommand === 'reopen') return ActionKeys.CasesManage;
    return ActionKeys.CasesView;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'panel') {
      await replyPrivate(interaction, await buildRecentCasesPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'view') {
      const caseNumber = interaction.options.getInteger('case_number', true);
      const caseRecord = await moderation.getCase(interaction.guildId, caseNumber);
      if (!caseRecord) {
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Case Not Found', description: `No case found for #${caseNumber}.`, color: SlickBotColors.WARNING })] });
        return;
      }

      await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord)] });
      return;
    }

    if (subcommand === 'user') {
      const target = interaction.options.getUser('user', true);
      const limit = interaction.options.getInteger('limit') || 10;
      const cases = await moderation.listUserCases(interaction.guildId, target.id, limit);
      const description = cases.length
        ? truncate(cases.map(formatCaseLine).join('\n\n'), 3500)
        : 'No moderation cases found for this user.';

      await replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: `Cases • ${target.tag}`,
          description,
          color: SlickBotColors.INFO
        })]
      });
      return;
    }

    if (subcommand === 'close' || subcommand === 'reopen') {
      const caseNumber = interaction.options.getInteger('case_number', true);
      const note = interaction.options.getString('note', false);
      const status = subcommand === 'close' ? 'CLOSED' : 'OPEN';
      const caseRecord = await moderation.updateCaseStatus(interaction.guildId, caseNumber, status, interaction.user.id, note);

      if (!caseRecord) {
        await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Case Not Found', description: `No case found for #${caseNumber}.`, color: SlickBotColors.WARNING })] });
        return;
      }

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.CasesManage,
        targetType: 'ModerationCase',
        targetId: String(caseNumber),
        summary: `Case #${caseNumber} marked ${status}.`,
        metadata: { note }
      });

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'cases',
        title: `Case #${caseNumber} ${status}`,
        body: [
          `Updated By: <@${interaction.user.id}>`,
          `Target: <@${caseRecord.target_user_id}>`,
          note ? `Note: ${note}` : null
        ].filter(Boolean).join('\n'),
        metadata: { caseNumber, status, actorUserId: interaction.user.id, note }
      });

      await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, `Case #${caseNumber} Updated`)] });
    }
  }
};
