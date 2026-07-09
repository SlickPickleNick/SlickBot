const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { buildPanelDesignModal } = require('../modules/panels/panelModals');
const { startPanelMessageFlow, startPanelFieldEditFlow } = require('../modules/panels/messagePanelFlow');

function addPanelTargetChoices(option) {
  return option.setName('target').setDescription('Panel system to edit.').setRequired(true).addChoices(
    { name: 'Tickets', value: 'ticket' },
    { name: 'Reports', value: 'report' },
    { name: 'Applications', value: 'application' },
    { name: 'Appeals', value: 'appeal' },
    { name: 'Birthdays', value: 'birthday' },
    { name: 'Reaction Roles', value: 'role' }
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Customize public SlickBot panel embeds with multiline descriptions.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Start a guided message-based setup for a public panel embed.')
        .addStringOption(addPanelTargetChoices)
        .addStringOption((option) => option.setName('name').setDescription('Required for application types or reaction-role panels.').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit one specific live panel field without wiping the rest.')
        .addStringOption(addPanelTargetChoices)
        .addStringOption((option) => option.setName('field').setDescription('Specific panel field to edit.').setRequired(true).addChoices(
          { name: 'Title', value: 'title' },
          { name: 'Description', value: 'description' },
          { name: 'Accent Color', value: 'color' },
          { name: 'Display Mode', value: 'display_mode' }
        ))
        .addStringOption((option) => option.setName('name').setDescription('Required for application types or reaction-role panels.').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('design')
        .setDescription('Open a modal to customize a public panel embed.')
        .addStringOption(addPanelTargetChoices)
        .addStringOption((option) => option.setName('name').setDescription('Required for application types or reaction-role panels.').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) => subcommand.setName('help').setDescription('Show panel design help.')),
  moduleKey: ModuleKeys.PERMISSIONS,
  getActionKey() { return ActionKeys.PanelsConfigure; },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'help') {
      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: 'SlickBot Panel Designer',
          description: [
            'Use `/panel setup` for guided message-based panel design in a setup channel.',
            'Use `/panel edit` to change one specific field without touching the other fields.',
            '',
            '**Supported targets**',
            '• Tickets',
            '• Reports',
            '• Applications, requires the application type name',
            '• Appeals',
            '• Birthdays',
            '• Reaction Roles, requires the role panel name',
            '',
            'Guided setup preserves multiline descriptions, spacing, and custom accent colors such as `#7869ff`.',
            '',
            '`/panel design` still exists as a quick modal editor, but `/panel setup` and `/panel edit` are recommended for formatted panels.'
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

    if (subcommand === 'setup') {
      return startPanelMessageFlow(interaction, { target, name, logger: ctx?.logger });
    }

    if (subcommand === 'edit') {
      return startPanelFieldEditFlow(interaction, { target, name, field: interaction.options.getString('field', true), logger: ctx?.logger });
    }

    await interaction.showModal(buildPanelDesignModal(target, name));
  }
};
