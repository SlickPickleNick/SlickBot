const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService, parseDurationToMs } = require('../modules/utility/utilityService');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { query } = require('../services/db');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage interactive community polls.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new interactive poll.')
        .addStringOption((option) =>
          option.setName('question').setDescription('The poll question or topic.').setRequired(true).setMaxLength(256)
        )
        .addStringOption((option) =>
          option.setName('option1').setDescription('First option.').setRequired(true).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option2').setDescription('Second option.').setRequired(true).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option3').setDescription('Third option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option4').setDescription('Fourth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option5').setDescription('Fifth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option6').setDescription('Sixth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option7').setDescription('Seventh option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option8').setDescription('Eighth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option9').setDescription('Ninth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('option10').setDescription('Tenth option.').setRequired(false).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('Poll duration (e.g. 30m, 2h, 1d, 1w). Leave blank for permanent.').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('multiple_votes').setDescription('Allow members to select more than one choice.').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('anonymous').setDescription('Hide voter identities from results.').setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('input_style')
            .setDescription('Voting interface style.')
            .setRequired(false)
            .addChoices(
              { name: 'Automatic (Buttons for ≤5, Dropdown for 6–10)', value: 'AUTO' },
              { name: 'Buttons', value: 'BUTTONS' },
              { name: 'Dropdown Menu', value: 'DROPDOWN' }
            )
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the poll in (defaults to current channel).')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End an active poll and finalize results.')
        .addStringOption((option) =>
          option.setName('poll_id').setDescription('The ID of the poll to end.').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List active polls in this server.')
    ),
  actionKey: ActionKeys.UtilityPollCreate,
  moduleKey: ModuleKeys.UTILITY,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'end') return ActionKeys.UtilityPollManage;
    if (sub === 'list') return ActionKeys.UtilityView;
    return ActionKeys.UtilityPollCreate;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    if (sub === 'create') {
      const question = interaction.options.getString('question', true);
      const durationStr = interaction.options.getString('duration', false);
      const multipleVotes = interaction.options.getBoolean('multiple_votes', false) ?? false;
      const anonymous = interaction.options.getBoolean('anonymous', false) ?? false;
      const inputStyle = interaction.options.getString('input_style', false) || 'AUTO';
      const targetChannel = interaction.options.getChannel('channel', false) || interaction.channel;

      const durationMs = durationStr ? parseDurationToMs(durationStr) : null;
      if (durationStr && !durationMs) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Invalid Duration', 'Please provide a valid duration such as `30m`, `2h`, `1d`, or `1w`.')]
        });
      }

      const options = [];
      for (let i = 1; i <= 10; i++) {
        const optText = interaction.options.getString(`option${i}`, false);
        if (optText && optText.trim()) {
          options.push({ label: optText.trim() });
        }
      }

      if (options.length < 2) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Too Few Options', 'You must provide at least 2 options for the poll.')]
        });
      }

      const { poll, message } = await utility.createPoll(interaction.guild, targetChannel, {
        creator: interaction.user,
        question,
        options,
        durationMs,
        multipleVotes,
        anonymous,
        inputStyle
      });

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('📊 Poll Launched', `Your poll was created in <#${targetChannel.id}>: [Jump to Poll](${message.url})\n**Poll ID:** \`${poll.id}\``)]
      });
    }

    if (sub === 'end') {
      const pollId = interaction.options.getString('poll_id', true);
      const pollRes = await query(`SELECT * FROM utility_polls WHERE id = $1 AND guild_id = $2`, [pollId, interaction.guildId]);
      if (!pollRes.rows.length) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Poll Not Found', 'No poll with that ID was found in this server.')]
        });
      }

      const poll = pollRes.rows[0];
      if (poll.status === 'CLOSED') {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Poll Already Closed', 'This poll has already ended.')]
        });
      }

      const hasManage = await ctx.permissions.canPerform(interaction.guildId, interaction.member, ActionKeys.UtilityPollManage);
      const isCreator = poll.creator_user_id === interaction.user.id;
      if (!hasManage && !isCreator) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Access Denied', 'Only the poll creator or staff can end this poll.')]
        });
      }

      await utility.closePoll(pollId, ctx.client, interaction.user);
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Poll Ended', `The poll **"${poll.question}"** has been closed and final results were updated.`)]
      });
    }

    if (sub === 'list') {
      const res = await query(
        `SELECT * FROM utility_polls WHERE guild_id = $1 AND status = 'OPEN' ORDER BY created_at DESC LIMIT 10`,
        [interaction.guildId]
      );

      if (!res.rows.length) {
        return replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: '📊 Active Polls',
            description: 'There are currently no open polls in this server.',
            color: SlickBotColors.INFO
          })]
        });
      }

      const lines = res.rows.map((p) => {
        const exp = p.expires_at ? `<t:${Math.floor(new Date(p.expires_at).getTime() / 1000)}:R>` : 'Never';
        return `• **"${p.question}"** in <#${p.channel_id}>\n  └ ID: \`${p.id}\` · Ends: ${exp}`;
      });

      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: '📊 Active Server Polls',
          description: lines.join('\n\n'),
          color: SlickBotColors.PRIMARY
        })]
      });
    }
  }
};
