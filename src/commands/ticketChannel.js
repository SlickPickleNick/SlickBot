const { TicketService } = require('../modules/support/channelTicketService');
require('../modules/support/channelSupportUi');
const originalTicketCommand = require('./ticket');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed } = require('../modules/ui/uiService');
const { refreshPublishedPanel, formatRefreshSummary } = require('../modules/panels/panelUpdateService');

const tickets = new TicketService();
const removedOptionNames = new Set(['ticket_mode', 'thread_host']);

// Keep the existing ticket command surface, but remove the discontinued thread
// configuration options before slash commands are deployed.
for (const subcommand of originalTicketCommand.data.options || []) {
  const name = subcommand.name || subcommand.toJSON?.().name;
  if (!['setup', 'type-setup'].includes(name) || !Array.isArray(subcommand.options)) continue;

  for (let index = subcommand.options.length - 1; index >= 0; index -= 1) {
    const option = subcommand.options[index];
    const optionName = option.name || option.toJSON?.().name;
    if (removedOptionNames.has(optionName)) subcommand.options.splice(index, 1);
  }
}

async function handleDefaultSetup(interaction, ctx) {
  const config = await tickets.updateConfig(interaction.guildId, {
    categoryId: interaction.options.getChannel('category')?.id || null,
    logChannelId: interaction.options.getChannel('log_channel')?.id || null,
    staffRoleId: interaction.options.getRole('staff_role')?.id || null,
    staffTeamName: interaction.options.getString('staff_team') || null,
    escalatedRoleId: interaction.options.getRole('escalated_role')?.id || null,
    escalatedTeamName: interaction.options.getString('escalated_team') || null,
    ticketLimit: interaction.options.getInteger('ticket_limit') || null,
    transcriptEnabled: interaction.options.getBoolean('transcripts'),
    namingFormat: interaction.options.getString('naming_format') || null,
    closeDeleteSeconds: interaction.options.getInteger('delete_seconds') || null,
    panelTitle: interaction.options.getString('panel_title') || null,
    panelDescription: interaction.options.getString('panel_description') || null,
    panelColor: interaction.options.getString('panel_color') || null,
    panelDisplayMode: interaction.options.getString('display_mode') || null
  });

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'setup',
    title: 'Ticket Settings Updated',
    body: `Ticket settings updated by ${interaction.user.tag}.`,
    actorUserId: interaction.user.id
  }).catch(() => {});

  const refresh = await refreshPublishedPanel(
    ctx.client,
    interaction.guildId,
    'ticket',
    '*'
  ).catch(() => null);

  return replyPrivate(interaction, {
    embeds: [createSuccessEmbed(
      'Ticket Defaults Configured',
      [
        `Category: ${config.category_id ? `<#${config.category_id}>` : 'Not set'}`,
        `Assignment Role: ${config.staff_role_id ? `<@&${config.staff_role_id}>` : 'Not set'}`,
        `Assignment Team: ${config.staff_team_id ? 'Configured' : 'Not set'}`,
        `Escalation Role: ${config.escalated_role_id ? `<@&${config.escalated_role_id}>` : 'Not set'}`,
        `Escalation Team: ${config.escalated_team_id ? 'Configured' : 'Not set'}`,
        `Log Channel: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`,
        `Naming: \`${config.naming_format}\``,
        formatRefreshSummary(refresh)
      ].filter(Boolean).join('\n')
    )]
  });
}

async function handleTypeSetup(interaction, ctx) {
  const type = await tickets.setupType(interaction.guildId, {
    name: interaction.options.getString('name', true),
    label: interaction.options.getString('label') || null,
    categoryId: interaction.options.getChannel('category')?.id || null,
    logChannelId: interaction.options.getChannel('log_channel')?.id || null,
    staffRoleId: interaction.options.getRole('staff_role')?.id || null,
    staffTeamName: interaction.options.getString('staff_team') || null,
    escalatedRoleId: interaction.options.getRole('escalated_role')?.id || null,
    escalatedTeamName: interaction.options.getString('escalated_team') || null,
    ticketLimit: interaction.options.getInteger('ticket_limit') || null,
    transcriptEnabled: interaction.options.getBoolean('transcripts'),
    namingFormat: interaction.options.getString('naming_format') || null,
    description: interaction.options.getString('description') || null
  });

  const refresh = await refreshPublishedPanel(
    ctx.client,
    interaction.guildId,
    'ticket',
    '*'
  ).catch(() => null);

  return replyPrivate(interaction, {
    embeds: [createSuccessEmbed(
      'Ticket Type Saved',
      `Saved ticket type **${type.name}**. Use \`/ticket question-add\` to customize intake questions.${formatRefreshSummary(refresh)}`
    )]
  });
}

module.exports = {
  ...originalTicketCommand,
  data: originalTicketCommand.data,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup' || subcommand === 'type-setup') {
      await ctx.permissions.ensureGuildConfig(
        interaction.guildId,
        interaction.guild ? interaction.guild.name : null
      );
    }

    if (subcommand === 'setup') return handleDefaultSetup(interaction, ctx);
    if (subcommand === 'type-setup') return handleTypeSetup(interaction, ctx);
    return originalTicketCommand.execute(interaction, ctx);
  }
};
