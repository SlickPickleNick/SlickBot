const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../modules/ui/uiService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages with optional filters.')
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('Number of messages to delete (1–100).').setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Only delete messages sent by this user.').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('bots_only').setDescription('Only delete messages sent by bots.').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('humans_only').setDescription('Only delete messages sent by human members.').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('contains').setDescription('Only delete messages containing this text.').setRequired(false).setMaxLength(200)
    )
    .addBooleanOption((option) =>
      option.setName('has_attachment').setDescription('Only delete messages containing file attachments.').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('has_link').setDescription('Only delete messages containing links.').setRequired(false)
    )
    .addBooleanOption((option) =>
      option.setName('keep_pinned').setDescription('Keep pinned messages safe from deletion (default: true).').setRequired(false)
    ),
  actionKey: ActionKeys.UtilityPurge,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user', false);
    const botsOnly = interaction.options.getBoolean('bots_only', false) ?? false;
    const humansOnly = interaction.options.getBoolean('humans_only', false) ?? false;
    const contains = interaction.options.getString('contains', false);
    const hasAttachment = interaction.options.getBoolean('has_attachment', false) ?? false;
    const hasLink = interaction.options.getBoolean('has_link', false) ?? false;
    const keepPinned = interaction.options.getBoolean('keep_pinned', false) ?? true;

    if (botsOnly && humansOnly) {
      return replyPrivate(interaction, {
        embeds: [createWarningEmbed('Invalid Filter', 'You cannot select both `bots_only` and `humans_only`.')]
      });
    }

    // Defer ephemeral response
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await utility.purgeMessages(interaction.channel, {
        amount,
        targetUser,
        botsOnly,
        humansOnly,
        contains,
        hasAttachment,
        hasLink,
        keepPinned,
        actorUser: interaction.user,
        logger: ctx.logger
      });

      if (result.deletedCount === 0) {
        let note = 'No messages matched your filter criteria.';
        if (result.olderThan14Days) {
          note += '\n*(Note: Discord does not permit bulk deletion of messages older than 14 days.)*';
        }
        return interaction.editReply({
          embeds: [createWarningEmbed('No Messages Deleted', note)]
        });
      }

      const details = [`Deleted **${result.deletedCount}** / ${result.requested} requested message(s).`];
      if (result.olderThan14Days) {
        details.push('⚠️ Some messages could not be deleted because they are older than 14 days.');
      }

      return interaction.editReply({
        embeds: [createSuccessEmbed('🧹 Messages Purged', details.join('\n'))]
      });
    } catch (err) {
      return interaction.editReply({
        embeds: [createErrorEmbed('Purge Failed', err.message || 'Failed to delete messages.')]
      });
    }
  }
};
