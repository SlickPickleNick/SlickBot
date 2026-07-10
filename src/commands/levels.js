const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPublic } = require('../utils/reply');
const { LevelingService } = require('../modules/community/levelingService');

const leveling = new LevelingService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Learn how SlickBot leveling works.')
    .addSubcommand((sub) => sub.setName('info').setDescription('Post the server leveling information panel.')),
  moduleKey: ModuleKeys.LEVELING,
  actionKey: ActionKeys.LevelingUse,
  isPublic() {
    return true;
  },
  async execute(interaction) {
    const embed = await leveling.buildInfoEmbed(interaction.guild);
    await replyPublic(interaction, { embeds: [embed] });
  }
};
