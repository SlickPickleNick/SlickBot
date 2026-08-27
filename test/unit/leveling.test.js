const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const {
  LevelingService,
  totalXpForLevel,
  levelFromXp,
  progressForProfile,
  formatMultiplier
} = require('../../src/modules/community/levelingService');

const mockDb = new MockDatabase();

test('Leveling Math and Profile Progress', async (t) => {
  await t.test('XP curves calculate level thresholds accurately', () => {
    assert.equal(totalXpForLevel(0), 0);
    assert.equal(totalXpForLevel(1), 125);
    assert.equal(totalXpForLevel(2), 300);
    assert.equal(levelFromXp(0), 0);
    assert.equal(levelFromXp(124), 0);
    assert.equal(levelFromXp(125), 1);
    assert.equal(levelFromXp(300), 2);
  });

  await t.test('progressForProfile calculates current level progress', () => {
    const progress = progressForProfile({ xp: 50, level: 0 });
    assert.equal(progress.level, 0);
    assert.equal(progress.xp, 50);
    assert.equal(progress.currentXp, 50);
    assert.equal(progress.neededXp, 125);
  });

  await t.test('formatMultiplier formats multiplier text', () => {
    assert.equal(formatMultiplier(2), '2×');
    assert.equal(formatMultiplier(1.5), '1.5×');
    assert.equal(formatMultiplier(1), '1×');
  });
});

test('LevelingService Caching and Multiplier Roles', async (t) => {
  let service;
  const guildId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new LevelingService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('getConfig caches guild leveling configuration', async () => {
    let queryCount = 0;
    mockDb.addHandler('leveling_configs', () => {
      queryCount++;
      return { rows: [{ guild_id: guildId, enabled: true, xp_min: 15, xp_max: 25, cooldown_seconds: 60 }], rowCount: 1 };
    });

    const first = await service.getConfig(guildId);
    assert.equal(first.enabled, true);
    assert.equal(queryCount, 1);

    const second = await service.getConfig(guildId);
    assert.equal(second.enabled, true);
    assert.equal(queryCount, 1); // Served from cache
  });

  await t.test('getApplicableMultiplier selects highest multiplier from member roles', async () => {
    const role1 = '200000000000000001';
    const role2 = '200000000000000002';
    mockDb.addHandler('leveling_multiplier_roles', {
      rows: [
        { role_id: role1, multiplier: 2.0, active: true },
        { role_id: role2, multiplier: 1.5, active: true }
      ],
      rowCount: 2
    });

    const highest = await service.getApplicableMultiplier(guildId, [role2, role1]);
    assert.equal(highest.multiplier, 2.0);
    assert.equal(highest.roleId, role1);

    const none = await service.getApplicableMultiplier(guildId, []);
    assert.equal(none.multiplier, 1.0);
    assert.equal(none.roleId, null);
  });

  await t.test('updateCardCustomization and buildRankEmbed customization rendering', async () => {
    let savedParams = null;
    mockDb.addHandler('INSERT INTO leveling_profiles', (sql, params) => {
      savedParams = params;
      return { rows: [{ guild_id: guildId, user_id: 'user-1', card_background_url: params[2], card_color: params[3], card_theme: params[4] }], rowCount: 1 };
    });

    const updated = await service.updateCardCustomization(guildId, 'user-1', {
      backgroundUrl: 'https://example.com/banner.png',
      color: '#FF007F',
      theme: 'CYBERPUNK'
    });

    assert.ok(updated);
    assert.equal(savedParams[2], 'https://example.com/banner.png');
    assert.equal(savedParams[3], '#FF007F');
    assert.equal(savedParams[4], 'CYBERPUNK');

    const mockUser = {
      id: 'user-1',
      tag: 'Gamer#1234',
      displayAvatarURL: () => 'https://example.com/avatar.png'
    };

    const rankData = {
      rank: 1,
      progress: { level: 5, xp: 2500, currentXp: 500, neededXp: 1000 },
      profile: {
        message_count: 150,
        voice_minutes: 120,
        card_background_url: 'https://example.com/banner.png',
        card_color: '#FF007F',
        card_theme: 'CYBERPUNK'
      }
    };

    const embed = service.buildRankEmbed(mockUser, rankData);
    assert.equal(embed.data.color, 0xFF007F);
    assert.equal(embed.data.image.url, 'https://example.com/banner.png');
    assert.equal(embed.data.thumbnail.url, 'https://example.com/avatar.png');
  });

  await t.test('buildInfoEmbed renders server leveling guide with rewards and multipliers', async () => {
    mockDb.addHandler('leveling_configs', {
      rows: [{
        guild_id: guildId,
        enabled: true,
        xp_min: 20,
        xp_max: 30,
        cooldown_seconds: 45,
        minimum_message_length: 5,
        voice_xp_enabled: true,
        voice_xp_min: 15,
        voice_xp_max: 25,
        voice_xp_min_channel_members: 2,
        voice_xp_require_unmuted: true
      }],
      rowCount: 1
    });

    mockDb.addHandler('leveling_role_rewards', {
      rows: [
        { level: 5, role_id: '200000000000000001', active: true },
        { level: 10, role_id: '200000000000000002', active: true }
      ],
      rowCount: 2
    });

    mockDb.addHandler('leveling_multiplier_roles', {
      rows: [
        { role_id: '200000000000000003', multiplier: 2.0, active: true }
      ],
      rowCount: 1
    });

    const mockGuild = {
      id: guildId,
      name: 'Epic Gamer Guild',
      iconURL: () => 'https://example.com/guild-icon.png'
    };

    const infoEmbed = await service.buildInfoEmbed(mockGuild);
    assert.ok(infoEmbed);
    assert.match(infoEmbed.data.title, /Epic Gamer Guild/);
    assert.match(infoEmbed.data.description, /20–30 XP/);
    assert.match(infoEmbed.data.description, /45s/);
    assert.match(infoEmbed.data.description, /Level \*\*5\*\* → <@&200000000000000001>/);
    assert.match(infoEmbed.data.description, /Level \*\*10\*\* → <@&200000000000000002>/);
    assert.match(infoEmbed.data.description, /<@&200000000000000003> → \*\*2× XP\*\*/);
    assert.equal(infoEmbed.data.thumbnail.url, 'https://example.com/guild-icon.png');
  });

  await t.test('buildXpAnalysis, CSV, and embed generate accurate curve projections', async () => {
    const config = { xp_min: 10, xp_max: 30 };
    const analysis = service.buildXpAnalysis(config, 20, 2);
    assert.equal(analysis.maxLevel, 20);
    assert.equal(analysis.multiplier, 2);
    assert.equal(analysis.averageAward, 40);
    assert.equal(analysis.levels.length, 20);

    const csv = service.buildXpAnalysisCsv(analysis);
    assert.ok(csv.includes('Level,XP Needed (This Level),Total XP Required'));
    assert.ok(csv.includes('1,125,125,4,4'));

    const embed = service.buildXpAnalysisEmbed(analysis);
    assert.ok(embed);
    assert.match(embed.data.title, /XP Progression Curve/);
    assert.match(embed.data.description, /Levels 1 to 20/);
    assert.match(embed.data.description, /2×/);
  });
});
