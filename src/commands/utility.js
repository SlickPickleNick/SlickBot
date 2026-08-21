const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');
const { buildUtilityManagerPanel, buildUtilitySetupModal } = require('../modules/utility/utilityUi');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { query } = require('../services/db');
const { CustomIds } = require('../modules/ui/customIds');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('utility')
    .setDescription('Utility and server essentials configuration.')
    .addSubcommand((subcommand) =>
      subcommand.setName('manager').setDescription('Open the utility module control panel.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure utility module settings.')
        .addChannelOption((option) =>
          option.setName('default_poll_channel').setDescription('Default channel for polls.').setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('max_reminders').setDescription('Max active reminders per user (1–50).').setRequired(false).setMinValue(1).setMaxValue(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('reset').setDescription('Reset utility settings and active data (Owner only).')
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'reset') return ActionKeys.UtilityReset;
    if (sub === 'setup') return ActionKeys.UtilityManage;
    return ActionKeys.UtilityView;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    if (sub === 'manager') {
      const panel = await buildUtilityManagerPanel(interaction.guildId);
      return replyPrivate(interaction, panel);
    }

    if (sub === 'setup') {
      const defaultPollChannel = interaction.options.getChannel('default_poll_channel', false);
      const maxReminders = interaction.options.getInteger('max_reminders', false);

      const updates = {};
      if (defaultPollChannel) updates.default_poll_channel_id = defaultPollChannel.id;
      if (maxReminders !== null) updates.max_reminders_per_user = maxReminders;

      if (Object.keys(updates).length > 0) {
        await utility.upsertConfig(interaction.guildId, updates);
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed('Utility Settings Updated', 'Your utility settings have been updated successfully.')]
        });
      }

      const panel = await buildUtilityManagerPanel(interaction.guildId);
      return replyPrivate(interaction, panel);
    }

    if (sub === 'reset') {
      const isOwner = interaction.guild?.ownerId === interaction.user.id || (await ctx.permissions.isBotAdmin(interaction.user.id));
      if (!isOwner) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Access Denied', 'Only the server owner or bot admin can reset the utility module.')]
        });
      }

      const embed = createBaseEmbed({
        title: '⚠️ Confirm Utility Reset',
        description: 'Are you sure you want to reset the Utility module? This will clear all active polls, pending reminders, and AFK records for this server.',
        color: SlickBotColors.WARNING
      });

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.UtilityResetConfirmPrefix}${interaction.guildId}`)
          .setLabel('Confirm Reset')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.UtilityResetCancelPrefix}${interaction.guildId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return replyPrivate(interaction, { embeds: [embed], components: [row] });
    }
  }
};
