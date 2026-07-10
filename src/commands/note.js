const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ModerationService } = require('../modules/moderation/moderationService');
const { buildNotesEmbed } = require('../modules/moderation/moderationUi');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const moderation = new ModerationService();
module.exports = {
  data: new SlashCommandBuilder().setName('note').setDescription('Manage private staff notes for users.')
    .addSubcommand((s) => s.setName('add').setDescription('Add a private moderation note to a user.').addUserOption((o) => o.setName('user').setDescription('User to add a note for.').setRequired(true)).addStringOption((o) => o.setName('note').setDescription('Note text.').setRequired(true).setMaxLength(1500)))
    .addSubcommand((s) => s.setName('list').setDescription('List active notes for a user.').addUserOption((o) => o.setName('user').setDescription('User to look up.').setRequired(true)).addIntegerOption((o) => o.setName('limit').setDescription('Number of notes to show.').setRequired(false).setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('remove').setDescription('Mark a user note as removed.').addIntegerOption((o) => o.setName('note_number').setDescription('Note number.').setRequired(true).setMinValue(1))),
  actionKey: ActionKeys.UserNotesView,
  moduleKey: ModuleKeys.MODERATION,
  getActionKey(interaction) { return ['add', 'remove'].includes(interaction.options.getSubcommand()) ? ActionKeys.UserNotesManage : ActionKeys.UserNotesView; },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'add') {
      const target = interaction.options.getUser('user', true);
      const noteText = interaction.options.getString('note', true);
      const note = await moderation.addUserNote({ guildId: interaction.guildId, targetUserId: target.id, targetUserTag: target.tag, actorUserId: interaction.user.id, note: noteText });
      await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.UserNotesManage, targetType: 'User', targetId: target.id, summary: `User note #${note.note_number} added for ${target.tag}.`, metadata: { noteNumber: note.note_number } });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'user-notes', title: `User Note #${note.note_number} Added`, body: [`Target: <@${target.id}>`, `Added By: <@${interaction.user.id}>`, '', noteText].join('\n'), metadata: { noteNumber: note.note_number, targetUserId: target.id, actorUserId: interaction.user.id } });
      return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'User Note Added', description: `Note **#${note.note_number}** added for <@${target.id}>.`, color: SlickBotColors.SUCCESS })] });
    }
    if (subcommand === 'list') {
      const target = interaction.options.getUser('user', true);
      return replyPrivate(interaction, { embeds: [buildNotesEmbed(target, await moderation.listUserNotes(interaction.guildId, target.id, false, interaction.options.getInteger('limit') || 10))] });
    }
    const noteNumber = interaction.options.getInteger('note_number', true);
    const note = await moderation.removeUserNote(interaction.guildId, noteNumber, interaction.user.id);
    if (!note) return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Note Not Found', description: `No note found for #${noteNumber}.`, color: SlickBotColors.WARNING })] });
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.UserNotesManage, targetType: 'UserNote', targetId: String(noteNumber), summary: `User note #${noteNumber} removed.`, metadata: { targetUserId: note.target_user_id } });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'user-notes', title: `User Note #${noteNumber} Removed`, body: [`Target: <@${note.target_user_id}>`, `Removed By: <@${interaction.user.id}>`].join('\n'), metadata: { noteNumber, targetUserId: note.target_user_id, actorUserId: interaction.user.id } });
    return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'User Note Removed', description: `Note **#${noteNumber}** was marked as removed.`, color: SlickBotColors.INFO })] });
  }
};
