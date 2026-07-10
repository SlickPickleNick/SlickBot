const { query } = require('../../services/db');
const { createBaseEmbed, createButtonRow, createPanelButton, ButtonStyle, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

function parseColor(value, fallback = SlickBotColors.PRIMARY) {
  const clean = String(value || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(clean) ? Number.parseInt(clean, 16) : fallback;
}
function applyPlaceholders(text, member) {
  return String(text || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user?.username || member.displayName || 'member')
    .replaceAll('{server}', member.guild?.name || 'the server')
    .replaceAll('{memberCount}', String(member.guild?.memberCount || 0));
}
async function getWelcomeConfig(guildId) {
  const r = await query('SELECT * FROM welcome_configs WHERE guild_id=$1 LIMIT 1', [guildId]);
  return r.rows[0] || null;
}
async function upsertWelcomeConfig(input) {
  const current = await getWelcomeConfig(input.guildId);
  const values = {
    channelId: input.channelId ?? current?.channel_id ?? null,
    enabled: input.enabled ?? current?.enabled ?? true,
    message: input.message ?? current?.message_template ?? null,
    title: input.title ?? current?.embed_title ?? 'Welcome to {server}',
    description: input.description ?? current?.embed_description ?? 'Glad to have you here, {user}.',
    color: input.color ?? current?.embed_color ?? '#7869ff',
    dmEnabled: input.dmEnabled ?? current?.dm_enabled ?? false,
    dmMessage: input.dmMessage ?? current?.dm_message_template ?? null
  };
  const r = await query(`INSERT INTO welcome_configs(guild_id,channel_id,enabled,message_template,embed_title,embed_description,embed_color,dm_enabled,dm_message_template)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,enabled=EXCLUDED.enabled,message_template=EXCLUDED.message_template,embed_title=EXCLUDED.embed_title,embed_description=EXCLUDED.embed_description,embed_color=EXCLUDED.embed_color,dm_enabled=EXCLUDED.dm_enabled,dm_message_template=EXCLUDED.dm_message_template,updated_at=NOW() RETURNING *`,
  [input.guildId,values.channelId,values.enabled,values.message,values.title,values.description,values.color,values.dmEnabled,values.dmMessage]);
  return r.rows[0];
}
async function addAutoRole(guildId, roleId, actorUserId=null) { await query(`INSERT INTO welcome_auto_roles(guild_id,role_id,added_by_user_id,active) VALUES($1,$2,$3,true) ON CONFLICT(guild_id,role_id) DO UPDATE SET active=true,added_by_user_id=EXCLUDED.added_by_user_id,updated_at=NOW()`,[guildId,roleId,actorUserId]); }
async function removeAutoRole(guildId, roleId) { await query(`UPDATE welcome_auto_roles SET active=false,updated_at=NOW() WHERE guild_id=$1 AND role_id=$2`,[guildId,roleId]); }
async function listAutoRoles(guildId) { const r=await query(`SELECT role_id FROM welcome_auto_roles WHERE guild_id=$1 AND active=true ORDER BY created_at`,[guildId]); return r.rows.map(x=>x.role_id); }
async function handleMemberJoin(member, logger) {
  const [config, roleIds] = await Promise.all([getWelcomeConfig(member.guild.id), listAutoRoles(member.guild.id)]);
  for (const roleId of roleIds) await member.roles.add(roleId,'SlickBot welcome auto role').catch(()=>{});
  if (config?.enabled && config.channel_id) {
    const channel=await member.guild.channels.fetch(config.channel_id).catch(()=>null);
    if (channel?.send) await channel.send({content:config.message_template?applyPlaceholders(config.message_template,member):null,embeds:[createBaseEmbed({title:applyPlaceholders(config.embed_title||'Welcome to {server}',member),description:applyPlaceholders(config.embed_description||'Glad to have you here, {user}.',member),color:parseColor(config.embed_color),footer:'SlickBot Welcome'})]}).catch(()=>{});
  }
  if(config?.dm_enabled&&config.dm_message_template) await member.send(applyPlaceholders(config.dm_message_template,member)).catch(()=>{});
  await logger?.log({guildId:member.guild.id,eventKey:'welcome-member',title:'Member Welcome Processed',body:`Member: <@${member.id}>\nAuto Roles: **${roleIds.length}**`,actorUserId:member.id}).catch(()=>{});
}
async function buildWelcomePanel(guildId){const [c,roles]=await Promise.all([getWelcomeConfig(guildId),listAutoRoles(guildId)]);return{embeds:[createBaseEmbed({title:'Welcome & Auto Roles',description:[`Status: **${c?.enabled?'Enabled':'Disabled'}**`,`Channel: ${c?.channel_id?`<#${c.channel_id}>`:'Not set'}`,`DM Welcome: **${c?.dm_enabled?'Enabled':'Disabled'}**`,`Auto Roles: **${roles.length}**`,roles.length?roles.map(id=>`• <@&${id}>`).join('\n'):'No auto roles configured.'].join('\n'),color:c?.enabled?SlickBotColors.PRIMARY:SlickBotColors.WARNING})],components:[createButtonRow([createPanelButton(CustomIds.WelcomeRefresh,'Refresh',ButtonStyle.Secondary,'🔄'),createPanelButton(CustomIds.SetupCommunity,'Back',ButtonStyle.Secondary,'↩️')])]};}
module.exports={parseColor,applyPlaceholders,getWelcomeConfig,upsertWelcomeConfig,addAutoRole,removeAutoRole,listAutoRoles,handleMemberJoin,buildWelcomePanel};
