const test = require('node:test');
const assert = require('node:assert/strict');
const { handleDashboardRequest } = require('../../dashboard/server');

// Mock request / response helper
function createMockHttpPair({ method = 'GET', url = '/', body = null, headers = {} } = {}) {
  const req = {
    method,
    url,
    headers: {
      host: 'localhost:3000',
      ...headers
    },
    on(event, handler) {
      if (event === 'data' && body) {
        handler(typeof body === 'string' ? body : JSON.stringify(body));
      }
      if (event === 'end') {
        handler();
      }
      return this;
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, hdrs) {
      this.statusCode = status;
      if (hdrs) {
        this.headers = { ...this.headers, ...hdrs };
      }
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    }
  };

  return { req, res };
}

test('Dashboard Visual Tools & Studios API Test Suite', async (t) => {
  const guildId = '123456789012345678';

  // 1. Authenticate via demo sandbox login to obtain a valid session cookie
  const { req: loginReq, res: loginRes } = createMockHttpPair({
    method: 'POST',
    url: '/api/auth/demo-login'
  });
  await handleDashboardRequest(loginReq, loginRes);
  assert.equal(loginRes.statusCode, 200);
  const loginData = JSON.parse(loginRes.body);
  assert.equal(loginData.ok, true);
  assert.ok(loginRes.headers['Set-Cookie']);

  const sessionCookie = loginRes.headers['Set-Cookie'].split(';')[0];
  const authHeaders = { cookie: sessionCookie };

  await t.test('POST /api/guilds/:guildId/send-embed validates channel and dispatches embed payload', async () => {
    // 1. Missing channel returns 400
    const { req: req1, res: res1 } = createMockHttpPair({
      method: 'POST',
      url: `/api/guilds/${guildId}/send-embed`,
      body: { content: 'Hello!' },
      headers: authHeaders
    });
    await handleDashboardRequest(req1, res1);
    assert.equal(res1.statusCode, 400);
    const data1 = JSON.parse(res1.body);
    assert.ok(data1.error.includes('Target Discord channel is required'));

    // 2. Valid embed payload returns 200 and sent action
    const embedPayload = {
      title: '🌟 Test Announcement',
      description: 'This is a test announcement description.',
      color: '#5865f2',
      fields: [{ name: 'Field 1', value: 'Value 1', inline: true }]
    };
    const { req: req2, res: res2 } = createMockHttpPair({
      method: 'POST',
      url: `/api/guilds/${guildId}/send-embed`,
      body: {
        channelId: '100000000000000002',
        content: 'Hey @everyone!',
        embed: embedPayload
      },
      headers: authHeaders
    });
    await handleDashboardRequest(req2, res2);
    assert.equal(res2.statusCode, 200);
    const data2 = JSON.parse(res2.body);
    assert.equal(data2.ok, true);
    assert.equal(data2.action, 'sent');
    assert.ok(data2.messageId);

    // 3. Edit existing message returns edited action
    const { req: req3, res: res3 } = createMockHttpPair({
      method: 'POST',
      url: `/api/guilds/${guildId}/send-embed`,
      body: {
        channelId: '100000000000000002',
        messageId: '999888777666555444',
        content: 'Updated content!',
        embed: embedPayload
      },
      headers: authHeaders
    });
    await handleDashboardRequest(req3, res3);
    assert.equal(res3.statusCode, 200);
    const data3 = JSON.parse(res3.body);
    assert.equal(data3.ok, true);
    assert.equal(data3.action, 'edited');
    assert.equal(data3.messageId, '999888777666555444');
  });

  await t.test('GET /api/guilds/:guildId/messages/:messageId returns message structure for in-place editing', async () => {
    const { req, res } = createMockHttpPair({
      method: 'GET',
      url: `/api/guilds/${guildId}/messages/999888777666555444?channelId=100000000000000002`,
      headers: authHeaders
    });
    await handleDashboardRequest(req, res);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.ok(data.message);
    assert.equal(data.message.id, '999888777666555444');
  });

  await t.test('Role Panels Studio: GET, POST, DELETE /api/guilds/:guildId/role-panels', async () => {
    // 1. GET returns array of panels
    const { req: getReq, res: getRes } = createMockHttpPair({
      method: 'GET',
      url: `/api/guilds/${guildId}/role-panels`,
      headers: authHeaders
    });
    await handleDashboardRequest(getReq, getRes);
    assert.equal(getRes.statusCode, 200);
    const getData = JSON.parse(getRes.body);
    assert.equal(getData.ok, true);
    assert.ok(Array.isArray(getData.panels));

    // 2. POST create/publish panel
    const { req: postReq, res: postRes } = createMockHttpPair({
      method: 'POST',
      url: `/api/guilds/${guildId}/role-panels`,
      body: {
        name: 'test-studio-roles',
        title: '🔔 Test Roles Panel',
        description: 'Toggle your notification roles',
        displayMode: 'BUTTONS',
        mode: 'MULTI',
        color: '#10b981',
        channelId: '100000000000000004',
        options: [
          { roleId: '200000000000000004', label: 'Stream Alerts', emoji: '🔔', buttonColor: '#5865f2' }
        ]
      },
      headers: authHeaders
    });
    await handleDashboardRequest(postReq, postRes);
    assert.equal(postRes.statusCode, 200);
    const postData = JSON.parse(postRes.body);
    assert.equal(postData.ok, true);
    assert.ok(postData.panel);

    // 3. DELETE panel
    const { req: delReq, res: delRes } = createMockHttpPair({
      method: 'DELETE',
      url: `/api/guilds/${guildId}/role-panels/test-studio-roles`,
      headers: authHeaders
    });
    await handleDashboardRequest(delReq, delRes);
    assert.equal(delRes.statusCode, 200);
    const delData = JSON.parse(delRes.body);
    assert.equal(delData.ok, true);
  });

  await t.test('Custom Commands Studio: GET, POST, DELETE /api/guilds/:guildId/custom-commands', async () => {
    // 1. GET custom commands
    const { req: getReq, res: getRes } = createMockHttpPair({
      method: 'GET',
      url: `/api/guilds/${guildId}/custom-commands`,
      headers: authHeaders
    });
    await handleDashboardRequest(getReq, getRes);
    assert.equal(getRes.statusCode, 200);
    const getData = JSON.parse(getRes.body);
    assert.equal(getData.ok, true);
    assert.ok(Array.isArray(getData.commands));

    // 2. POST create custom command
    const { req: postReq, res: postRes } = createMockHttpPair({
      method: 'POST',
      url: `/api/guilds/${guildId}/custom-commands`,
      body: {
        name: 'studiotest',
        response: 'Hello {user}! Welcome to {server}.',
        embedEnabled: true,
        embedTitle: 'Studio Test Card',
        embedColor: '#5865f2'
      },
      headers: authHeaders
    });
    await handleDashboardRequest(postReq, postRes);
    assert.equal(postRes.statusCode, 200);
    const postData = JSON.parse(postRes.body);
    assert.equal(postData.ok, true);
    assert.ok(postData.command);

    // 3. DELETE custom command
    const { req: delReq, res: delRes } = createMockHttpPair({
      method: 'DELETE',
      url: `/api/guilds/${guildId}/custom-commands/studiotest`,
      headers: authHeaders
    });
    await handleDashboardRequest(delReq, delRes);
    assert.equal(delRes.statusCode, 200);
    const delData = JSON.parse(delRes.body);
    assert.equal(delData.ok, true);
  });

  await t.test('Server Analytics & Heatmap: GET /api/guilds/:guildId/analytics returns comprehensive metrics', async () => {
    const { req, res } = createMockHttpPair({
      method: 'GET',
      url: `/api/guilds/${guildId}/analytics`,
      headers: authHeaders
    });
    await handleDashboardRequest(req, res);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);

    assert.equal(data.ok, true);
    assert.ok(data.summary);
    assert.ok(typeof data.summary.messages24h === 'number');
    assert.ok(data.summary.healthScore);

    // Velocity 24h & 7d
    assert.ok(Array.isArray(data.velocity24h));
    assert.equal(data.velocity24h.length, 24);
    assert.ok(Array.isArray(data.velocity7d));
    assert.equal(data.velocity7d.length, 7);

    // 7x24 Heatmap
    assert.ok(Array.isArray(data.heatmap));
    assert.equal(data.heatmap.length, 7 * 24);
    assert.ok(data.heatmap[0].intensity >= 0 && data.heatmap[0].intensity <= 5);

    // Channels and member flow
    assert.ok(Array.isArray(data.topChannels));
    assert.ok(Array.isArray(data.memberFlow));
  });

  await t.test('Public Static / SPA Routes: Terms of Service & Privacy Policy serve index.html with 200', async () => {
    const { req: termsReq, res: termsRes } = createMockHttpPair({ method: 'GET', url: '/terms' });
    await handleDashboardRequest(termsReq, termsRes);
    assert.equal(termsRes.statusCode, 200);
    const ct1 = termsRes.headers['Content-Type'] || termsRes.headers['content-type'] || '';
    assert.ok(ct1.includes('text/html'));

    const { req: privReq, res: privRes } = createMockHttpPair({ method: 'GET', url: '/privacy' });
    await handleDashboardRequest(privReq, privRes);
    assert.equal(privRes.statusCode, 200);
    const ct2 = privRes.headers['Content-Type'] || privRes.headers['content-type'] || '';
    assert.ok(ct2.includes('text/html'));
  });
});
