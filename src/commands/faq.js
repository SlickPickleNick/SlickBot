const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { FaqService, parseMessageLink, forumPostUrl } = require('../modules/community/faqService');

const faq = new FaqService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Manage and use the SlickBot Knowledge Base / FAQ.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure the FAQ forum or text channel and create/refresh the master index.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Forum channel (Community servers) or text channel (non-Community servers).')
        .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('ticket_channel')
        .setDescription('Optional channel users should use if they still need support.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addStringOption((option) => option.setName('master_title').setDescription('Title for the master FAQ post.').setMaxLength(100).setRequired(false))
      .addStringOption((option) => option.setName('master_description').setDescription('Description for the master FAQ post.').setMaxLength(1000).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a new FAQ entry (creates forum post or text embed with discussion thread).')
      .addStringOption((option) => option.setName('question').setDescription('FAQ question or topic title.').setMaxLength(120).setRequired(true))
      .addStringOption((option) => option.setName('answer').setDescription('FAQ answer / content.').setMaxLength(4000).setRequired(true))
      .addStringOption((option) => option.setName('category').setDescription('Category tag (e.g. General, Rules, Billing, Support).').setMaxLength(50).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('edit')
      .setDescription('Edit an existing FAQ post/entry or master FAQ post text.')
      .addStringOption((option) => option.setName('question_or_id').setDescription('FAQ question title or entry ID to edit.').setAutocomplete(true).setRequired(false))
      .addStringOption((option) => option.setName('new_question').setDescription('Updated question title.').setMaxLength(120).setRequired(false))
      .addStringOption((option) => option.setName('new_answer').setDescription('Updated answer content.').setMaxLength(4000).setRequired(false))
      .addStringOption((option) => option.setName('category').setDescription('Updated category.').setMaxLength(50).setRequired(false))
      .addStringOption((option) => option.setName('master_title').setDescription('New master FAQ title.').setMaxLength(100).setRequired(false))
      .addStringOption((option) => option.setName('master_description').setDescription('New master FAQ description.').setMaxLength(1000).setRequired(false))
      .addChannelOption((option) => option
        .setName('ticket_channel')
        .setDescription('Optional channel users should use if they still need support.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addBooleanOption((option) => option.setName('clear_ticket_channel').setDescription('Remove the saved ticket channel.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('refresh').setDescription('Refresh the master FAQ index.'))
    .addSubcommand((sub) => sub.setName('resend-navigation').setDescription('Resend the FAQ Navigation panel in the current FAQ thread.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View FAQ configuration and master post status.'))
    .addSubcommand((sub) => sub
      .setName('answer')
      .setDescription('Reply with a linked FAQ post.')
      .addStringOption((option) => option.setName('question').setDescription('FAQ post title or keywords.').setRequired(true).setAutocomplete(true).setMaxLength(100))
      .addUserOption((option) => option.setName('user').setDescription('Optional member to ping in the FAQ response.').setRequired(false))
      .addStringOption((option) => option.setName('message_link').setDescription('Optional Discord message link to reply to directly.').setRequired(false).setMaxLength(300)))
    .addSubcommand((sub) => sub.setName('manager').setDescription('Open the FAQ setup and status manager.'))
    .addSubcommand((sub) => sub.setName('panel').setDescription('Open the FAQ setup/status panel.')),
  moduleKey: ModuleKeys.FAQ,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'answer') return ActionKeys.FaqAnswer;
    if (sub === 'resend-navigation') return ActionKeys.FaqConfigure;
    if (sub === 'status' || sub === 'panel' || sub === 'manager') return ActionKeys.FaqView;
    return ActionKeys.FaqConfigure;
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = interaction.guild ? await faq.autocomplete(interaction.guild, focused).catch(() => []) : [];
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const ticketChannel = interaction.options.getChannel('ticket_channel');
      const result = await faq.setup({
        guild: interaction.guild,
        channel,
        ticketChannel,
        masterTitle: interaction.options.getString('master_title') || undefined,
        masterDescription: interaction.options.getString('master_description') || undefined,
        logger: ctx.logger,
        actorUserId: interaction.user.id
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Setup Failed', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'faq-config', title: 'FAQ Configured', body: `Channel: <#${channel.id}>\nType: **${channel.type === ChannelType.GuildForum ? 'Forum' : 'Text'}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Configured', `The FAQ channel is <#${channel.id}> (${channel.type === ChannelType.GuildForum ? 'Forum' : 'Text'}).\nMaster index created and ready!`)] });
    }

    if (sub === 'add') {
      const question = interaction.options.getString('question', true);
      const answer = interaction.options.getString('answer', true);
      const category = interaction.options.getString('category') || 'General';

      const result = await faq.addFaqEntry({
        guild: interaction.guild,
        question,
        answer,
        category,
        actorUserId: interaction.user.id,
        logger: ctx.logger
      });

      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Could Not Add FAQ', result.reason)] });
      }

      const target = result.isForum ? `<#${result.thread.id}>` : `<#${result.channel.id}>`;
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('FAQ Added', `Created FAQ topic **${question}** in ${target} under category **${category}**!`)]
      });
    }

    if (sub === 'edit') {
      const questionOrId = interaction.options.getString('question_or_id');
      const newQuestion = interaction.options.getString('new_question');
      const newAnswer = interaction.options.getString('new_answer');
      const category = interaction.options.getString('category');

      if (questionOrId || newQuestion || newAnswer || category) {
        if (!questionOrId) {
          return replyPrivate(interaction, { embeds: [createWarningEmbed('Missing Topic', 'Please specify the `question_or_id` of the FAQ you want to edit.')] });
        }
        const result = await faq.editFaqEntry({
          guild: interaction.guild,
          idOrQuestion: questionOrId,
          newQuestion,
          newAnswer,
          category,
          logger: ctx.logger,
          actorUserId: interaction.user.id
        });
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Edit Failed', result.reason)] });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Updated', 'The FAQ topic has been successfully updated!')] });
      }

      const clearTicket = interaction.options.getBoolean('clear_ticket_channel') || false;
      const ticketChannel = interaction.options.getChannel('ticket_channel');
      if (clearTicket && ticketChannel) return replyPrivate(interaction, { embeds: [createWarningEmbed('Choose One Ticket Option', 'Use either `ticket_channel` or `clear_ticket_channel`, not both.')] });
      const current = await faq.getConfig(interaction.guildId);
      if (!current?.forum_channel_id) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Not Configured', 'Run `/faq setup` first.')] });
      await faq.upsertConfig({
        guildId: interaction.guildId,
        forumChannelId: current.forum_channel_id,
        ticketChannelId: clearTicket ? null : ticketChannel ? ticketChannel.id : undefined,
        masterTitle: interaction.options.getString('master_title') || undefined,
        masterDescription: interaction.options.getString('master_description') || undefined
      });
      const refreshed = await faq.refreshMasterPost({ guild: interaction.guild, client: ctx.client, logger: ctx.logger, actorUserId: interaction.user.id });
      if (!refreshed.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Not Refreshed', refreshed.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Updated', `The master FAQ index was updated.`)] });
    }

    if (sub === 'refresh') {
      const result = await faq.refreshMasterPost({ guild: interaction.guild, client: ctx.client, logger: ctx.logger, actorUserId: interaction.user.id });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Not Refreshed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Refreshed', `The master FAQ post was refreshed with **${result.posts?.length || result.entries?.length || 0}** indexed topic(s).`)] });
    }

    if (sub === 'resend-navigation') {
      const config = await faq.getConfig(interaction.guildId);
      if (!config?.forum_channel_id) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Not Configured', 'Run `/faq setup` first.')] });
      const channel = interaction.channel;
      if (!channel?.isThread?.() || (channel.parentId || channel.parent?.id) !== config.forum_channel_id || channel.id === config.master_thread_id) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Not an FAQ Post', 'Run this command inside a normal FAQ thread, not the master FAQ post.')] });
      }
      const result = await faq.postFaqThreadNavigation({ guild: interaction.guild, thread: channel, config, client: ctx.client, logger: ctx.logger, force: true });
      if (!result.ok && !result.skipped) return replyPrivate(interaction, { embeds: [createWarningEmbed('Navigation Not Sent', result.reason || 'SlickBot could not resend the FAQ Navigation panel.')] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Navigation Sent', 'The FAQ Navigation panel was posted in this FAQ thread.')], deleteAfterSeconds: 10 });
    }

    if (sub === 'status' || sub === 'panel' || sub === 'manager') return replyPrivate(interaction, await faq.buildManagerPanel(interaction.guildId));

    if (sub === 'answer') {
      const question = interaction.options.getString('question', true);
      const user = interaction.options.getUser('user');
      const messageLink = interaction.options.getString('message_link');
      let targetMessage = null;
      if (messageLink) {
        const parsed = parseMessageLink(messageLink);
        if (!parsed || parsed.guildId !== interaction.guildId) return replyPrivate(interaction, { embeds: [createWarningEmbed('Invalid Message Link', 'Provide a valid message link from this server.')] });
        const targetChannel = await interaction.guild.channels.fetch(parsed.channelId).catch(() => null);
        targetMessage = targetChannel?.messages?.fetch ? await targetChannel.messages.fetch(parsed.messageId).catch(() => null) : null;
        if (!targetMessage) return replyPrivate(interaction, { embeds: [createWarningEmbed('Message Not Found', 'SlickBot could not fetch that message. Check channel visibility and message link.')] });
      }
      const result = await faq.sendFaqAnswer({ guild: interaction.guild, channel: interaction.channel, actorUser: interaction.user, question, targetUser: user, targetMessage, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Reply Not Sent', result.reason)] });
      const title = result.thread ? result.thread.name : result.entry?.question || 'FAQ';
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Reply Sent', `Answered: **${title}**\nMessage: ${result.message.url}`)], deleteAfterSeconds: 10 });
    }
  }
};
