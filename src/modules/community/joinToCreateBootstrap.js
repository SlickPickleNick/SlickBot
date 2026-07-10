const { Client, Events } = require('discord.js');
const { PermissionService } = require('../permissions/permissionService');
const { LoggingService } = require('../logging/loggingService');
const { ModuleKeys } = require('../moduleRegistry');
const { JoinToCreateService } = require('./joinToCreateService');

const PATCHED = Symbol.for('slickbot.joinToCreate.clientPatched');
const ATTACHED = Symbol.for('slickbot.joinToCreate.listenersAttached');

function installJoinToCreateBootstrap() {
  if (Client.prototype[PATCHED]) return;
  Client.prototype[PATCHED] = true;

  const originalLogin = Client.prototype.login;
  Client.prototype.login = function patchedLogin(...args) {
    if (!this[ATTACHED]) {
      this[ATTACHED] = true;
      const permissions = new PermissionService();
      const logger = new LoggingService(this);
      const voiceRooms = new JoinToCreateService();

      this.once(Events.ClientReady, async (readyClient) => {
        await voiceRooms.ensureSchema().catch((error) => {
          console.error('Failed to initialize Join-to-Create schema:', error);
        });

        for (const guild of readyClient.guilds.cache.values()) {
          const enabled = await permissions.isModuleEnabled(guild.id, ModuleKeys.JOIN_TO_CREATE).catch(() => false);
          if (!enabled) continue;
          await voiceRooms.cleanupGuild(guild, logger).catch((error) => {
            console.error(`Failed to clean Join-to-Create rooms for ${guild.name}:`, error);
          });
        }
      });

      this.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const guild = newState.guild || oldState.guild;
        const member = newState.member || oldState.member;
        if (!guild || !member || member.user?.bot) return;

        try {
          await permissions.ensureGuildConfig(guild.id, guild.name);
          const enabled = await permissions.isModuleEnabled(guild.id, ModuleKeys.JOIN_TO_CREATE);
          if (!enabled) return;
          if (await permissions.isIgnored(guild.id, member.id)) return;
          await voiceRooms.handleVoiceStateUpdate(oldState, newState, logger);
        } catch (error) {
          console.error('Join-to-Create voice-state handling failed:', error);
          await logger.writeAudit({
            guildId: guild.id,
            actorUserId: member.id,
            actionKey: 'join-to-create.voice-state.failed',
            severity: 'ERROR',
            summary: 'Join-to-Create voice-state handling failed.',
            metadata: { error: error instanceof Error ? error.message : String(error) }
          }).catch(() => {});
        }
      });
    }

    return originalLogin.apply(this, args);
  };
}

installJoinToCreateBootstrap();

module.exports = { installJoinToCreateBootstrap };
