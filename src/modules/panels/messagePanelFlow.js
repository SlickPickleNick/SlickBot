const { ButtonStyle } = require('discord.js');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { updatePanelDesign, normalizeHexColor } = require('./panelDesignService');
const rolePanels = require('../community/rolePanelService');
const { refreshPublishedPanelFromResult, formatRefreshSummary } = require('./panelUpdateService');

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (['skip', 'none', 'blank'].includes(text.toLowerCase())) return null;
  return String(value || '').replace(/^```(?:\w+)?\n?/, '').replace(/```$/, '').trimEnd();
}

function normalizeCancel(value) {
  return ['cancel', 'stop', 'abort'].includes(String(value || '').trim().toLowerCase());
}

async function sendFlowMessage(channel, title, description, color = SlickBotColors.PRIMARY) {
  return channel.send({ embeds: [createBaseEmbed({ title, description, color, footer: 'SlickBot Guided Setup' })] });
}

async function waitForUserMessage(interaction, prompt) {
  const channel = interaction.channel;
  if (!channel || typeof channel.awaitMessages !== 'function') {
    return { cancelled: true, reason: 'This channel does not support guided setup messages.' };
  }

  await sendFlowMessage(channel, prompt.title, prompt.description, prompt.color || SlickBotColors.PRIMARY);

  const collected = await channel.awaitMessages({
    filter: (message) => message.author.id === interaction.user.id,
    max: 1,
    time: FLOW_TIMEOUT_MS,
    errors: ['time']
  }).catch(() => null);

  const message = collected?.first?.() || null;
  if (!message) return { cancelled: true, reason: 'Guided setup timed out.' };
  if (normalizeCancel(message.content)) return { cancelled: true, reason: 'Guided setup cancelled.' };
  return { value: message.content, message };
}

async function startPanelMessageFlow(interaction, { target, name = null, logger = null }) {
  await interaction.reply({ embeds: [createBaseEmbed({
    title: 'Panel Builder Started',
    description: [
      'Reply to each prompt in this setup channel.',
      'Line breaks and spacing will be preserved for panel descriptions.',
      '',
      'Type `skip` for optional fields.',
      'Type `cancel` at any time to stop.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Panel Builder'
  })] });

  const existingPanel = await rolePanels.getPanelByName(interaction.guildId, name);

  const title = await waitForUserMessage(interaction, {
    title: 'Step 1 — Panel Title',
    description: 'Send the title for this panel. Type `skip` to keep the current/default title.'
  });
  if (title.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Builder Stopped', title.reason)] });

  const description = await waitForUserMessage(interaction, {
    title: 'Step 2 — Panel Description',
    description: [
      'Send the full panel description.',
      'Multiline spacing is supported. You can paste a full formatted description here.',
      '',
      'Type `skip` to keep the current/default description.'
    ].join('\n')
  });
  if (description.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Builder Stopped', description.reason)] });

  const color = await waitForUserMessage(interaction, {
    title: 'Step 3 — Accent Color',
    description: 'Send a hex color such as `#7869ff`. Type `skip` to keep the current/default color.'
  });
  if (color.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Builder Stopped', color.reason)] });

  const displayMode = await waitForUserMessage(interaction, {
    title: 'Step 4 — Panel Display Mode',
    description: 'Send `buttons` or `dropdown`. Type `skip` to keep the current/default mode. Buttons are the default.'
  });
  if (displayMode.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Builder Stopped', displayMode.reason)] });

  const result = await updatePanelDesign({
    guildId: interaction.guildId,
    target,
    name,
    title: normalizeOptionalText(title.value),
    description: normalizeOptionalText(description.value),
    color: normalizeOptionalText(color.value),
    displayMode: normalizeOptionalText(displayMode.value)
  });

  if (!result.ok) {
    return interaction.channel.send({ embeds: [createWarningEmbed('Panel Not Updated', result.reason)] });
  }

  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'panel-config',
    title: 'Panel Design Updated',
    body: `Panel: **${result.target}**\nUpdated By: <@${interaction.user.id}>`,
    actorUserId: interaction.user.id,
    metadata: { target, name }
  }).catch(() => {});

  const refresh = await refreshPublishedPanelFromResult(interaction.client, interaction.guildId, result).catch(() => null);
  return interaction.channel.send({ embeds: [createSuccessEmbed('Panel Updated', `Updated **${result.target}**.${formatRefreshSummary(refresh) || '\nFuture posted panels will use the new design.'}`)] });
}


async function startPanelFieldEditFlow(interaction, { target, name = null, field, logger = null }) {
  const fieldLabel = String(field || '').trim().toLowerCase();
  const prompts = {
    title: 'Send the new panel title. Type `skip` to leave it unchanged.',
    description: 'Send the new panel description. Multiline spacing is supported. Type `skip` to leave it unchanged.',
    color: 'Send a hex color such as `#7869ff`. Type `skip` to leave it unchanged.',
    display_mode: 'Send `buttons` or `dropdown`. Type `skip` to leave it unchanged.'
  };

  if (!prompts[fieldLabel]) {
    return interaction.reply({ embeds: [createWarningEmbed('Unknown Field', 'Choose title, description, color, or display_mode.')], ephemeral: true });
  }

  await interaction.reply({ embeds: [createBaseEmbed({
    title: `Panel Field Editor — ${fieldLabel.replace('_', ' ')}`,
    description: [
      'Reply in this setup channel with only the field you want to change.',
      'Other panel fields will be preserved.',
      '',
      prompts[fieldLabel],
      '',
      'Type `cancel` to stop.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Panel Editor'
  })] });

  const response = await waitForUserMessage(interaction, {
    title: `Edit ${fieldLabel.replace('_', ' ')}`,
    description: prompts[fieldLabel]
  });
  if (response.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Edit Stopped', response.reason)] });

  const value = normalizeOptionalText(response.value);
  const payload = { guildId: interaction.guildId, target, name };
  if (fieldLabel === 'title') payload.title = value;
  if (fieldLabel === 'description') payload.description = value;
  if (fieldLabel === 'color') payload.color = value;
  if (fieldLabel === 'display_mode') payload.displayMode = value;

  const result = await updatePanelDesign(payload);
  if (!result.ok) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Not Updated', result.reason)] });

  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'panel-config',
    title: 'Panel Field Updated',
    body: `Panel: **${result.target}**\nField: **${fieldLabel}**\nUpdated By: <@${interaction.user.id}>`,
    actorUserId: interaction.user.id,
    metadata: { target, name, field: fieldLabel }
  }).catch(() => {});

  const refresh = await refreshPublishedPanelFromResult(interaction.client, interaction.guildId, result).catch(() => null);
  return interaction.channel.send({ embeds: [createSuccessEmbed('Panel Field Updated', `Updated **${fieldLabel.replace('_', ' ')}** for **${result.target}**.${formatRefreshSummary(refresh) || '\nFuture posted panels will use the new setting.'}`)] });
}

async function startRolePanelCreationFlow(interaction, { logger = null, initialName = null }) {
  await interaction.reply({ embeds: [createBaseEmbed({
    title: 'Role Panel Builder Started',
    description: [
      'Reply to each prompt in this setup channel.',
      'Line breaks are preserved for the panel description.',
      '',
      'Type `skip` for optional fields.',
      'Type `cancel` at any time to stop.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Role Panel Builder'
  })] });

  let name = initialName ? String(initialName).trim() : null;
  if (!name) {
    const nameResponse = await waitForUserMessage(interaction, {
      title: 'Step 1 — Internal Panel Name',
      description: 'Send the internal name for this role panel. Example: `Game Roles` or `Color Roles`.'
    });
    if (nameResponse.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', nameResponse.reason)] });
    name = normalizeOptionalText(nameResponse.value);
  }

  if (!name) return interaction.channel.send({ embeds: [createWarningEmbed('Panel Name Required', 'A role panel needs an internal name.')] });

  const existingPanel = await rolePanels.getPanelByName(interaction.guildId, name);

  const title = await waitForUserMessage(interaction, {
    title: 'Step 2 — Public Panel Title',
    description: existingPanel ? `Send the public title for this panel. Current: **${existingPanel.title || name}**. Type \`skip\` to keep it.` : 'Send the public title for this panel. Type `skip` to use the internal panel name.'
  });
  if (title.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', title.reason)] });

  const description = await waitForUserMessage(interaction, {
    title: 'Step 3 — Public Panel Description',
    description: [
      'Send the full public description for this panel.',
      'Multiline spacing is supported.',
      '',
      existingPanel ? 'Type `skip` to keep the current description.' : 'Type `skip` to use the default description.'
    ].join('\n')
  });
  if (description.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', description.reason)] });

  const mode = await waitForUserMessage(interaction, {
    title: 'Step 4 — Selection Mode',
    description: existingPanel ? `Send \`multi\` or \`single\`. Current: **${existingPanel.mode || 'MULTI'}**. Type \`skip\` to keep it.` : 'Send `multi` for multiple roles or `single` for one role at a time. Type `skip` for multi.'
  });
  if (mode.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', mode.reason)] });

  const color = await waitForUserMessage(interaction, {
    title: 'Step 5 — Accent Color',
    description: existingPanel ? `Send a hex color such as \`#7869ff\`. Current: **${existingPanel.accent_color || '#7869ff'}**. Type \`skip\` to keep it.` : 'Send a hex color such as `#7869ff`. Type `skip` to use the default SlickBot accent.'
  });
  if (color.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', color.reason)] });

  const displayMode = await waitForUserMessage(interaction, {
    title: 'Step 6 — Panel Display Mode',
    description: existingPanel ? `Send \`buttons\` or \`dropdown\`. Current: **${existingPanel.panel_display_mode || 'BUTTONS'}**. Type \`skip\` to keep it.` : 'Send `buttons` or `dropdown`. Type `skip` for buttons.'
  });
  if (displayMode.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Role Panel Builder Stopped', displayMode.reason)] });

  const normalizedMode = normalizeOptionalText(mode.value);
  const normalizedDisplayMode = normalizeOptionalText(displayMode.value);
  const modeValue = normalizedMode ? (String(normalizedMode).toLowerCase().startsWith('single') ? 'SINGLE' : 'MULTI') : (existingPanel?.mode || 'MULTI');
  const displayModeValue = normalizedDisplayMode ? (String(normalizedDisplayMode).toLowerCase().startsWith('drop') ? 'DROPDOWN' : 'BUTTONS') : (existingPanel?.panel_display_mode || 'BUTTONS');
  const panel = await rolePanels.createPanel({
    guildId: interaction.guildId,
    name,
    title: normalizeOptionalText(title.value) || existingPanel?.title || name,
    description: normalizeOptionalText(description.value) ?? existingPanel?.description ?? undefined,
    mode: modeValue,
    color: normalizeOptionalText(color.value) || existingPanel?.accent_color || undefined,
    displayMode: displayModeValue
  });

  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'reaction-role-config',
    title: 'Role Panel Saved',
    body: `Panel: **${panel.name}**\nUpdated By: <@${interaction.user.id}>`,
    actorUserId: interaction.user.id
  }).catch(() => {});

  const refresh = await rolePanels.updatePublishedRolePanelMessages(interaction.client, interaction.guildId, panel).catch(() => null);
  return interaction.channel.send({ embeds: [createSuccessEmbed('Role Panel Saved', `Panel **${panel.name}** is ready. Use \`/roles bulk-add-wizard panel:${panel.name}\` to add role buttons through guided setup.${formatRefreshSummary(refresh)}`)] });
}

async function startRoleBulkAddFlow(interaction, { panelName, logger = null }) {
  const panel = await rolePanels.getPanelByName(interaction.guildId, panelName);
  if (!panel) {
    return interaction.reply({ embeds: [createWarningEmbed('Panel Not Found', 'Create the panel first with `/roles panel-wizard` or `/roles create-panel`.')], ephemeral: true });
  }

  await interaction.reply({ embeds: [createBaseEmbed({
    title: 'Bulk Role Button Setup Started',
    description: [
      `Panel: **${panel.name}**`,
      '',
      'Paste all role options in one message, one per line.',
      '',
      '**Format**',
      '`@Role | Button Label | Emoji | #hex`',
      '',
      '**Blank text buttons**',
      'Leave the label blank if you want an icon-only or blank-label button:',
      '`@Red || | #ff0000`',
      '',
      'SlickBot will not add an emoji unless you include one in the entry.',
      '',
      'Type `cancel` to stop.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Bulk Role Builder'
  })] });

  const response = await waitForUserMessage(interaction, {
    title: 'Paste Role Button Entries',
    description: 'Paste the role button entries now. Line breaks will be preserved and parsed one line at a time.'
  });
  if (response.cancelled) return interaction.channel.send({ embeds: [createWarningEmbed('Bulk Add Stopped', response.reason)] });

  const entries = rolePanels.parseBulkEntries(response.value);
  const valid = entries.filter((entry) => entry.valid);
  if (!valid.length) {
    return interaction.channel.send({ embeds: [createWarningEmbed('No Valid Role Entries', 'No valid role mentions or role IDs were found. Use role mentions or role IDs in the first column.')] });
  }

  const added = await rolePanels.bulkAddOptions({ guildId: interaction.guildId, panelName: panel.name, entries: valid });
  await logger?.log({
    guildId: interaction.guildId,
    eventKey: 'reaction-role-config',
    title: 'Role Options Bulk Added',
    body: `Panel: **${panel.name}**\nOptions Added: **${added.length}**`,
    actorUserId: interaction.user.id
  }).catch(() => {});

  const invalidCount = entries.length - valid.length;
  const refresh = await rolePanels.updatePublishedRolePanelMessages(interaction.client, interaction.guildId, panel).catch(() => null);
  return interaction.channel.send({ embeds: [createSuccessEmbed('Role Options Added', `Added **${added.length}** role option(s) to **${panel.name}**. Invalid/skipped lines: **${invalidCount}**.${formatRefreshSummary(refresh)}`)] });
}

module.exports = {
  startPanelMessageFlow,
  startRolePanelCreationFlow,
  startRoleBulkAddFlow,
  startPanelFieldEditFlow,
  normalizeHexColor
};
