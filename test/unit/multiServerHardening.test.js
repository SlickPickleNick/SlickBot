const test = require('node:test');
const assert = require('node:assert/strict');

const { PermissionService } = require('../../src/modules/permissions/permissionService');
const { AutoModService } = require('../../src/modules/moderation/autoModService');
const { ServerStatsService } = require('../../src/modules/community/serverStatsService');
const { StatusService } = require('../../src/modules/status/statusService');
const { BirthdayService } = require('../../src/modules/community/birthdayService');
const { JoinCreateService } = require('../../src/modules/voice/joinCreateService');
const { LevelingService } = require('../../src/modules/community/levelingService');

test('Multi-Server Scalability & Cache Eviction Suite', async (t) => {
  await t.test('PermissionService.invalidateGuild clears targeted guild caches', () => {
    const service = new PermissionService();
    service.seededGuilds.add('guild-1');
    service.seededGuilds.add('guild-2');
    service.ignoredUsersCache.set('guild-1', new Set(['user-1']));
    service.moduleEnabledCache.set('guild-1', new Map([['MODERATION', true]]));
    service.requiredLevelCache.set('guild-1:moderation.ban', 3);
    service.requiredLevelCache.set('guild-2:moderation.ban', 3);

    service.invalidateGuild('guild-1');

    assert.equal(service.seededGuilds.has('guild-1'), false);
    assert.equal(service.seededGuilds.has('guild-2'), true);
    assert.equal(service.ignoredUsersCache.has('guild-1'), false);
    assert.equal(service.moduleEnabledCache.has('guild-1'), false);
    assert.equal(service.requiredLevelCache.has('guild-1:moderation.ban'), false);
    assert.equal(service.requiredLevelCache.has('guild-2:moderation.ban'), true);
  });

  await t.test('AutoModService.invalidateGuild evicts guild caches and history', () => {
    const autoMod = new AutoModService();
    autoMod.configCache.set('guild-1', { enabled: true });
    autoMod.blacklistCache.set('guild-1', ['badword']);
    autoMod.joinHistory.set('guild-1', [Date.now()]);
    autoMod.messageHistory.set('guild-1:user-1', [Date.now()]);
    autoMod.messageHistory.set('guild-2:user-2', [Date.now()]);

    autoMod.invalidateGuild('guild-1');

    assert.equal(autoMod.configCache.has('guild-1'), false);
    assert.equal(autoMod.blacklistCache.has('guild-1'), false);
    assert.equal(autoMod.joinHistory.has('guild-1'), false);
    assert.equal(autoMod.messageHistory.has('guild-1:user-1'), false);
    assert.equal(autoMod.messageHistory.has('guild-2:user-2'), true);
  });

  await t.test('ServerStatsService.invalidateGuild clears pending timer updates', () => {
    const service = new ServerStatsService();
    let fired = false;
    const timer = setTimeout(() => { fired = true; }, 10000);
    service.pendingUpdates.set('guild-1:member join', timer);

    service.invalidateGuild('guild-1');

    assert.equal(service.pendingUpdates.has('guild-1:member join'), false);
    clearTimeout(timer);
    assert.equal(fired, false);
  });

  await t.test('LevelingService.invalidateGuild evicts config, multipliers, and cooldowns', () => {
    const leveling = new LevelingService();
    leveling.configCache.set('guild-1', { enabled: true });
    leveling.multiplierCache.set('guild-1', []);
    leveling.cooldownCache.set('guild-1:user-1', Date.now());
    leveling.cooldownCache.set('guild-2:user-2', Date.now());

    leveling.invalidateGuild('guild-1');

    assert.equal(leveling.configCache.has('guild-1'), false);
    assert.equal(leveling.multiplierCache.has('guild-1'), false);
    assert.equal(leveling.cooldownCache.has('guild-1:user-1'), false);
    assert.equal(leveling.cooldownCache.has('guild-2:user-2'), true);
  });

  await t.test('StatusService.formatActivityText formats {serverCount}, {userCount}, and {help}', () => {
    const mockClient = {
      guilds: {
        cache: new Map([
          ['g1', { memberCount: 50 }],
          ['g2', { memberCount: 150 }]
        ])
      }
    };
    const status = new StatusService(mockClient);

    const formatted = status.formatActivityText('Serving {serverCount} servers with {userCount} members | {help}');
    assert.equal(formatted, 'Serving 2 servers with 200 members | /help');
  });

  await t.test('JoinCreateService.invalidateGuild clears timers and tracking', () => {
    const joinCreate = new JoinCreateService();
    joinCreate.recentCreates.set('guild-1', Date.now());
    joinCreate.recentCreates.set('guild-2', Date.now());

    joinCreate.invalidateGuild('guild-1');

    assert.equal(joinCreate.recentCreates.has('guild-1'), false);
    assert.equal(joinCreate.recentCreates.has('guild-2'), true);
  });

  await t.test('Invite command builds valid OAuth2 invite URLs and payload', () => {
    const { buildInviteUrl, buildInvitePayload } = require('../../src/commands/invite');
    const url = buildInviteUrl('123456789012345678');
    assert.ok(url.includes('client_id=123456789012345678'));
    assert.ok(url.includes('permissions=549755813950'));
    assert.ok(url.includes('scope=bot%20applications.commands'));

    const payload = buildInvitePayload('123456789012345678');
    assert.ok(payload.embeds?.length > 0);
    assert.ok(payload.components?.length > 0);
    assert.equal(payload.components[0].components.length, 2);
  });

  await t.test('Bot command defines info and invite subcommands and maps action keys', () => {
    const botCommand = require('../../src/commands/bot');
    const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
    
    assert.equal(botCommand.getActionKey({ options: { getSubcommand: () => 'info' } }), ActionKeys.BotInfo);
    assert.equal(botCommand.getActionKey({ options: { getSubcommand: () => 'invite' } }), ActionKeys.BotInvite);
    assert.equal(botCommand.getActionKey({ options: { getSubcommand: () => 'test' } }), ActionKeys.BotTest);
    assert.equal(botCommand.getActionKey({ options: { getSubcommand: () => 'version' } }), ActionKeys.BotVersion);
  });

  await t.test('PermissionService enforces BOT_OWNER restriction for StatusManage', async () => {
    const { PermissionService } = require('../../src/modules/permissions/permissionService');
    const { ActionKeys, PermissionLevels } = require('../../src/modules/permissions/actionKeys');
    const { ModuleKeys } = require('../../src/modules/moduleRegistry');
    const permissions = new PermissionService();
    permissions.seededGuilds.add('guild-1');
    permissions.requiredLevelCache.set('guild-1:status.manage:STATUS', PermissionLevels.BOT_OWNER);

    const nonOwnerInteraction = {
      guildId: 'guild-1',
      user: { id: 'random-user-id' },
      member: { roles: [] }
    };

    const check = await permissions.checkInteraction(nonOwnerInteraction, ActionKeys.StatusManage, ModuleKeys.STATUS);
    assert.equal(check.allowed, false);
    assert.ok(check.reason.includes('restricted to the global bot owner'));

    const botOwnerInteraction = {
      guildId: 'guild-1',
      user: { id: 'bot-owner-id' },
      member: { roles: [] }
    };
    // Mock isBotOwner to return true for this user
    permissions.isBotOwner = (id) => id === 'bot-owner-id';
    const ownerCheck = await permissions.checkInteraction(botOwnerInteraction, ActionKeys.StatusManage, ModuleKeys.STATUS);
    assert.equal(ownerCheck.allowed, true);
  });

  await t.test('Help system hides BOT_OWNER commands from non-owners', () => {
    const { getHelpAutocomplete, buildCategoryHelpPayload, buildCommandHelpPayload, buildModuleHelpPayload, handleHelpSearch } = require('../../src/modules/help/helpService');
    const { ModuleKeys } = require('../../src/modules/moduleRegistry');

    // Non-owner autocomplete
    const publicChoices = getHelpAutocomplete('command', 'status', { isBotOwner: false });
    assert.equal(publicChoices.some((c) => c.value === 'status'), false);

    // Bot owner autocomplete
    const ownerChoices = getHelpAutocomplete('command', 'status', { isBotOwner: true });
    assert.equal(ownerChoices.some((c) => c.value === 'status'), true);

    // Non-owner search
    const publicSearch = handleHelpSearch('status', { isBotOwner: false });
    assert.equal(publicSearch.embeds[0].data.description.includes('/status'), false);

    // Bot owner search
    const ownerSearch = handleHelpSearch('status', { isBotOwner: true });
    assert.equal(ownerSearch.embeds[0].data.description.includes('/status'), true);

    // Non-owner category view
    const publicHelp = buildCategoryHelpPayload('CORE', 'staff', 2, { isBotOwner: false });
    assert.equal(publicHelp.embeds[0].data.description.includes('/status'), false);

    // Bot owner category view
    const ownerHelp = buildCategoryHelpPayload('CORE', 'staff', 2, { isBotOwner: true });
    assert.equal(ownerHelp.embeds[0].data.description.includes('/status'), true);

    // Non-owner command inspect
    const publicCmd = buildCommandHelpPayload('status', { isBotOwner: false });
    assert.equal(publicCmd.embeds[0].data.title, 'Command Not Found');

    // Bot owner command inspect
    const ownerCmd = buildCommandHelpPayload('status', { isBotOwner: true });
    assert.ok(ownerCmd.embeds[0].data.title.includes('status'));

    // Non-owner module inspect
    const publicModule = buildModuleHelpPayload(ModuleKeys.STATUS, { isBotOwner: false });
    assert.equal(publicModule.embeds[0].data.title, 'Module Not Found');

    // Bot owner module inspect
    const ownerModule = buildModuleHelpPayload(ModuleKeys.STATUS, { isBotOwner: true });
    assert.ok(ownerModule.embeds[0].data.title.includes('Module Guide'));
  });
});
