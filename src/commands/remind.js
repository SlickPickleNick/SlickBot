const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService, parseDurationToMs } = require('../modules/utility/utilityService');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set and manage persistent personal reminders.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set a new reminder.')
        .addStringOption((option) =>
          option.setName('duration').setDescription('When to remind you (e.g. 10m, 2h, 1d, 1w).').setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('reminder').setDescription('What to remind you about.').setRequired(true).setMaxLength(500)
        )
        .addStringOption((option) =>
          option
            .setName('destination')
            .setDescription('Where to deliver the reminder (default: Direct Message).')
            .setRequired(false)
            .addChoices(
              { name: 'Direct Message (DM)', value: 'DM' },
              { name: 'This Channel (Ping)', value: 'CHANNEL' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('View your active pending reminders.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel an active reminder.')
        .addStringOption((option) =>
          option.setName('id').setDescription('Reminder ID to cancel.').setRequired(true)
        )
    ),
  actionKey: ActionKeys.UtilityRemindUse,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    if (sub === 'set') {
      const durationStr = interaction.options.getString('duration', true);
      const reminderText = interaction.options.getString('reminder', true);
      const destination = interaction.options.getString('destination', false) || 'DM';

      const durationMs = parseDurationToMs(durationStr);
      if (!durationMs) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Invalid Duration', 'Please provide a valid time such as `30s`, `10m`, `2h`, `1d`, or `1w`.')]
        });
      }

      try {
        const { reminder, dueAt } = await utility.setReminder(interaction.guildId, interaction.user, interaction.channelId, {
          durationMs,
          reminderText,
          destinationType: destination
        });

        const dueSec = Math.floor(dueAt.getTime() / 1000);
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed(
            '⏰ Reminder Set',
            `I will remind you <t:${dueSec}:R> (<t:${dueSec}:F>) via **${destination === 'DM' ? 'Direct Message' : 'this channel'}**.\n\n**Note:** "${reminderText}"\n**Reminder ID:** \`${reminder.id}\``
          )]
        });
      } catch (err) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Reminder Failed', err.message || 'Could not schedule reminder.')]
        });
      }
    }

    if (sub === 'list') {
      const reminders = await utility.getUserReminders(interaction.guildId, interaction.user.id);
      if (!reminders.length) {
        return replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: '⏰ Your Reminders',
            description: 'You have no active pending reminders. Use `/remind set` to create one!',
            color: SlickBotColors.INFO
          })]
        });
      }

      const lines = reminders.map((r) => {
        const dueSec = Math.floor(new Date(r.due_at).getTime() / 1000);
        return `• **"${r.reminder_text}"**\n  └ Due: <t:${dueSec}:R> (<t:${dueSec}:F>) · Delivery: \`${r.destination_type}\` · ID: \`${r.id}\``;
      });

      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: '⏰ Your Active Reminders',
          description: lines.join('\n\n'),
          color: SlickBotColors.PRIMARY
        })]
      });
    }

    if (sub === 'cancel') {
      const id = interaction.options.getString('id', true);
      const cancelled = await utility.cancelReminder(id, interaction.user.id);
      if (!cancelled) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Not Found', 'No active reminder with that ID belongs to you.')]
        });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Reminder Cancelled', `Reminder \`${id}\` was successfully cancelled.`)]
      });
    }
  }
};
