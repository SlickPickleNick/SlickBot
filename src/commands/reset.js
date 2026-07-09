const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset SlickBot server data and configuration. Server owner only.'),
  actionKey: ActionKeys.ServerReset,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction) {
    if (!interaction.guild || interaction.guild.ownerId !== interaction.user.id) {
      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: 'Server Owner Required',
          description: 'Only the Discord server owner can reset SlickBot to a fresh install state.',
          color: SlickBotColors.ERROR
        })]
      });
    }

    const embed = createBaseEmbed({
      title: 'Confirm SlickBot Reset',
      description: [
        'This will delete SlickBot data for this server, including:',
        '',
        '• Module settings',
        '• Logging settings',
        '• Permission teams and command permissions',
        '• Tickets, ticket types, transcripts references, reports, applications, appeals',
        '• Moderation cases and user notes',
        '',
        '**This cannot be undone from Discord.**'
      ].join('\n'),
      color: SlickBotColors.ERROR,
      footer: 'Server owner confirmation required'
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CustomIds.ResetConfirm).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
      new ButtonBuilder().setCustomId(CustomIds.ResetCancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    return replyPrivate(interaction, { embeds: [embed], components: [row] });
  }
};
