const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const {
  LevelingService,
  buildLevelingConfigModal
} = require('../../src/modules/community/levelingService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const levelCmd = require('../../src/commands/level');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');

const mockDb = new MockDatabase();

test('Voice XP for Leveling Engine Tests', async (t) => {
  let service;
  const guildId = '100000000000000001';
  const roleMultiplier = '200000000000000001';
  const roleIgnored = '200000000000000002';
  const voiceChannel1 = '300000000000000001';
  const voiceChannelAfk = '300000000000000099';
  const voiceChannelIgnored = '300000000000000002';

  t.beforeEach(() => {
    mockDb.install();
    service = new LevelingService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('saveConfig and getConfig persist Voice XP configuration', async () => {
    let savedConfig = null;
    mockDb.addHandler('INSERT INTO leveling_configs', (sql, params) => {
      savedConfig = {
        guild_id: params[0],
        enabled: params[1],
        xp_min: params[2],
        xp_max: params[3],
        voice_xp_enabled: params[11],
        voice_xp_min: params[12],
        voice_xp_max: params[13],
        voice_xp_interval_seconds: params[14],
        voice_xp_require_unmuted: params[15],
        voice_xp_min_channel_members: params[16],
        voice_ignored_channel_ids: JSON.parse(params[17])
      };
      return { rows: [savedConfig], rowCount: 1 };
    });

    const result = await service.saveConfig(guildId, {
      voiceXpEnabled: true,
      voiceXpMin: 12,
      voiceXpMax: 24,
      voiceXpMinChannelMembers: 3,
      voiceXpRequireUnmuted: true,
      voiceIgnoredChannels: [voiceChannelIgnored]
    });

    assert.equal(result.voice_xp_enabled, true);
    assert.equal(result.voice_xp_min, 12);
    assert.equal(result.voice_xp_max, 24);
    assert.equal(result.voice_xp_min_channel_members, 3);
    assert.deepEqual(result.voice_ignored_channel_ids, [voiceChannelIgnored]);
  });

  await t.test('voice ignored channel helper methods manage channel blacklist', async () => {
    let currentConfig = {
      guild_id: guildId,
      voice_ignored_channel_ids: [voiceChannelIgnored]
    };

    mockDb.addHandler('SELECT * FROM leveling_configs', () => ({
      rows: [currentConfig],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO leveling_configs', (sql, params) => {
      currentConfig = {
        guild_id: params[0],
        voice_ignored_channel_ids: JSON.parse(params[17])
      };
      return { rows: [currentConfig], rowCount: 1 };
    });

    // 1. Add another channel
    await service.addVoiceIgnoredChannel(guildId, voiceChannel1);
    assert.ok(currentConfig.voice_ignored_channel_ids.includes(voiceChannel1));
    assert.ok(currentConfig.voice_ignored_channel_ids.includes(voiceChannelIgnored));

    // 2. Remove channel
    await service.removeVoiceIgnoredChannel(guildId, voiceChannelIgnored);
    assert.equal(currentConfig.voice_ignored_channel_ids.includes(voiceChannelIgnored), false);
    assert.ok(currentConfig.voice_ignored_channel_ids.includes(voiceChannel1));
  });

  await t.test('awardVoiceXp increments profile xp and voice_minutes', async () => {
    let savedProfile = null;
    mockDb.addHandler('SELECT * FROM leveling_profiles', () => ({
      rows: [{ guild_id: guildId, user_id: 'u1', xp: 50, level: 0, voice_minutes: 10 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO leveling_profiles', (sql, params) => {
      savedProfile = {
        guild_id: params[0],
        user_id: params[1],
        xp: params[3],
        level: params[4],
        voice_minutes: 10 + params[5]
      };
      return { rows: [savedProfile], rowCount: 1 };
    });

    const mockGuild = { id: guildId };
    const mockMember = { id: 'u1', user: { id: 'u1', tag: 'User#0001', bot: false } };
    const mockChannel = { id: voiceChannel1 };
    const config = { enabled: true, voice_xp_enabled: true };

    const res = await service.awardVoiceXp({
      guild: mockGuild,
      member: mockMember,
      channel: mockChannel,
      amount: 15,
      minutes: 1,
      config
    });

    assert.equal(res.awarded, true);
    assert.equal(res.gained, 15);
    assert.equal(res.minutes, 1);
    assert.equal(savedProfile.xp, 65);
    assert.equal(savedProfile.voice_minutes, 11);
  });

  await t.test('processVoiceXpSweep applies anti-farming, mute/deafen, AFK, and multiplier filters', async () => {
    const awardedUserIds = [];

    mockDb.addHandler('SELECT * FROM leveling_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        voice_xp_enabled: true,
        voice_xp_min: 10,
        voice_xp_max: 10,
        voice_xp_min_channel_members: 2, // Anti-farming: must have at least 2 non-bot members
        voice_xp_require_unmuted: true,
        voice_ignored_channel_ids: [voiceChannelIgnored],
        ignored_role_ids: [roleIgnored]
      }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM leveling_multiplier_roles', () => ({
      rows: [{ role_id: roleMultiplier, multiplier: 2.0, active: true }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO leveling_profiles', (sql, params) => {
      awardedUserIds.push({ userId: params[1], gained: params[3] });
      return { rows: [{ guild_id: params[0], user_id: params[1], xp: params[3], level: params[4] }], rowCount: 1 };
    });

    // Mock Members in Voice Channel 1 (Active valid group channel)
    const memberValid1 = {
      id: 'user-valid-1',
      user: { id: 'user-valid-1', bot: false },
      voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map([[roleMultiplier, { id: roleMultiplier }]]) }
    };
    const memberValid2 = {
      id: 'user-valid-2',
      user: { id: 'user-valid-2', bot: false },
      voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map() }
    };
    const memberMuted = {
      id: 'user-muted',
      user: { id: 'user-muted', bot: false },
      voice: { selfMute: true, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map() }
    };
    const memberIgnoredRole = {
      id: 'user-ignored-role',
      user: { id: 'user-ignored-role', bot: false },
      voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map([[roleIgnored, { id: roleIgnored }]]) }
    };

    // Solo Channel (Only 1 member -> should be rejected by anti-farming threshold)
    const memberSolo = {
      id: 'user-solo',
      user: { id: 'user-solo', bot: false },
      voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map() }
    };

    // AFK Channel Members
    const memberAfk = {
      id: 'user-afk',
      user: { id: 'user-afk', bot: false },
      voice: { selfMute: false, serverMute: false, selfDeaf: false, serverDeaf: false },
      roles: { cache: new Map() }
    };

    const validChannelMembers = new Map([
      ['user-valid-1', memberValid1],
      ['user-valid-2', memberValid2],
      ['user-muted', memberMuted],
      ['user-ignored-role', memberIgnoredRole]
    ]);

    const soloChannelMembers = new Map([
      ['user-solo', memberSolo]
    ]);

    const afkChannelMembers = new Map([
      ['user-afk', memberAfk]
    ]);

    const channelsMap = new Map([
      [voiceChannel1, {
        id: voiceChannel1,
        type: 2,
        isVoiceBased: () => true,
        members: validChannelMembers
      }],
      ['channel-solo', {
        id: 'channel-solo',
        type: 2,
        isVoiceBased: () => true,
        members: soloChannelMembers
      }],
      [voiceChannelAfk, {
        id: voiceChannelAfk,
        type: 2,
        isVoiceBased: () => true,
        members: afkChannelMembers
      }]
    ]);

    const mockClient = {
      guilds: {
        cache: new Map([
          [guildId, {
            id: guildId,
            afkChannelId: voiceChannelAfk,
            channels: { cache: channelsMap }
          }]
        ])
      }
    };

    await service.processVoiceXpSweep(mockClient, null);

    // Assertions:
    // 1. user-valid-1 receives 20 XP (10 base * 2.0 multiplier)
    // 2. user-valid-2 receives 10 XP (10 base * 1.0 multiplier)
    // 3. user-muted is rejected
    // 4. user-ignored-role is rejected
    // 5. user-solo is rejected (anti-farming threshold)
    // 6. user-afk is rejected (AFK channel)
    assert.equal(awardedUserIds.length, 2);
    const award1 = awardedUserIds.find((a) => a.userId === 'user-valid-1');
    const award2 = awardedUserIds.find((a) => a.userId === 'user-valid-2');
    assert.ok(award1);
    assert.ok(award2);
    assert.equal(award1.gained, 20);
    assert.equal(award2.gained, 10);
  });

  await t.test('buildRankEmbed includes formatted voice activity time', () => {
    const user = { tag: 'VoiceMaster#0001' };
    const rankData = {
      rank: 1,
      progress: { level: 5, xp: 1200, currentXp: 75, neededXp: 175 },
      profile: { message_count: 85, voice_minutes: 135 },
      voiceMinutes: 135
    };

    const embed = service.buildRankEmbed(user, rankData);
    assert.match(embed.data.description, /Server Rank: \*\*#1\*\*/i);
    assert.match(embed.data.description, /Messages: \*\*85\*\*/i);
    assert.match(embed.data.description, /Voice Activity: \*\*2h 15m\*\*/i);
  });

  await t.test('/level command metadata, action keys, and validation', () => {
    assert.equal(levelCmd.data.name, 'level');
    assert.equal(levelCmd.moduleKey, ModuleKeys.LEVELING);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(levelCmd.getActionKey(makeInteraction('rank')), ActionKeys.LevelingUse);
    assert.equal(levelCmd.getActionKey(makeInteraction('leaderboard')), ActionKeys.LevelingUse);
    assert.equal(levelCmd.getActionKey(makeInteraction('manager')), ActionKeys.LevelingView);
    assert.equal(levelCmd.getActionKey(makeInteraction('voice-ignore-list')), ActionKeys.LevelingView);
    assert.equal(levelCmd.getActionKey(makeInteraction('voice-ignore-add')), ActionKeys.LevelingConfigure);
    assert.equal(levelCmd.getActionKey(makeInteraction('voice-ignore-remove')), ActionKeys.LevelingConfigure);
    assert.equal(levelCmd.getActionKey(makeInteraction('setup')), ActionKeys.LevelingConfigure);

    assert.equal(commandMap.has('level'), true);
    const payloads = commands.map((c) => c.data.toJSON());
    const errors = validateCommandPayloads(payloads);
    assert.deepEqual(errors, []);
  });

  await t.test('/level info and /level analyze command execution', async () => {
    mockDb.addHandler('leveling_configs', {
      rows: [{
        guild_id: guildId,
        enabled: true,
        xp_min: 15,
        xp_max: 25,
        cooldown_seconds: 60,
        voice_xp_enabled: true,
        voice_xp_min: 10,
        voice_xp_max: 20
      }],
      rowCount: 1
    });

    let repliedPayload = null;
    const mockInfoInteraction = {
      guildId,
      guild: { id: guildId, name: 'Test Server', iconURL: () => null },
      user: { id: 'user-1', tag: 'Tester#0001' },
      options: {
        getSubcommand: () => 'info'
      },
      reply: async (payload) => {
        repliedPayload = payload;
        return payload;
      }
    };

    await levelCmd.execute(mockInfoInteraction, {});
    assert.ok(repliedPayload);
    assert.ok(repliedPayload.embeds);
    assert.match(repliedPayload.embeds[0].data.title, /Test Server • Leveling & XP Guide/);

    let analyzePayload = null;
    const mockAnalyzeInteraction = {
      guildId,
      guild: { id: guildId, name: 'Test Server' },
      user: { id: 'user-1', tag: 'Tester#0001' },
      options: {
        getSubcommand: () => 'analyze',
        getInteger: (name) => (name === 'max_level' ? 25 : null),
        getNumber: (name) => (name === 'multiplier' ? 1.5 : null)
      },
      reply: async (payload) => {
        analyzePayload = payload;
        return payload;
      }
    };

    await levelCmd.execute(mockAnalyzeInteraction, {});
    assert.ok(analyzePayload);
    assert.ok(analyzePayload.embeds);
    assert.match(analyzePayload.embeds[0].data.title, /XP Progression Curve & Level Analysis/);
    assert.ok(analyzePayload.files && analyzePayload.files.length > 0);
  });
});
