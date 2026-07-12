const { ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { FaqService } = require('../modules/community/faqService');

const faq = new FaqService();

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('FAQ Reply')
    .setType(ApplicationCommandType.Message),
  moduleKey: ModuleKeys.FAQ,
  actionKey: ActionKeys.FaqAnswer,
  async execute(interaction) {
    const targetMessage = interaction.targetMessage;
    await interaction.showModal(faq.buildAnswerModal(targetMessage.channelId, targetMessage.id));
  }
};
