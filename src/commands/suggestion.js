const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate, replyPublic } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { SuggestionService, STATUS_LABELS, messageUrl } = require('../modules/community/suggestionService');

const suggestions = new SuggestionService();

const statusChoices = Object.entries(STATUS_LABELS).map(([value, name]) => ({ name, value }));
const reviewIndexChoices = [...statusChoices, { name: 'All', value: 'ALL' }];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Submit and manage server suggestions.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure suggestion channels and defaults.')
      .addChannelOption((option) => option.setName('channel').setDescription('Public channel where suggestion voting posts are sent.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addChannelOption((option) => option.setName('review_channel').setDescription('Staff review channel for suggestion review embeds.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addChannelOption((option) => option.setName('log_channel').setDescription('Optional staff log channel for suggestion activity.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addBooleanOption((option) => option.setName('default_anonymous').setDescription('Default new suggestions to anonymous. Default: true.').setRequired(false))
      .addBooleanOption((option) => option.setName('auto_create_threads').setDescription('Automatically create discussion threads under suggestion posts. Default: true.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('submit')
      .setDescription('Submit a server suggestion.')
      .addStringOption((option) => option.setName('title').setDescription('Suggestion title.').setMaxLength(120).setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('Suggestion description.').setMaxLength(4000).setRequired(true))
      .addStringOption((option) => option.setName('category').setDescription('Suggestion category.').setAutocomplete(true).setMaxLength(80).setRequired(false))
      .addBooleanOption((option) => option.setName('anonymous').setDescription('Hide your name publicly. Uses the server default when blank.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('manager').setDescription('Open the Suggestions manager.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View the Suggestions configuration.'))
    .addSubcommand((sub) => sub
      .setName('review-index')
      .setDescription('Post or refresh a staff suggestion review index.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel for the review index. Defaults to the configured review channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addStringOption((option) => option.setName('filter').setDescription('Initial review index filter.').addChoices(...reviewIndexChoices).setRequired(false)))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset suggestion setup and testing data. Requires confirmation.'))
    .addSubcommandGroup((group) => group
      .setName('panel')
      .setDescription('Post and edit the public suggestions panel.')
      .addSubcommand((sub) => sub
        .setName('post')
        .setDescription('Post the public suggestions panel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel where the panel should be posted.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .addStringOption((option) => option.setName('title').setDescription('Panel title.').setMaxLength(100).setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('Panel description.').setMaxLength(1000).setRequired(false))
        .addStringOption((option) => option.setName('header_image').setDescription('Optional Discord image/media URL above the embed.').setMaxLength(500).setRequired(false)))
      .addSubcommand((sub) => sub
        .setName('edit')
        .setDescription('Edit the tracked public suggestions panel.')
        .addStringOption((option) => option.setName('title').setDescription('New panel title.').setMaxLength(100).setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('New panel description.').setMaxLength(1000).setRequired(false))
        .addStringOption((option) => option.setName('header_image').setDescription('New header image URL.').setMaxLength(500).setRequired(false))
        .addBooleanOption((option) => option.setName('clear_header').setDescription('Remove the saved header image.').setRequired(false)))
      .addSubcommand((sub) => sub.setName('refresh').setDescription('Refresh the tracked public suggestions panel.')))
    .addSubcommandGroup((group) => group
      .setName('category')
      .setDescription('Manage suggestion categories.')
      .addSubcommand((sub) => sub.setName('list').setDescription('List active suggestion categories.'))
      .addSubcommand((sub) => sub.setName('add').setDescription('Add or reactivate a suggestion category.').addStringOption((option) => option.setName('name').setDescription('Category name.').setMaxLength(80).setRequired(true)))
      .addSubcommand((sub) => sub.setName('remove').setDescription('Remove a suggestion category.').addStringOption((option) => option.setName('name').setDescription('Category name.').setAutocomplete(true).setMaxLength(80).setRequired(true))))
    .addSubcommandGroup((group) => group
      .setName('review')
      .setDescription('Staff suggestion review tools.')
      .addSubcommand((sub) => sub
        .setName('status')
        .setDescription('Change a suggestion review status and optionally add a response.')
        .addStringOption((option) => option.setName('suggestion').setDescription('Suggestion number or ID.').setRequired(true))
        .addStringOption((option) => option.setName('status').setDescription('New status.').addChoices(...statusChoices).setRequired(true))
        .addStringOption((option) => option.setName('response').setDescription('Staff response shown on the suggestion.').setMaxLength(1000).setRequired(false)))
      .addSubcommand((sub) => sub
        .setName('add-details')
        .setDescription('Add a staff revision note to a suggestion.')
        .addStringOption((option) => option.setName('suggestion').setDescription('Suggestion number or ID.').setRequired(true))
        .addStringOption((option) => option.setName('details').setDescription('Details to add.').setMaxLength(1000).setRequired(true)))
      .addSubcommand((sub) => sub
        .setName('reveal')
        .setDescription('Reveal the submitter of an anonymous suggestion to Senior Moderator+ only.')
        .addStringOption((option) => option.setName('suggestion').setDescription('Suggestion number or ID.').setRequired(true)))
      .addSubcommand((sub) => sub
        .setName('view')
        .setDescription('View a suggestion record.')
        .addStringOption((option) => option.setName('suggestion').setDescription('Suggestion number or ID.').setRequired(true)))),
  moduleKey: ModuleKeys.SUGGESTIONS,
  isPublic(interaction) {
    return interaction.options.getSubcommand(false) === 'submit';
  },
  getActionKey(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);
    if (sub === 'submit') return ActionKeys.SuggestionsSubmit;
    if (sub === 'reset') return ActionKeys.SuggestionsReset;
    if (sub === 'review-index') return ActionKeys.SuggestionsReview;
    if (group === 'panel') return ActionKeys.SuggestionsConfigure;
    if (group === 'category') return ActionKeys.SuggestionsConfigure;
    if (group === 'review') {
      if (sub === 'reveal') return ActionKeys.SuggestionsReveal;
      return ActionKeys.SuggestionsReview;
    }
    if (sub === 'manager' || sub === 'status') return ActionKeys.SuggestionsView;
    return ActionKeys.SuggestionsConfigure;
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = interaction.guild ? await suggestions.autocompleteCategories(interaction.guildId, focused).catch(() => []) : [];
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);

    if (!group && sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const reviewChannel = interaction.options.getChannel('review_channel');
      const logChannel = interaction.options.getChannel('log_channel');
      const config = await suggestions.setup({
        guildId: interaction.guildId,
        channelId: channel.id,
        reviewChannelId: reviewChannel?.id,
        logChannelId: logChannel?.id,
        defaultAnonymous: interaction.options.getBoolean('default_anonymous') ?? undefined,
        autoCreateThreads: interaction.options.getBoolean('auto_create_threads') ?? undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'suggestion-config', title: 'Suggestions Configured', body: `Public Channel: <#${config.channel_id}>${config.review_channel_id ? `\nReview Channel: <#${config.review_channel_id}>` : ''}${config.log_channel_id ? `\nLog Channel: <#${config.log_channel_id}>` : ''}`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestions Configured', [`Suggestions will post in <#${config.channel_id}>.`, config.review_channel_id ? `Review embeds will post in <#${config.review_channel_id}>.` : 'No review channel is configured yet.', `Default anonymous: **${config.default_anonymous === false ? 'No' : 'Yes'}**.`, `Auto discussion threads: **${config.auto_create_threads === false ? 'Disabled' : 'Enabled'}**.`].join('\n'))] });
    }

    if (!group && sub === 'submit') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const result = await suggestions.submitSuggestion({
        guild: interaction.guild,
        user: interaction.user,
        title: interaction.options.getString('title', true),
        description: interaction.options.getString('description', true),
        categoryName: interaction.options.getString('category') || 'Other',
        anonymous: interaction.options.getBoolean('anonymous'),
        client: ctx.client,
        logger: ctx.logger
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Submitted', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Submitted', `Suggestion **#${result.suggestion.suggestion_number}** was posted.\n[Open Suggestion](${messageUrl(interaction.guildId, result.suggestion.message_channel_id, result.suggestion.message_id)})`)] });
    }

    if (!group && (sub === 'manager' || sub === 'status')) {
      return replyPrivate(interaction, await suggestions.buildManagerPanel(interaction.guildId));
    }

    if (!group && sub === 'review-index') {
      const config = await suggestions.getConfig(interaction.guildId);
      const channel = interaction.options.getChannel('channel') || (config?.review_channel_id ? await interaction.guild.channels.fetch(config.review_channel_id).catch(() => null) : null) || interaction.channel;
      if (!channel?.send) return replyPrivate(interaction, { embeds: [createWarningEmbed('Review Index Not Posted', 'Select a text channel or configure a suggestion review channel first.')] });
      const index = await suggestions.createReviewIndex({ guildId: interaction.guildId, channelId: channel.id, statusFilter: interaction.options.getString('filter') || 'PENDING', createdByUserId: interaction.user.id, client: ctx.client });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Review Index Posted', `Review index is active in <#${channel.id}> with filter **${index.status_filter}**.`)] });
    }

    if (!group && sub === 'reset') {
      return replyPrivate(interaction, await suggestions.buildResetConfirmationPayload({ guildId: interaction.guildId, requestedByUserId: interaction.user.id }));
    }

    if (group === 'panel') {
      if (sub === 'post') {
        const channel = interaction.options.getChannel('channel', true);
        const result = await suggestions.postPanel({ guild: interaction.guild, channel, title: interaction.options.getString('title') || undefined, description: interaction.options.getString('description') || undefined, headerImageUrl: interaction.options.getString('header_image') || undefined });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestions Panel Posted', `Panel posted in <#${channel.id}>.\nMessage: ${result.message.url}`)] });
      }
      if (sub === 'edit') {
        await suggestions.setPanelDesign({ guildId: interaction.guildId, title: interaction.options.getString('title') || undefined, description: interaction.options.getString('description') || undefined, headerImageUrl: interaction.options.getString('header_image') || undefined, clearHeader: interaction.options.getBoolean('clear_header') || false });
        const refreshed = await suggestions.refreshPanel(ctx.client, interaction.guildId);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestions Panel Updated', refreshed ? 'The active panel was refreshed.' : 'Panel settings were saved. Post a panel with `/suggestion panel post` if needed.')] });
      }
      if (sub === 'refresh') {
        const refreshed = await suggestions.refreshPanel(ctx.client, interaction.guildId);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestions Panel Refreshed', `Refreshed **${refreshed}** active panel message(s).`)] });
      }
    }

    if (group === 'category') {
      if (sub === 'list') {
        const categories = await suggestions.listCategories(interaction.guildId);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Categories', categories.map((category) => `• ${category.name}`).join('\n') || 'No categories configured.')] });
      }
      if (sub === 'add') {
        const category = await suggestions.addCategory(interaction.guildId, interaction.options.getString('name', true));
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Category Added', `Added **${category.name}**.`)] });
      }
      if (sub === 'remove') {
        const category = await suggestions.removeCategory(interaction.guildId, interaction.options.getString('name', true));
        return replyPrivate(interaction, { embeds: [category ? createSuccessEmbed('Suggestion Category Removed', `Removed **${category.name}**.`) : createWarningEmbed('Category Not Found', 'No matching active category was found.')] });
      }
    }

    if (group === 'review') {
      if (sub === 'status') {
        const result = await suggestions.updateStatus({ guild: interaction.guild, suggestionNumber: interaction.options.getString('suggestion', true), status: interaction.options.getString('status', true), response: interaction.options.getString('response') || undefined, actorUser: interaction.user, logger: ctx.logger });
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Updated', result.reason)] });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Updated', `Suggestion **#${result.suggestion.suggestion_number}** is now **${STATUS_LABELS[result.suggestion.status] || result.suggestion.status}**.`)] });
      }
      if (sub === 'add-details') {
        const result = await suggestions.addDetails({ guild: interaction.guild, suggestionNumber: interaction.options.getString('suggestion', true), details: interaction.options.getString('details', true), actorUser: interaction.user, logger: ctx.logger });
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Details Not Added', result.reason)] });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Suggestion Details Added', `Added details to suggestion **#${result.suggestion.suggestion_number}**.`)] });
      }
      if (sub === 'reveal') {
        const result = await suggestions.buildRevealPayload(interaction.guild, interaction.options.getString('suggestion', true));
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Found', result.reason)] });
        return replyPrivate(interaction, result.payload);
      }
      if (sub === 'view') {
        const result = await suggestions.buildViewPayload(interaction.guild, interaction.options.getString('suggestion', true));
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Suggestion Not Found', result.reason)] });
        return replyPrivate(interaction, result.payload);
      }
    }

    return replyPublic(interaction, { embeds: [createWarningEmbed('Unsupported Suggestion Action', 'This suggestion command is not available.')] });
  }
};
