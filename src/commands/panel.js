const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { buildPanelDesignModal } = require('../modules/panels/panelModals');
const { startPanelMessageFlow, startPanelFieldEditFlow } = require('../modules/panels/messagePanelFlow');
const { deletePublishedPanelsForRefs } = require('../modules/panels/publishedPanelService');
const rolePanels = require('../modules/community/rolePanelService');
const { ApplicationService } = require('../modules/support/supportService');

const applications = new ApplicationService();

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
        .setName('delete')
        .setDescription('Delete or unpost a configured panel by name/reference.')
        .addStringOption(addPanelTargetChoices)
        .addBooleanOption((option) => option.setName('confirm').setDescription('Required. Set true to confirm deleting/unposting.').setRequired(true))
        .addStringOption((option) => option.setName('name').setDescription('Panel name/reference. Required for application and reaction-role panels.').setRequired(false).setMaxLength(80))
        .addBooleanOption((option) => option.setName('delete_messages').setDescription('Also delete tracked posted panel messages.').setRequired(false))
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

    if (subcommand === 'delete') {
      const confirm = interaction.options.getBoolean('confirm', true);
      const deleteMessages = interaction.options.getBoolean('delete_messages') ?? false;
      if (!confirm) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Delete Not Confirmed', 'Run the command again with `confirm:true` to delete/unpost this panel.')] });
      }

      let refs = ['*'];
      let label = target;
      if (target === 'role') {
        if (!name.trim()) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Name Required', 'Reaction-role panel deletion requires the `name` option.')] });
        const panel = await rolePanels.getPanelByName(interaction.guildId, name);
        if (!panel) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Found', `No active reaction-role panel named **${name}** was found.`)] });
        await rolePanels.deletePanel(interaction.guildId, panel.name);
        refs = [panel.id, panel.name, name];
        label = `Role Panel: ${panel.name}`;
      } else if (target === 'application') {
        if (!name.trim()) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Name Required', 'Application panel deletion requires the `name` option.')] });
        const type = await applications.getTypeByName(interaction.guildId, name);
        if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Found', `No application type named **${name}** was found.`)] });
        await applications.deleteType(interaction.guildId, name);
        refs = [type.id, type.name, name];
        label = `Application Panel: ${type.name}`;
      } else {
        refs = ['*'];
        label = `${target.charAt(0).toUpperCase()}${target.slice(1)} Panel`;
      }

      const deleted = await deletePublishedPanelsForRefs(ctx.client || interaction.client, {
        guildId: interaction.guildId,
        panelType: target,
        panelRefs: refs,
        deleteMessages
      }).catch(() => ({ total: 0, deleted: 0, deactivated: 0 }));

      await ctx?.logger?.log({
        guildId: interaction.guildId,
        eventKey: 'panel-config',
        title: 'Panel Deleted',
        body: `Panel: **${label}**
Delete Messages: **${deleteMessages ? 'Yes' : 'No'}**
Tracked Posts: **${deleted.total || 0}**`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Panel Deleted', `Deleted/unposted **${label}**. Tracked posts affected: **${deleted.total || 0}**${deleteMessages ? `, messages deleted: **${deleted.deleted || 0}**` : ''}.`)] });
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
