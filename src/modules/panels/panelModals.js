const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { CustomIds } = require('../ui/customIds');

function encodePart(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function decodePart(value) {
  try { return Buffer.from(String(value || ''), 'base64url').toString('utf8'); } catch { return ''; }
}

function buildPanelDesignModal(target, name = '') {
  const label = name ? `${target}: ${name}` : target;
  return new ModalBuilder()
    .setCustomId(`${CustomIds.PanelDesignModalPrefix}${encodePart(target)}:${encodePart(name)}`)
    .setTitle(`Design ${String(label).slice(0, 32)} Panel`)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Panel title').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Panel description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3500)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Accent color, example #7869ff').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7))
    );
}

function parsePanelDesignModalId(customId) {
  const rest = customId.slice(CustomIds.PanelDesignModalPrefix.length);
  const [encodedTarget, encodedName = ''] = rest.split(':');
  return { target: decodePart(encodedTarget), name: decodePart(encodedName) };
}

module.exports = { buildPanelDesignModal, parsePanelDesignModalId };
