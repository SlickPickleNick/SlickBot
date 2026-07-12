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
      .setDescription('Configure the FAQ forum and create or refresh the master index post.')
      .addChannelOption((option) => option
        .setName('forum')
        .setDescription('Forum channel containing manually-created FAQ posts.')
        .addChannelTypes(ChannelType.GuildForum)
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('ticket_channel')
        .setDescription('Optional channel users should use if they still need support.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addStringOption((option) => option.setName('master_title').setDescription('Title for the master FAQ post.').setMaxLength(100).setRequired(false))
      .addStringOption((option) => option.setName('master_description').setDescription('Description for the master FAQ post.').setMaxLength(1000).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('edit')
      .setDescription('Edit saved FAQ master-post text or support-ticket link.')
      .addStringOption((option) => option.setName('master_title').setDescription('New master FAQ title.').setMaxLength(100).setRequired(false))
      .addStringOption((option) => option.setName('master_description').setDescription('New master FAQ description.').setMaxLength(1000).setRequired(false))
      .addChannelOption((option) => option
        .setName('ticket_channel')
        .setDescription('Optional channel users should use if they still need support.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addBooleanOption((option) => option.setName('clear_ticket_channel').setDescription('Remove the saved ticket channel.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('refresh').setDescription('Refresh the master FAQ post from the forum posts and tags.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View FAQ configuration and master post status.'))
    .addSubcommand((sub) => sub
      .setName('answer')
      .setDescription('Reply with a linked FAQ post.')
      .addStringOption((option) => option.setName('question').setDescription('FAQ post title or keywords.').setRequired(true).setAutocomplete(true).setMaxLength(100))
      .addUserOption((option) => option.setName('user').setDescription('Optional member to ping in the FAQ response.').setRequired(false))
      .addStringOption((option) => option.setName('message_link').setDescription('Optional Discord message link to reply to directly.').setRequired(false).setMaxLength(300)))
    .addSubcommand((sub) => sub.setName('panel').setDescription('Open the FAQ setup/status panel.')),
  moduleKey: ModuleKeys.FAQ,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'answer') return ActionKeys.FaqAnswer;
    if (sub === 'status' || sub === 'panel') return ActionKeys.FaqView;
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
      const forum = interaction.options.getChannel('forum', true);
      const ticketChannel = interaction.options.getChannel('ticket_channel');
      const result = await faq.setup({
        guild: interaction.guild,
        forumChannel: forum,
        ticketChannel,
        masterTitle: interaction.options.getString('master_title') || undefined,
        masterDescription: interaction.options.getString('master_description') || undefined,
        logger: ctx.logger,
        actorUserId: interaction.user.id
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Setup Failed', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'faq-config', title: 'FAQ Configured', body: `Forum: <#${forum.id}>\nMaster Post: <#${result.config.master_thread_id}>\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Configured', `The FAQ forum is <#${forum.id}>.\nMaster post: <#${result.config.master_thread_id}>\nIndexed FAQ posts: **${result.posts?.length || 0}**.`)] });
    }

    if (sub === 'edit') {
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
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Updated', `The master FAQ post was updated.\nMaster post: <#${refreshed.config.master_thread_id}>`)] });
    }

    if (sub === 'refresh') {
      const result = await faq.refreshMasterPost({ guild: interaction.guild, client: ctx.client, logger: ctx.logger, actorUserId: interaction.user.id });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('FAQ Not Refreshed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Refreshed', `The master FAQ post was refreshed with **${result.posts.length}** indexed post(s).\nMaster post: <#${result.config.master_thread_id}>`)] });
    }

    if (sub === 'status' || sub === 'panel') return replyPrivate(interaction, await faq.buildManagerPanel(interaction.guildId));

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
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('FAQ Reply Sent', `Linked FAQ: [${result.thread.name}](${forumPostUrl(interaction.guildId, result.thread.id)})\nResponse: ${result.message.url}`)], deleteAfterSeconds: 10 });
    }
  }
};
