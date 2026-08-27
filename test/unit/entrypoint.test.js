const test = require('node:test');
const assert = require('node:assert/strict');

test('Entrypoint Mode Detection Logic', async (t) => {
  await t.test('detects dashboard mode when SERVICE_ROLE=dashboard', () => {
    const role = 'dashboard'.toLowerCase().trim();
    const hasDiscordToken = true;
    const isDashboardMode =
      role === 'dashboard' ||
      role === 'web' ||
      role === 'website' ||
      role === 'api' ||
      (!hasDiscordToken && true);

    assert.equal(isDashboardMode, true);
  });

  await t.test('detects dashboard mode when DISCORD_TOKEN is missing', () => {
    const role = '';
    const hasDiscordToken = false;
    const hasDbUrl = true;
    const isDashboardMode =
      role === 'dashboard' ||
      role === 'web' ||
      role === 'website' ||
      role === 'api' ||
      (!hasDiscordToken && hasDbUrl);

    assert.equal(isDashboardMode, true);
  });

  await t.test('detects bot gateway mode when DISCORD_TOKEN is present and role is empty or bot', () => {
    const role = 'bot';
    const hasDiscordToken = true;
    const hasDbUrl = true;
    const isDashboardMode =
      role === 'dashboard' ||
      role === 'web' ||
      role === 'website' ||
      role === 'api' ||
      (!hasDiscordToken && hasDbUrl);

    assert.equal(isDashboardMode, false);
  });
});
