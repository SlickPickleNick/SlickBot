const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
        .setName('stream-url')
        .setDescription('Save the stream URL used by the Streaming activity button.')
        .addStringOption((option) =>
          option
            .setName('url')
            .setDescription('Twitch, YouTube, or other stream URL to use for Streaming activity.')
            .setRequired(true)
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

    if (subcommand === 'stream-url') {
      const streamUrl = interaction.options.getString('url', true).trim();
      if (!/^https?:\/\//i.test(streamUrl)) {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Invalid Stream URL',
            description: 'The stream URL must start with `http://` or `https://`.',
            color: SlickBotColors.WARNING
          })]
        });
        return;
      }

      await ctx.status.saveStreamUrl(interaction.guildId, streamUrl);

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.StatusManage,
        targetType: 'BotPresence',
        targetId: interaction.client.user.id,
        summary: 'Bot stream URL updated.',
        metadata: { streamUrl }
      });

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'status',
        title: 'Bot Stream URL Updated',
        body: `Updated By: <@${interaction.user.id}>`,
        metadata: { streamUrl, actorUserId: interaction.user.id }
      });

      await replyPrivate(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Stream URL saved. The Streaming button can now use it.'));
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

function normalizePanelActivityType(value) {
  const normalized = String(value || ActivityTypeNames.NONE).toUpperCase();
  return Object.values(ActivityTypeNames).includes(normalized) ? normalized : ActivityTypeNames.NONE;
}

function normalizePanelStatus(value) {
  const normalized = String(value || PresenceStatus.ONLINE).toLowerCase();
  return Object.values(PresenceStatus).includes(normalized) ? normalized : PresenceStatus.ONLINE;
}

function activeStyle(isActive) {
  return isActive ? ButtonStyle.Success : ButtonStyle.Secondary;
}

async function buildStatusPanel(guildId, ctx, notice = null) {
  const presence = await ctx.status.describeCurrentPresence(guildId);
  const saved = presence.saved;
  const savedStatus = normalizePanelStatus(saved?.status || presence.currentStatus || PresenceStatus.ONLINE);
  const savedActivityType = normalizePanelActivityType(saved?.activityType || ActivityTypeNames.NONE);
  const savedStreamUrl = saved?.streamUrl || saved?.activityUrl || null;

  const description = [
    '**Viewing:** Status Control',
    '',
    notice ? `**${notice}**` : null,
    '**Current Runtime Presence**',
    `Status: **${formatStatusBadge(presence.currentStatus || 'unknown')}**`,
    `Activity: **${presence.currentActivityName || 'None'}**`,
    '',
    '**Saved Presence**',
    saved
      ? [
        `Status: **${formatStatusBadge(saved.status)}**`,
        `Activity Type: **${saved.activityType || 'NONE'}**`,
        `Activity Text: **${saved.activityText || 'None'}**`,
        `Stream URL: ${savedStreamUrl ? `<${savedStreamUrl}>` : '**Not set**'}`
      ].join('\n')
      : 'No saved presence yet. SlickBot is using environment defaults.',
    '',
    '**Quick Controls**',
    'Green buttons show the saved active selection. Gray buttons are inactive options. Use **Activity Text** to update the saved activity wording.'
  ].filter(Boolean).join('\n');

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup',
    description,
    color: SlickBotColors.PRIMARY
  });

  const statusControls = createButtonRow([
    createPanelButton(CustomIds.StatusQuickOnline, 'Online', activeStyle(savedStatus === PresenceStatus.ONLINE), '🟢'),
    createPanelButton(CustomIds.StatusQuickIdle, 'Idle', activeStyle(savedStatus === PresenceStatus.IDLE), '🌙'),
    createPanelButton(CustomIds.StatusQuickDnd, 'DND', activeStyle(savedStatus === PresenceStatus.DND), '⛔'),
    createPanelButton(CustomIds.StatusRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Secondary, '↩️')
  ]);

  const activityControls = createButtonRow([
    createPanelButton(CustomIds.StatusActivityPlaying, 'Playing', activeStyle(savedActivityType === ActivityTypeNames.PLAYING), '🎮'),
    createPanelButton(CustomIds.StatusActivityWatching, 'Watching', activeStyle(savedActivityType === ActivityTypeNames.WATCHING), '👀'),
    createPanelButton(CustomIds.StatusActivityListening, 'Listening', activeStyle(savedActivityType === ActivityTypeNames.LISTENING), '🎧'),
    createPanelButton(CustomIds.StatusActivityCompeting, 'Competing', activeStyle(savedActivityType === ActivityTypeNames.COMPETING), '🏆'),
    createPanelButton(CustomIds.StatusActivityStreaming, 'Streaming', activeStyle(savedActivityType === ActivityTypeNames.STREAMING), '📡')
  ]);

  const utilityControls = createButtonRow([
    createPanelButton(CustomIds.StatusActivityText, 'Activity Text', ButtonStyle.Secondary, '✏️'),
    createPanelButton(CustomIds.StatusClear, 'Clear Activity', activeStyle(savedActivityType === ActivityTypeNames.NONE), '🧹')
  ]);

  return { embeds: [embed], components: [statusControls, activityControls, utilityControls] };
}

function buildStatusActivityTextModal(currentText = null) {
  const input = new TextInputBuilder()
    .setCustomId('activity_text')
    .setLabel('Activity text')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Example: the server')
    .setRequired(true)
    .setMaxLength(128);

  const value = String(currentText || '').trim();
  if (value) input.setValue(value.slice(0, 128));

  return new ModalBuilder()
    .setCustomId(CustomIds.StatusActivityTextModal)
    .setTitle('Set Activity Text')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports.buildStatusPanel = buildStatusPanel;
module.exports.buildStatusActivityTextModal = buildStatusActivityTextModal;
