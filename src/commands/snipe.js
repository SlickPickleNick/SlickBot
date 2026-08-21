const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');
const { createBaseEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('View the most recently deleted message in a channel (Staff tool).')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to snipe (defaults to current channel).')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  actionKey: ActionKeys.UtilitySnipeView,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const channel = interaction.options.getChannel('channel', false) || interaction.channel;
    const snipe = utility.getSnipe(channel.id);

    if (!snipe) {
      return replyPrivate(interaction, {
        embeds: [createWarningEmbed('No Snipe Available', `There are no recently deleted messages recorded for <#${channel.id}>.`)]
      });
    }

    const embed = createBaseEmbed({
      title: '🎯 Sniped Deleted Message',
      description: snipe.content ? `>>> ${snipe.content}` : '*[No text content]*',
      color: SlickBotColors.WARNING
    });

    if (snipe.author) {
      embed.setAuthor({
        name: `${snipe.author.tag} (${snipe.author.id})`,
        iconURL: snipe.author.avatar || undefined
      });
    }

    const sentSec = Math.floor(new Date(snipe.createdAt).getTime() / 1000);
    const delSec = Math.floor(new Date(snipe.deletedAt).getTime() / 1000);

    embed.addFields([
      {
        name: '📌 Context',
        value: `**Channel:** <#${channel.id}>\n**Sent:** <t:${sentSec}:T> (<t:${sentSec}:R>)\n**Deleted:** <t:${delSec}:T> (<t:${delSec}:R>)`,
        inline: false
      }
    ]);

    if (snipe.attachments && snipe.attachments.length) {
      const attLinks = snipe.attachments.map((a, i) => `[Attachment ${i + 1}: ${a.name}](${a.url || a.proxyURL})`).join('\n');
      embed.addFields([{ name: '📎 Attachments', value: attLinks, inline: false }]);
      if (snipe.attachments[0].url && /\.(png|jpe?g|webp|gif)$/i.test(snipe.attachments[0].name)) {
        embed.setImage(snipe.attachments[0].url);
      }
    }

    return replyPrivate(interaction, { embeds: [embed] });
  }
};
