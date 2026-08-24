const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockGuild, createMockMember, createMockUser } = require('../helpers/mockDiscord');
const { TicketService } = require('../../src/modules/support/supportService');

const mockDb = new MockDatabase();

test('TicketService Support Workflow', async (t) => {
  const guildId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('getConfig returns support settings with defaults', async () => {
    const service = new TicketService();
    mockDb.addHandler('ticket_configs', {
      rows: [{
        guild_id: guildId,
        category_id: '500',
        staff_role_id: '600',
        naming_format: 'ticket-{username}-{number}',
        ticket_limit: 3
      }],
      rowCount: 1
    });

    const config = await service.getConfig(guildId);
    assert.equal(config.category_id, '500');
    assert.equal(config.ticket_limit, 3);
  });

  await t.test('listTypes returns configured ticket types', async () => {
    const service = new TicketService();
    mockDb.addHandler('ticket_configs', {
      rows: [{ guild_id: guildId, category_id: '500' }],
      rowCount: 1
    });
    mockDb.addHandler('ticket_types', {
      rows: [
        { id: 1, guild_id: guildId, name: 'Admin Support', label: 'Admin Support', enabled: true },
        { id: 2, guild_id: guildId, name: 'Billing', label: 'Billing Support', enabled: true }
      ],
      rowCount: 2
    });

    const types = await service.listTypes(guildId);
    assert.equal(types.length, 2);
    assert.equal(types[0].name, 'Admin Support');
    assert.equal(types[1].name, 'Billing');
  });

  await t.test('updateConfig handles partial onboarding inputs with fallback defaults', async () => {
    const service = new TicketService();
    mockDb.addHandler('INSERT INTO ticket_configs', {
      rows: [{
        guild_id: guildId,
        category_id: '500',
        staff_role_id: '600',
        ticket_limit: 1,
        transcript_enabled: true,
        naming_format: 'ticket-{username}-{number}',
        close_delete_seconds: 10,
        panel_display_mode: 'BUTTONS'
      }],
      rowCount: 1
    });

    const updated = await service.updateConfig(guildId, {
      categoryId: '500',
      staffRoleId: '600'
    });

    assert.equal(updated.guild_id, guildId);
    assert.equal(updated.category_id, '500');
    assert.equal(updated.ticket_limit, 1);
  });
});

test('ReportService, AppealService, and ApplicationService Support Workflows', async (t) => {
  const guildId = '400000000000000001';
  const { ReportService, AppealService, ApplicationService } = require('../../src/modules/support/supportService');

  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('ReportService.updateConfig handles omitted panelDisplayMode and defaults to BUTTONS', async () => {
    const service = new ReportService();
    let executedSql = '';
    mockDb.addHandler('INSERT INTO report_configs', (sql, params) => {
      executedSql = sql;
      return {
        rows: [{
          guild_id: guildId,
          review_channel_id: 'chan-reports-123',
          panel_display_mode: 'BUTTONS'
        }],
        rowCount: 1
      };
    });

    const res = await service.updateConfig(guildId, { reviewChannelId: 'chan-reports-123' });
    assert.equal(res.review_channel_id, 'chan-reports-123');
    assert.match(executedSql, /COALESCE\(\$9,\s*'BUTTONS'\)/i);
  });

  await t.test('AppealService.updateConfig handles omitted panelDisplayMode and defaults to BUTTONS', async () => {
    const service = new AppealService();
    let executedSql = '';
    mockDb.addHandler('INSERT INTO appeal_configs', (sql, params) => {
      executedSql = sql;
      return {
        rows: [{
          guild_id: guildId,
          review_channel_id: 'chan-appeal-123',
          panel_display_mode: 'BUTTONS'
        }],
        rowCount: 1
      };
    });

    const res = await service.updateConfig(guildId, { reviewChannelId: 'chan-appeal-123' });
    assert.equal(res.review_channel_id, 'chan-appeal-123');
    assert.match(executedSql, /COALESCE\(\$9,\s*'BUTTONS'\)/i);
  });

  await t.test('ApplicationService.setupType handles omitted panelDisplayMode and defaults to BUTTONS', async () => {
    const service = new ApplicationService();
    let executedSql = '';
    mockDb.addHandler('INSERT INTO application_types', (sql, params) => {
      executedSql = sql;
      return {
        rows: [{
          guild_id: guildId,
          name: 'Staff Application',
          review_channel_id: 'chan-app-123',
          panel_display_mode: 'BUTTONS'
        }],
        rowCount: 1
      };
    });

    const res = await service.setupType(guildId, { name: 'Staff Application', reviewChannelId: 'chan-app-123' });
    assert.equal(res.name, 'Staff Application');
    assert.match(executedSql, /COALESCE\(\$13,\s*'BUTTONS'\)/i);
  });
});
