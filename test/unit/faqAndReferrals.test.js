const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { resolveDirectMediaUrl, LevelingService } = require('../../src/modules/community/levelingService');
const { ReferralService } = require('../../src/modules/community/referralService');
const { FaqService, DEFAULT_MASTER_TITLE } = require('../../src/modules/community/faqService');
const { AutoModService } = require('../../src/modules/moderation/autoModService');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { MockDatabase } = require('../helpers/mockDb');

const mockDb = new MockDatabase();

test('FAQ, Referrals, Media Resolver, and Timeout Isolation Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('Media URL Resolver converts Klipy, Tenor, Giphy, Imgur, and direct links correctly', () => {
    // Direct images
    assert.equal(
      resolveDirectMediaUrl('https://cdn.discordapp.com/attachments/123/456/banner.png'),
      'https://cdn.discordapp.com/attachments/123/456/banner.png'
    );
    assert.equal(
      resolveDirectMediaUrl('https://example.com/images/bg.jpg?size=1024'),
      'https://example.com/images/bg.jpg?size=1024'
    );

    // Tenor
    assert.equal(
      resolveDirectMediaUrl('https://tenor.com/view/cat-dance-happy-gif-12345678'),
      'https://media.tenor.com/12345678/tenor.gif'
    );
    assert.equal(
      resolveDirectMediaUrl('https://tenor.com/87654321.gif'),
      'https://c.tenor.com/87654321/tenor.gif'
    );

    // Giphy
    assert.equal(
      resolveDirectMediaUrl('https://giphy.com/gifs/funny-cat-abc123xyz'),
      'https://i.giphy.com/media/abc123xyz/giphy.gif'
    );

    // Klipy (Discord built-in GIF provider)
    assert.equal(
      resolveDirectMediaUrl('https://klipy.com/gif/funny-moment-98765'),
      'https://media.klipy.com/gifs/funny-moment-98765.gif'
    );
    assert.equal(
      resolveDirectMediaUrl('https://klipy.com/gifs/klipy-id-123'),
      'https://media.klipy.com/gifs/klipy-id-123.gif'
    );

    // Imgur
    assert.equal(
      resolveDirectMediaUrl('https://imgur.com/gallery/aBcDeFg'),
      'https://i.imgur.com/aBcDeFg.gif'
    );
    assert.equal(
      resolveDirectMediaUrl('https://imgur.com/xyz123'),
      'https://i.imgur.com/xyz123.gif'
    );

    // Empty / invalid
    assert.equal(resolveDirectMediaUrl(''), null);
    assert.equal(resolveDirectMediaUrl(null), null);
    assert.equal(resolveDirectMediaUrl(undefined), null);
  });

  await t.test('ReferralService builds interactive submit panel and submit modal', () => {
    const referrals = new ReferralService();
    const guild = { id: 'guild-1', name: 'Test Guild' };
    const config = { enabled: true, referral_xp: 500 };

    const panel = referrals.buildSubmitPanel(guild, config);
    assert.ok(panel.embeds?.length > 0, 'Panel has embeds');
    assert.ok(panel.components?.length > 0, 'Panel has interactive button components');
    const button = panel.components[0].components[0];
    assert.equal(button.data.custom_id, CustomIds.ReferralsSubmitButton);

    const modal = referrals.buildSubmitModal();
    assert.ok(modal, 'Modal is built');
    assert.equal(modal.data.custom_id, CustomIds.ReferralsSubmitModalSubmit);
  });

  await t.test('FaqService dual-mode supports text channels with automated discussion threads', async () => {
    const faq = new FaqService();

    let faqConfig = {
      guild_id: 'guild-faq-text',
      forum_channel_id: 'text-faq-chan',
      master_thread_id: null,
      master_message_id: 'msg-master-1',
      ticket_channel_id: null,
      master_title: 'Knowledge Base / FAQ',
      master_description: 'FAQ description'
    };
    const entries = [];

    mockDb.addHandler('SELECT * FROM faq_configs', () => ({ rows: [faqConfig], rowCount: 1 }));
    mockDb.addHandler('INSERT INTO faq_configs', (sql, params) => {
      faqConfig = {
        guild_id: params[0],
        forum_channel_id: params[1],
        ticket_channel_id: params[2],
        master_title: params[3],
        master_description: params[4]
      };
      return { rows: [faqConfig], rowCount: 1 };
    });
    mockDb.addHandler('UPDATE faq_configs', (sql, params) => {
      faqConfig.master_thread_id = params[1];
      faqConfig.master_message_id = params[2];
      return { rows: [faqConfig], rowCount: 1 };
    });
    mockDb.addHandler('SELECT * FROM faq_entries', () => ({ rows: entries, rowCount: entries.length }));
    mockDb.addHandler('INSERT INTO faq_entries', (sql, params) => {
      const entry = {
        id: 'entry-' + (entries.length + 1),
        guild_id: params[0],
        question: params[1],
        answer: params[2],
        category: params[3],
        channel_id: params[4],
        message_id: params[5],
        thread_id: params[6]
      };
      entries.push(entry);
      return { rows: [entry], rowCount: 1 };
    });

    const textChannel = {
      id: 'text-faq-chan',
      name: 'faq',
      type: ChannelType.GuildText,
      isTextBased: () => true,
      send: async (payload) => {
        return {
          id: 'msg-' + Math.random().toString(36).slice(2, 8),
          channelId: 'text-faq-chan',
          embeds: payload.embeds || [],
          startThread: async ({ name }) => {
            return {
              id: 'thread-' + Math.random().toString(36).slice(2, 8),
              name,
              send: async () => {}
            };
          },
          edit: async () => {}
        };
      },
      messages: {
        fetch: async (id) => ({ id, edit: async () => {} })
      }
    };

    const guild = {
      id: 'guild-faq-text',
      channels: {
        fetch: async (id) => (id === 'text-faq-chan' ? textChannel : null)
      }
    };

    // Setup text channel FAQ
    const setupRes = await faq.setup({
      guild,
      channel: textChannel,
      masterTitle: 'Server Knowledge Base',
      masterDescription: 'Answers to all common questions.'
    });

    assert.ok(setupRes.ok, 'Setup succeeds for text channel');
    assert.equal(setupRes.isForum, false, 'Identifies as text mode');

    // Add FAQ entry to text channel
    const addRes = await faq.addFaqEntry({
      guild,
      question: 'How do I level up?',
      answer: 'Chat actively and earn XP!',
      category: 'Leveling'
    });

    assert.ok(addRes.ok, 'FAQ entry added');
    assert.equal(addRes.isForum, false);
    assert.ok(addRes.message, 'Message was posted in text channel');
    assert.ok(addRes.thread, 'Discussion thread was created');
  });

  await t.test('Timeout role permissions isolation ensures only appeals channel is accessible', async () => {
    const autoMod = new AutoModService();

    mockDb.addHandler('SELECT timeout_role_id', () => ({
      rows: [{ timeout_role_id: 'role-timeout-id', timeout_role_mode: 'HIDE', timeout_role_exempt_channel_ids: [] }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT panel_channel_id', () => ({
      rows: [{ panel_channel_id: 'c-appeals', review_channel_id: null }],
      rowCount: 1
    }));

    let generalViewDenied = false;
    let appealsViewAllowed = false;
    let appealsSendDenied = false;

    const mockChannels = new Map([
      ['c-general', {
        id: 'c-general',
        name: 'general',
        type: ChannelType.GuildText,
        permissionOverwrites: {
          edit: async (roleId, permissions) => {
            if (permissions.ViewChannel === false) generalViewDenied = true;
          }
        }
      }],
      ['c-appeals', {
        id: 'c-appeals',
        name: 'submit-appeal',
        type: ChannelType.GuildText,
        permissionOverwrites: {
          edit: async (roleId, permissions) => {
            if (permissions.ViewChannel === true) appealsViewAllowed = true;
            if (permissions.SendMessages === false) appealsSendDenied = true;
          }
        }
      }]
    ]);

    const guild = {
      id: 'guild-timeout-test',
      channels: {
        fetch: async () => mockChannels,
        cache: mockChannels
      }
    };

    // Sync timeout role permissions
    const syncRes = await autoMod.syncTimeoutRolePermissions(guild, 'role-timeout-id', { mode: 'HIDE' });
    assert.ok(syncRes.ok, 'Timeout role sync completes successfully');
    assert.equal(syncRes.exemptCount, 1, 'Exempts the appeals channel');
    assert.ok(generalViewDenied, 'General channel hides ViewChannel for timeout role');
    assert.ok(appealsViewAllowed, 'Appeals channel allows ViewChannel for timeout role');
    assert.ok(appealsSendDenied, 'Appeals channel denies SendMessages for timeout role');
  });
});
