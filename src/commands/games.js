const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate, replyPublic } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const {
  CommunityGameService,
  GAME_KEYS,
  buildCountingStatusEmbed,
  buildCountingLeaderboardEmbed,
  buildGameStatsEmbed
} = require('../modules/community/gameService');

const games = new CommunityGameService();

function addBoardGameGroup(builder, name, description) {
  return builder.addSubcommandGroup((group) =>
    group
      .setName(name)
      .setDescription(description)
      .addSubcommand((sub) =>
        sub
          .setName('setup')
          .setDescription(`Configure where ${description.toLowerCase()} can be played.`)
          .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Optional channel restriction. Leave blank to preserve the current setting.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
          .addBooleanOption((option) => option
            .setName('allow_any_channel')
            .setDescription('Clear the channel restriction and allow games in any text channel.')
            .setRequired(false))
          .addIntegerOption((option) => option
            .setName('win_xp')
            .setDescription('Leveling XP awarded to the winner. Draws award half to each player. Default: 50.')
            .setMinValue(0)
            .setMaxValue(1000000)
            .setRequired(false)))
      .addSubcommand((sub) => sub.setName('enable').setDescription(`Enable ${description.toLowerCase()}.`))
      .addSubcommand((sub) => sub.setName('disable').setDescription(`Disable ${description.toLowerCase()}.`))
      .addSubcommand((sub) =>
        sub
          .setName('challenge')
          .setDescription(`Challenge another member to ${description.toLowerCase()}.`)
          .addUserOption((option) => option.setName('opponent').setDescription('Member to challenge.').setRequired(true)))
      .addSubcommand((sub) =>
        sub
          .setName('stats')
          .setDescription(`View ${description.toLowerCase()} statistics.`)
          .addUserOption((option) => option.setName('user').setDescription('Member to view. Defaults to yourself.').setRequired(false)))
  );
}

let commandBuilder = new SlashCommandBuilder()
  .setName('games')
  .setDescription('Configure and play SlickBot community games.')
  .addSubcommand((sub) => sub.setName('manager').setDescription('Open the Community Games manager.'))
  .addSubcommandGroup((group) =>
    group
      .setName('panel')
      .setDescription('Post and edit the public Community Games panel.')
      .addSubcommand((sub) =>
        sub
          .setName('post')
          .setDescription('Post a public panel where members can start available games.')
          .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Channel where SlickBot should post the games panel.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
          .addStringOption((option) => option.setName('title').setDescription('Panel title.').setMaxLength(100).setRequired(false))
          .addStringOption((option) => option.setName('description').setDescription('Panel description.').setMaxLength(1000).setRequired(false))
          .addStringOption((option) => option.setName('header_image').setDescription('Optional Discord image/media URL shown above the embed.').setMaxLength(500).setRequired(false)))
      .addSubcommand((sub) =>
        sub
          .setName('edit')
          .setDescription('Edit all active tracked Community Games panels.')
          .addStringOption((option) => option.setName('title').setDescription('New panel title.').setMaxLength(100).setRequired(false))
          .addStringOption((option) => option.setName('description').setDescription('New panel description.').setMaxLength(1000).setRequired(false))
          .addStringOption((option) => option.setName('header_image').setDescription('New header image URL.').setMaxLength(500).setRequired(false))
          .addBooleanOption((option) => option.setName('clear_header').setDescription('Remove the saved header image.').setRequired(false)))
      .addSubcommand((sub) => sub.setName('refresh').setDescription('Refresh all active tracked Community Games panels.'))
  )
  .addSubcommandGroup((group) =>
    group
      .setName('counting')
      .setDescription('Configure and manage the persistent counting game.')
      .addSubcommand((sub) =>
        sub
          .setName('setup')
          .setDescription('Configure the counting channel and counting rules.')
          .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Dedicated counting channel.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
          .addIntegerOption((option) => option.setName('starting_number').setDescription('Number used after a reset.').setMinValue(-2000000000).setMaxValue(2000000000).setRequired(false))
          .addBooleanOption((option) => option.setName('reset_on_incorrect').setDescription('Reset the count after an invalid entry.').setRequired(false))
          .addBooleanOption((option) => option.setName('prevent_consecutive').setDescription('Prevent the same member from counting twice in a row.').setRequired(false))
          .addBooleanOption((option) => option.setName('reset_on_edit').setDescription('Reset if an accepted counting message is edited. Default: true.').setRequired(false))
          .addBooleanOption((option) => option.setName('reset_on_delete').setDescription('Reset if an accepted counting message is deleted. Default: true.').setRequired(false))
          .addBooleanOption((option) => option.setName('ignore_non_numbers').setDescription('Ignore text and other non-counting messages. Default: true.').setRequired(false))
          .addBooleanOption((option) => option.setName('allow_expressions').setDescription('Allow safe integer math expressions such as 2+2.').setRequired(false))
          .addBooleanOption((option) => option.setName('delete_invalid').setDescription('Delete invalid counting entries when possible.').setRequired(false))
          .addStringOption((option) => option.setName('reset_message').setDescription('Reset message. Supports {user}, {expected}, {next}, {record}, {reason}.').setMaxLength(1000).setRequired(false))
          .addIntegerOption((option) => option.setName('milestone_interval').setDescription('Announce every N numbers. Use 0 to disable.').setMinValue(0).setMaxValue(1000000000).setRequired(false))
          .addStringOption((option) => option.setName('milestone_message').setDescription('Milestone message. Supports {user}, {number}, {record}, {channel}, {server}.').setMaxLength(1000).setRequired(false))
          .addIntegerOption((option) => option.setName('milestone_xp').setDescription('Leveling XP awarded to the member who reaches a milestone. Use 0 to disable.').setMinValue(0).setMaxValue(1000000).setRequired(false))
          .addBooleanOption((option) => option.setName('normal_message_xp').setDescription('Allow accepted counting messages to earn normal message XP. Default: false.').setRequired(false))
          .addStringOption((option) => option.setName('accepted_reaction').setDescription('Emoji SlickBot reacts with for accepted counts. Default: :greencheck:.').setMaxLength(100).setRequired(false))
          .addStringOption((option) => option.setName('failed_reaction').setDescription('Emoji SlickBot reacts with for failed counts. Default: :no_entry_sign:.').setMaxLength(100).setRequired(false)))
      .addSubcommand((sub) => sub.setName('enable').setDescription('Enable the counting game.'))
      .addSubcommand((sub) => sub.setName('disable').setDescription('Disable the counting game.'))
      .addSubcommand((sub) => sub.setName('status').setDescription('View the current counting configuration and number.'))
      .addSubcommand((sub) =>
        sub
          .setName('reset')
          .setDescription('Reset the count to the configured start or a specified next number.')
          .addBooleanOption((option) => option.setName('confirm').setDescription('Must be true to reset the active count.').setRequired(true))
          .addIntegerOption((option) => option.setName('next_number').setDescription('Optional number members should post next.').setMinValue(-2000000000).setMaxValue(2000000000).setRequired(false)))
      .addSubcommand((sub) =>
        sub
          .setName('set-number')
          .setDescription('Set the current accepted number without resetting the record.')
          .addIntegerOption((option) => option.setName('number').setDescription('Current accepted number.').setMinValue(-2000000000).setMaxValue(2000000000).setRequired(true)))
      .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the counting contribution leaderboard.'))
      .addSubcommand((sub) =>
        sub
          .setName('ignored-role-add')
          .setDescription('Ignore all counting-channel messages from a role.')
          .addRoleOption((option) => option.setName('role').setDescription('Role to ignore.').setRequired(true)))
      .addSubcommand((sub) =>
        sub
          .setName('ignored-role-remove')
          .setDescription('Remove a role from the counting ignore list.')
          .addRoleOption((option) => option.setName('role').setDescription('Role to remove.').setRequired(true)))
      .addSubcommand((sub) =>
        sub
          .setName('ignored-user-add')
          .setDescription('Ignore all counting-channel messages from a member.')
          .addUserOption((option) => option.setName('user').setDescription('Member to ignore.').setRequired(true)))
      .addSubcommand((sub) =>
        sub
          .setName('ignored-user-remove')
          .setDescription('Remove a member from the counting ignore list.')
          .addUserOption((option) => option.setName('user').setDescription('Member to remove.').setRequired(true)))
  );

commandBuilder = addBoardGameGroup(commandBuilder, 'tic-tac-toe', 'Tic-Tac-Toe');
commandBuilder = addBoardGameGroup(commandBuilder, 'connect-four', 'Connect Four');

module.exports = {
  data: commandBuilder,
  moduleKey: ModuleKeys.COMMUNITY_GAMES,
  getActionKey(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if ((group === 'tic-tac-toe' || group === 'connect-four') && ['challenge', 'stats'].includes(sub)) return ActionKeys.GamesPlay;
    if (group === 'counting' && sub === 'leaderboard') return ActionKeys.GamesPlay;
    if (sub === 'manager' || sub === 'status') return ActionKeys.GamesView;
    return ActionKeys.GamesConfigure;
  },
  isPublic(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    return ((group === 'tic-tac-toe' || group === 'connect-four') && ['challenge', 'stats'].includes(sub))
      || (group === 'counting' && sub === 'leaderboard');
  },
  async execute(interaction, ctx) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === 'manager') return replyPrivate(interaction, await games.buildManagerPanel(interaction.guildId));

    if (group === 'panel') {
      if (sub === 'post') {
        const channel = interaction.options.getChannel('channel', true);
        const result = await games.createGamePanel({
          guildId: interaction.guildId,
          channel,
          title: interaction.options.getString('title') || undefined,
          description: interaction.options.getString('description') || undefined,
          headerImageUrl: interaction.options.getString('header_image') || undefined
        });
        await logConfig(ctx, interaction, 'Community Games Panel Posted', `Channel: <#${channel.id}>
Message: ${result.message.url || 'posted'}`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Community Games Panel Posted', `Posted the Community Games panel in <#${channel.id}>.
[Open panel](${result.message.url})`)] });
      }

      if (sub === 'edit') {
        const clearHeader = interaction.options.getBoolean('clear_header') || false;
        const headerImage = interaction.options.getString('header_image');
        if (clearHeader && headerImage) return replyPrivate(interaction, { embeds: [createWarningEmbed('Choose One Header Option', 'Use either `header_image` or `clear_header`, not both.')] });
        const result = await games.editGamePanels({
          guildId: interaction.guildId,
          title: interaction.options.getString('title') ?? undefined,
          description: interaction.options.getString('description') ?? undefined,
          headerImageUrl: headerImage ?? undefined,
          clearHeader,
          client: ctx.client
        });
        await logConfig(ctx, interaction, 'Community Games Panel Edited', `Active Panels Updated: **${result.updated}**
Messages Refreshed: **${result.refreshed}**`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Community Games Panels Updated', `Updated **${result.updated}** active panel record(s) and refreshed **${result.refreshed}** message(s).`)] });
      }

      if (sub === 'refresh') {
        const refreshed = await games.refreshGamePanels(ctx.client, interaction.guildId);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Community Games Panels Refreshed', `Refreshed **${refreshed}** active panel message(s).`)] });
      }
    }

    if (group === 'counting') {
      if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const config = await games.updateCountingConfig(interaction.guildId, {
          channelId: channel?.id,
          startingNumber: interaction.options.getInteger('starting_number') ?? undefined,
          resetOnIncorrect: interaction.options.getBoolean('reset_on_incorrect') ?? undefined,
          preventConsecutive: interaction.options.getBoolean('prevent_consecutive') ?? undefined,
          resetOnEdit: interaction.options.getBoolean('reset_on_edit') ?? undefined,
          resetOnDelete: interaction.options.getBoolean('reset_on_delete') ?? undefined,
          ignoreNonNumbers: interaction.options.getBoolean('ignore_non_numbers') ?? undefined,
          allowExpressions: interaction.options.getBoolean('allow_expressions') ?? undefined,
          deleteInvalid: interaction.options.getBoolean('delete_invalid') ?? undefined,
          resetMessage: interaction.options.getString('reset_message') ?? undefined,
          milestoneInterval: interaction.options.getInteger('milestone_interval') ?? undefined,
          milestoneMessage: interaction.options.getString('milestone_message') ?? undefined,
          milestoneXp: interaction.options.getInteger('milestone_xp') ?? undefined,
          normalMessageXp: interaction.options.getBoolean('normal_message_xp') ?? undefined,
          acceptedReactionEmoji: interaction.options.getString('accepted_reaction') ?? undefined,
          failedReactionEmoji: interaction.options.getString('failed_reaction') ?? undefined
        });
        await logConfig(ctx, interaction, 'Counting Configuration Updated', `Channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not configured'}\nIgnore Non-Counting Messages: **${config.ignore_non_number_messages !== false ? 'Enabled' : 'Disabled'}**\nAccepted Reaction: **${config.accepted_reaction_emoji}**\nFailed Reaction: **${config.failed_reaction_emoji}**`);
        await games.refreshGamePanels(ctx.client, interaction.guildId).catch(() => {});
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Counting Configuration Saved', `Counting channel: ${config.channel_id ? `<#${config.channel_id}>` : '**not configured**'}\nCurrent number: **${config.current_number}**\nNon-counting messages are **${config.ignore_non_number_messages !== false ? 'ignored' : 'treated as invalid'}**.\nAccepted reaction: **${config.accepted_reaction_emoji}**\nFailed reaction: **${config.failed_reaction_emoji}**`)] });
      }

      if (sub === 'enable' || sub === 'disable') {
        const enabled = sub === 'enable';
        const result = await games.setGameEnabled(interaction.guildId, GAME_KEYS.COUNTING, enabled);
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Counting Not Enabled', result.reason)] });
        await logConfig(ctx, interaction, `Counting ${enabled ? 'Enabled' : 'Disabled'}`, `Status: **${enabled ? 'Enabled' : 'Disabled'}**`);
        await games.refreshGamePanels(ctx.client, interaction.guildId).catch(() => {});
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Counting ${enabled ? 'Enabled' : 'Disabled'}`, `The Counting game is now **${enabled ? 'enabled' : 'disabled'}**.`)] });
      }

      if (sub === 'status') return replyPrivate(interaction, { embeds: [buildCountingStatusEmbed(await games.getCountingConfig(interaction.guildId))] });

      if (sub === 'reset') {
        if (!interaction.options.getBoolean('confirm', true)) return replyPrivate(interaction, { embeds: [createWarningEmbed('Confirmation Required', 'Set `confirm` to true to reset the count.')] });
        const nextNumber = interaction.options.getInteger('next_number');
        const config = await games.resetCounting(interaction.guildId, nextNumber);
        const next = BigInt(config.current_number || 0) + 1n;
        await logConfig(ctx, interaction, 'Counting Game Reset', `Next Number: **${next.toString()}**`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Counting Game Reset', `The next counting entry is **${next.toString()}**. The highest record was preserved.`)] });
      }

      if (sub === 'set-number') {
        const number = interaction.options.getInteger('number', true);
        const config = await games.setCountingNumber(interaction.guildId, number);
        await logConfig(ctx, interaction, 'Counting Number Corrected', `Current Number: **${config.current_number}**`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Counting Number Updated', `The current accepted number is **${config.current_number}**. The next entry is **${(BigInt(config.current_number) + 1n).toString()}**.`)] });
      }

      if (sub === 'leaderboard') {
        return replyPublic(interaction, { embeds: [buildCountingLeaderboardEmbed(await games.getCountingLeaderboard(interaction.guildId, 10))] });
      }

      if (sub === 'ignored-role-add' || sub === 'ignored-role-remove') {
        const role = interaction.options.getRole('role', true);
        const adding = sub.endsWith('add');
        if (adding) await games.addCountingIgnoredRole(interaction.guildId, role.id);
        else await games.removeCountingIgnoredRole(interaction.guildId, role.id);
        await logConfig(ctx, interaction, 'Counting Ignore List Updated', `Role: ${role}\nAction: **${adding ? 'Added' : 'Removed'}**`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Counting Ignore List Updated', `${role} was **${adding ? 'added to' : 'removed from'}** the counting ignore list.`)] });
      }

      if (sub === 'ignored-user-add' || sub === 'ignored-user-remove') {
        const user = interaction.options.getUser('user', true);
        const adding = sub.endsWith('add');
        if (adding) await games.addCountingIgnoredUser(interaction.guildId, user.id);
        else await games.removeCountingIgnoredUser(interaction.guildId, user.id);
        await logConfig(ctx, interaction, 'Counting Ignore List Updated', `User: <@${user.id}>\nAction: **${adding ? 'Added' : 'Removed'}**`);
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Counting Ignore List Updated', `<@${user.id}> was **${adding ? 'added to' : 'removed from'}** the counting ignore list.`)] });
      }
    }

    const gameKey = group === 'tic-tac-toe' ? GAME_KEYS.TIC_TAC_TOE : GAME_KEYS.CONNECT_FOUR;
    const label = group === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Connect Four';

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const allowAny = interaction.options.getBoolean('allow_any_channel');
      if (channel && allowAny) return replyPrivate(interaction, { embeds: [createWarningEmbed('Choose One Channel Setting', 'Provide a channel or set `allow_any_channel` to true, not both.')] });
      const config = await games.updateBoardGameConfig(interaction.guildId, gameKey, {
        channelId: allowAny ? null : channel?.id,
        winXp: interaction.options.getInteger('win_xp') ?? undefined
      });
      await logConfig(ctx, interaction, `${label} Configuration Updated`, `Allowed Channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Any text channel'}\nWin XP: **${config.win_xp}**\nDraw XP: **${Math.floor(Number(config.win_xp || 0) / 2)}** each`);
      await games.refreshGamePanels(ctx.client, interaction.guildId).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed(`${label} Configuration Saved`, `${label} challenges can be started in ${config.channel_id ? `<#${config.channel_id}>` : '**any text channel**'}.\nWin XP: **${config.win_xp}**\nDraw XP: **${Math.floor(Number(config.win_xp || 0) / 2)}** each.`)] });
    }

    if (sub === 'enable' || sub === 'disable') {
      const enabled = sub === 'enable';
      await games.setGameEnabled(interaction.guildId, gameKey, enabled);
      await logConfig(ctx, interaction, `${label} ${enabled ? 'Enabled' : 'Disabled'}`, `Status: **${enabled ? 'Enabled' : 'Disabled'}**`);
      await games.refreshGamePanels(ctx.client, interaction.guildId).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed(`${label} ${enabled ? 'Enabled' : 'Disabled'}`, `${label} is now **${enabled ? 'enabled' : 'disabled'}**.`)] });
    }

    if (sub === 'stats') {
      const user = interaction.options.getUser('user') || interaction.user;
      return replyPrivate(interaction, { embeds: [buildGameStatsEmbed(user, gameKey, await games.getGameStats(interaction.guildId, user.id, gameKey))] });
    }

    if (sub === 'challenge') {
      const opponent = interaction.options.getUser('opponent', true);
      const result = await games.createChallenge({ interaction, gameKey, opponent });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed(`${label} Challenge Not Started`, result.reason)] });
      await replyPublic(interaction, games.buildChallengePayload(result.session));
      const message = await interaction.fetchReply();
      await games.attachSessionMessage(result.session.id, message.id);
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'community-game-started',
        title: `${label} Challenge Created`,
        body: `Challenger: <@${interaction.user.id}>\nOpponent: <@${opponent.id}>\nChannel: <#${interaction.channelId}>`,
        actorUserId: interaction.user.id,
        metadata: { game: gameKey, sessionId: result.session.id }
      }).catch(() => {});
    }
  }
};

async function logConfig(ctx, interaction, title, body) {
  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'community-game-config',
    title,
    body: `${body}\nUpdated By: <@${interaction.user.id}>`,
    actorUserId: interaction.user.id
  }).catch(() => {});
}
