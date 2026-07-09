const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { buildPanelDesignModal } = require('../modules/panels/panelModals');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Customize public SlickBot panel embeds with multiline descriptions.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('design')
        .setDescription('Open a modal to customize a public panel embed.')
        .addStringOption((option) => option.setName('target').setDescription('Panel system to edit.').setRequired(true).addChoices(
          { name: 'Tickets', value: 'ticket' },
          { name: 'Reports', value: 'report' },
          { name: 'Applications', value: 'application' },
          { name: 'Appeals', value: 'appeal' },
          { name: 'Reaction Roles', value: 'role' }
        ))
        .addStringOption((option) => option.setName('name').setDescription('Required for application types or reaction-role panels.').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) => subcommand.setName('help').setDescription('Show panel design help.')),
  moduleKey: ModuleKeys.PERMISSIONS,
  getActionKey() { return ActionKeys.PanelsConfigure; },
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'help') {
      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: 'SlickBot Panel Designer',
          description: [
            'Use `/panel design` to open a modal-based editor for public panel embeds.',
            '',
            '**Supported targets**',
            '• Tickets',
            '• Reports',
            '• Applications, requires the application type name',
            '• Appeals',
            '• Reaction Roles, requires the role panel name',
            '',
            'The modal supports multiline descriptions, spacing, and custom accent colors such as `#7869ff`.'
          ].join('\n'),
          color: SlickBotColors.PRIMARY
        })]
      });
    }

    const target = interaction.options.getString('target', true);
    const name = interaction.options.getString('name') || '';
    if ((target === 'application' || target === 'role') && !name.trim()) {
      return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Name Required', 'Application and reaction-role panels require the `name` option so SlickBot knows which template to edit.')] });
    }
    await interaction.showModal(buildPanelDesignModal(target, name));
  }
};
