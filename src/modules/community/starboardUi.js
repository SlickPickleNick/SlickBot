const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { createBaseEmbed, SlickBotColors, formatStatusBadge, formatEnabled } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { StarboardService, getStarTier } = require('./starboardService');

const starboardService = new StarboardService();

async function buildStarboardPanel(guildId, activeTab = 'OVERVIEW') {
  const config = await starboardService.getConfig(guildId);
  const normalizedTab = activeTab.toUpperCase();

  // Tab Navigation Row
  const tabRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.StarboardTabPrefix}OVERVIEW`)
      .setLabel('Overview & Settings')
      .setStyle(normalizedTab === 'OVERVIEW' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('⭐'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.StarboardTabPrefix}EXCLUSIONS`)
      .setLabel('Channel & Role Filters')
      .setStyle(normalizedTab === 'EXCLUSIONS' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🛡️'),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.StarboardTabPrefix}LEADERBOARD`)
      .setLabel('Hall of Fame Top')
      .setStyle(normalizedTab === 'LEADERBOARD' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('🏆'),
    new ButtonBuilder()
      .setCustomId(CustomIds.SetupCategoryCommunity)
      .setLabel('Community')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✨')
  );

  let embed;
  const components = [tabRow];

  if (normalizedTab === 'EXCLUSIONS') {
    embed = createBaseEmbed({
      title: '⭐ Starboard — Channel & Role Exclusions',
      description: 'Configure channels and roles that are blacklisted from the Starboard system.',
      color: SlickBotColors.Blue
    });

    const ignoredChannelsText = config.ignored_channels?.length > 0
      ? config.ignored_channels.map((id) => `<#${id}>`).join(', ')
      : '*No channels blacklisted (all channels monitored).*';

    const ignoredRolesText = config.ignored_roles?.length > 0
      ? config.ignored_roles.map((id) => `<@&${id}>`).join(', ')
      : '*No roles blacklisted (all members can star).*';

    embed.addFields(
      { name: '🚫 Ignored Channels', value: ignoredChannelsText, inline: false },
      { name: '🚫 Ignored Roles', value: ignoredRolesText, inline: false }
    );

    const channelSelectRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(CustomIds.StarboardChannelExemptSelect)
        .setPlaceholder('Select channels to blacklist / toggle exemptions...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(10)
    );

    const roleSelectRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(CustomIds.StarboardRoleExemptSelect)
        .setPlaceholder('Select roles to blacklist from starring...')
        .setMinValues(0)
        .setMaxValues(10)
    );

    components.push(channelSelectRow, roleSelectRow);
  } else if (normalizedTab === 'LEADERBOARD') {
    const topMessages = await starboardService.getTopMessages(guildId, 5);
    const topAuthors = await starboardService.getTopAuthors(guildId, 5);

    embed = createBaseEmbed({
      title: '🏆 Starboard — Community Hall of Fame',
      description: 'Highest-rated community moments and most-starred contributors in this server.',
      color: SlickBotColors.Gold
    });

    let topPostsText = '*No starred messages yet in this server.*';
    if (topMessages.length > 0) {
      topPostsText = topMessages
        .map((m, idx) => {
          const tier = getStarTier(m.star_count, config.star_emoji || '⭐');
          const jumpLink = `https://discord.com/channels/${m.guild_id}/${m.original_channel_id}/${m.original_message_id}`;
          const snippet = m.content ? `"${m.content.slice(0, 50).replace(/\n/g, ' ')}${m.content.length > 50 ? '...' : ''}"` : '*[Attachment]*';
          return `**#${idx + 1}** ${tier} by <@${m.author_user_id}> in <#${m.original_channel_id}>\n└ ${snippet} — [Jump to Post](${jumpLink})`;
        })
        .join('\n\n');
    }

    let topAuthorsText = '*No community star stats recorded yet.*';
    if (topAuthors.length > 0) {
      topAuthorsText = topAuthors
        .map((a, idx) => `**#${idx + 1}** <@${a.author_user_id}> — **${a.total_stars}** ⭐ across **${a.post_count}** pinned posts`)
        .join('\n');
    }

    embed.addFields(
      { name: '🌟 Top Starred Messages', value: topPostsText, inline: false },
      { name: '👑 Top Starred Members', value: topAuthorsText, inline: false }
    );

    const refreshRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.StarboardTabPrefix}LEADERBOARD`)
        .setLabel('Refresh Leaderboard')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄')
    );
    components.push(refreshRow);
  } else {
    // OVERVIEW & SETTINGS
    const channelDisplay = config.channel_id ? `<#${config.channel_id}>` : '⚠️ *Not configured*';
    const statusBadge = config.enabled
      ? (config.channel_id ? '🟢 **Active & Monitoring**' : '🟡 **Needs Channel Configuration**')
      : '🔴 **Disabled**';

    embed = createBaseEmbed({
      title: '⭐ Starboard Control Center',
      description: 'Automatically pin top community messages with reaction stars into your showcase channel.',
      color: config.enabled ? (config.channel_id ? SlickBotColors.Gold : SlickBotColors.Orange) : SlickBotColors.Grey
    });

    embed.addFields(
      { name: 'Status', value: statusBadge, inline: true },
      { name: 'Showcase Channel', value: channelDisplay, inline: true },
      { name: 'Star Threshold', value: `**${config.star_threshold}** stars`, inline: true },
      { name: 'Reaction Emoji', value: `${config.star_emoji}`, inline: true },
      { name: 'Self-Stars Allowed', value: config.allow_self_star ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: 'NSFW Channels', value: config.allow_nsfw ? '✅ Included' : '❌ Excluded', inline: true },
      { name: 'Ignored Channels', value: `**${config.ignored_channels?.length || 0}** channels`, inline: true },
      { name: 'Ignored Roles', value: `**${config.ignored_roles?.length || 0}** roles`, inline: true }
    );

    const channelSelectRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(CustomIds.StarboardChannelSelect)
        .setPlaceholder('Select the Starboard showcase channel...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    );

    const actionsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.StarboardThresholdModalOpen)
        .setLabel('Tune Threshold')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔢'),
      new ButtonBuilder()
        .setCustomId(CustomIds.StarboardEmojiModalOpen)
        .setLabel('Set Emoji')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⭐'),
      new ButtonBuilder()
        .setCustomId(CustomIds.StarboardToggleSelfStar)
        .setLabel(`Self-Stars: ${config.allow_self_star ? 'ON' : 'OFF'}`)
        .setStyle(config.allow_self_star ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(config.allow_self_star ? '✅' : '❌'),
      new ButtonBuilder()
        .setCustomId(CustomIds.StarboardToggleNsfw)
        .setLabel(`NSFW: ${config.allow_nsfw ? 'ON' : 'OFF'}`)
        .setStyle(config.allow_nsfw ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🔞'),
      new ButtonBuilder()
        .setCustomId(CustomIds.StarboardToggleEnabled)
        .setLabel(config.enabled ? 'Disable' : 'Enable')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    components.push(channelSelectRow, actionsRow);
  }

  return {
    embeds: [embed],
    components
  };
}

function buildStarboardThresholdModal(config) {
  const modal = new ModalBuilder()
    .setCustomId(CustomIds.StarboardThresholdModal)
    .setTitle('Tune Starboard Star Threshold');

  const input = new TextInputBuilder()
    .setCustomId('star_threshold')
    .setLabel('Minimum Stars to Pin (1 - 50)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 3, 5, 10')
    .setValue(String(config.star_threshold || 3))
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildStarboardEmojiModal(config) {
  const modal = new ModalBuilder()
    .setCustomId(CustomIds.StarboardEmojiModal)
    .setTitle('Set Starboard Reaction Emoji');

  const input = new TextInputBuilder()
    .setCustomId('star_emoji')
    .setLabel('Reaction Emoji (Unicode or Custom)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. ⭐, 🌟, ✨, or :star:')
    .setValue(config.star_emoji || '⭐')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(64);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

module.exports = {
  buildStarboardPanel,
  buildStarboardThresholdModal,
  buildStarboardEmojiModal
};
