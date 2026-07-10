const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ActivityTypeNames, PresenceStatus } = require('../modules/status/statusService');
const { replyPrivate } = require('../utils/reply');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  ButtonStyle,
  formatStatusBadge,
  SlickBotColors
} = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');

const statusChoices = [
  { name: 'Online', value: PresenceStatus.ONLINE },
  { name: 'Idle', value: PresenceStatus.IDLE },
  { name: 'Do Not Disturb', value: PresenceStatus.DND },
  { name: 'Invisible', value: PresenceStatus.INVISIBLE }
];

const activityChoices = [
  { name: 'None', value: ActivityTypeNames.NONE },
  { name: 'Playing', value: ActivityTypeNames.PLAYING },
  { name: 'Watching', value: ActivityTypeNames.WATCHING },
  { name: 'Listening', value: ActivityTypeNames.LISTENING },
  { name: 'Competing', value: ActivityTypeNames.COMPETING },
  { name: 'Streaming', value: ActivityTypeNames.STREAMING }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('View or change SlickBot status and activity.')
    .addSubcommand((subcommand) => subcommand.setName('view').setDescription('View the current saved bot presence.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set SlickBot status and activity.')
        .addStringOption((option) =>
          option
            .setName('status')
            .setDescription('Discord presence status.')
            .setRequired(true)
            .addChoices(...statusChoices)
        )
        .addStringOption((option) =>
          option
            .setName('activity_type')
            .setDescription('Activity type to show.')
            .setRequired(true)
            .addChoices(...activityChoices)
        )
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Activity text, such as "the server".')
            .setMaxLength(128)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('stream_url')
            .setDescription('Required by Discord for Streaming activity. Twitch/YouTube URL recommended.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('save')
            .setDescription('Save this presence so it reapplies after restarts. Defaults to true.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Clear SlickBot activity and return status to online.')
        .addBooleanOption((option) =>
          option
            .setName('save')
            .setDescription('Save the cleared presence. Defaults to true.')
            .setRequired(false)
        )
    ),
  actionKey: ActionKeys.StatusManage,
  moduleKey: ModuleKeys.STATUS,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'view') {
      await replyPrivate(interaction, await buildStatusPanel(interaction.guildId, ctx));
      return;
    }

    if (subcommand === 'set') {
      const status = interaction.options.getString('status', true);
      const activityType = interaction.options.getString('activity_type', true);
      const activityText = interaction.options.getString('text', false);
      const activityUrl = interaction.options.getString('stream_url', false);
      const save = interaction.options.getBoolean('save') ?? true;

      if (activityType !== ActivityTypeNames.NONE && !activityText) {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Activity Text Required',
            description: 'Choose `NONE` for the activity type or provide activity text.',
            color: SlickBotColors.WARNING
          })]
        });
        return;
      }

      if (activityType === ActivityTypeNames.STREAMING && !activityUrl) {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Stream URL Required',
            description: 'Discord requires a stream URL when using the Streaming activity type.',
            color: SlickBotColors.WARNING
          })]
        });
        return;
      }

      await ctx.status.applyPresence({ status, activityType, activityText, activityUrl });
      if (save) {
        await ctx.status.savePresence(interaction.guildId, { status, activityType, activityText, activityUrl });
      }

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.StatusManage,
        targetType: 'BotPresence',
        targetId: interaction.client.user.id,
        summary: `Bot presence updated to ${status} / ${activityType}.`,
        metadata: { status, activityType, activityText, activityUrl, save }
      });

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'status',
        title: 'Bot Status Updated',
        body: [`Updated By: <@${interaction.user.id}>`, `Status: **${status}**`, `Activity: **${activityType}**`, activityText ? `Text: ${activityText}` : null].filter(Boolean).join('\n'),
        metadata: { status, activityType, activityText, activityUrl, save, actorUserId: interaction.user.id }
      });

      await replyPrivate(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Status updated.'));
      return;
    }

    if (subcommand === 'clear') {
      const save = interaction.options.getBoolean('save') ?? true;
      await ctx.status.clearPresence(interaction.guildId, save);

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.StatusManage,
        targetType: 'BotPresence',
        targetId: interaction.client.user.id,
        summary: 'Bot presence cleared.',
        metadata: { save }
      });

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'status',
        title: 'Bot Status Cleared',
        body: `Cleared By: <@${interaction.user.id}>`,
        metadata: { save, actorUserId: interaction.user.id }
      });

      await replyPrivate(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Status cleared.'));
    }
  }
};

async function buildStatusPanel(guildId, ctx, notice = null) {
  const presence = await ctx.status.describeCurrentPresence(guildId);
  const saved = presence.saved;

  const description = [
    notice ? `**${notice}**` : null,
    '**Current Runtime Presence**',
    `Status: **${formatStatusBadge(presence.currentStatus || 'unknown')}**`,
    `Activity: **${presence.currentActivityName || 'None'}**`,
    '',
    '**Saved Presence**',
    saved
      ? `Status: **${formatStatusBadge(saved.status)}**\nActivity Type: **${saved.activityType || 'NONE'}**\nActivity Text: **${saved.activityText || 'None'}**`
      : 'No saved presence yet. SlickBot is using environment defaults.'
  ].filter(Boolean).join('\n');

  const embed = createBaseEmbed({
    title: 'SlickBot Status Control',
    description,
    color: SlickBotColors.PRIMARY
  });

  const controls = createButtonRow([
    createPanelButton(CustomIds.StatusQuickOnline, 'Online', ButtonStyle.Success, '🟢'),
    createPanelButton(CustomIds.StatusQuickIdle, 'Idle', ButtonStyle.Secondary, '🌙'),
    createPanelButton(CustomIds.StatusQuickDnd, 'DND', ButtonStyle.Danger, '⛔'),
    createPanelButton(CustomIds.StatusClear, 'Clear Activity', ButtonStyle.Secondary, '🧹'),
    createPanelButton(CustomIds.StatusRefresh, 'Refresh', ButtonStyle.Primary, '🔄')
  ]);

  return { embeds: [embed], components: [controls] };
}

module.exports.buildStatusPanel = buildStatusPanel;
