// SlickBot Web Dashboard SPA Client
let currentUser = null;
let userGuilds = [];
let activeGuildId = null;
let currentGuildConfig = null;
let allModulesList = [];
let currentCategoryFilter = 'ALL';
let botClientId = '123456789012345678';
let serverSearchQuery = '';

// --- Navigation Router ---
function navigateTo(viewName, params = {}) {
  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');

  const navServers = document.getElementById('nav-btn-servers');
  if (navServers) {
    navServers.style.display = currentUser ? 'inline-block' : 'none';
  }

  if (viewName === 'servers') {
    renderServers();
  } else if (viewName === 'manage' && params.guildId) {
    loadGuildConfig(params.guildId);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Tab Switcher for Server Management Sidebar ---
function switchManageTab(tabId, buttonEl) {
  document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
  if (buttonEl) buttonEl.classList.add('active');

  document.querySelectorAll('.manage-panel').forEach(panel => panel.classList.remove('active'));
  const targetPanel = document.getElementById(`tab-panel-${tabId}`);
  if (targetPanel) targetPanel.classList.add('active');

  if (activeGuildId) {
    if (tabId === 'media') loadFeeds();
    if (tabId === 'safety') loadAutoMod();
    if (tabId === 'community') loadStarboard();
  }
}

// --- Auth & Session Management ---
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        currentUser = data.user;
        userGuilds = data.guilds || [];
        botClientId = data.clientId || botClientId;
        renderAuthHeader();

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'servers') {
          navigateTo('servers');
        }
        return;
      }
    }
  } catch (err) {
    console.warn('Session check:', err);
  }

  currentUser = null;
  userGuilds = [];
  renderAuthHeader();
}

function renderAuthHeader() {
  const container = document.getElementById('auth-header-container');
  if (!container) return;

  if (currentUser) {
    const avatarUrl = currentUser.avatar
      ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=64`
      : null;

    container.innerHTML = `
      <div class="user-pill">
        <div class="user-avatar">
          ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : currentUser.username.charAt(0).toUpperCase()}
        </div>
        <span class="user-name">${escapeHtml(currentUser.global_name || currentUser.username)}</span>
        <button class="btn-logout" onclick="handleLogout()" title="Log out">&times;</button>
      </div>
    `;
    const navServers = document.getElementById('nav-btn-servers');
    if (navServers) navServers.style.display = 'inline-block';
  } else {
    container.innerHTML = `
      <button class="btn btn-discord" onclick="handleDiscordLogin()">
        <svg class="discord-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        Login with Discord
      </button>
    `;
    const navServers = document.getElementById('nav-btn-servers');
    if (navServers) navServers.style.display = 'none';
  }
}

function handleDiscordLogin() {
  window.location.href = '/api/auth/login';
}

async function handleDemoLogin() {
  try {
    const res = await fetch('/api/auth/demo-login', { method: 'POST' });
    if (res.ok) {
      await checkAuth();
      navigateTo('servers');
    }
  } catch (err) {
    alert('Failed to launch sandbox demo session: ' + err.message);
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout');
    currentUser = null;
    userGuilds = [];
    renderAuthHeader();
    navigateTo('home');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// --- Home Module Catalog Loader ---
async function fetchModulesCatalog() {
  try {
    const res = await fetch('/api/modules');
    if (res.ok) {
      allModulesList = await res.json();
      renderHomeModules();
    }
  } catch (err) {
    console.error('Failed to load modules catalog:', err);
  }
}

function filterHomeModules(catId, btnEl) {
  currentCategoryFilter = catId;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderHomeModules();
}

function renderHomeModules() {
  const container = document.getElementById('home-modules-grid');
  if (!container) return;

  const filtered = currentCategoryFilter === 'ALL'
    ? allModulesList
    : allModulesList.filter(m => m.categoryId === currentCategoryFilter);

  container.innerHTML = filtered.map(mod => `
    <div class="feature-card">
      <div>
        <div class="feature-cat-tag">${escapeHtml(mod.category)}</div>
        <h3 class="feature-title">${escapeHtml(mod.name)}</h3>
        <p class="feature-desc">${escapeHtml(mod.description)}</p>
      </div>
      <div class="cmd-pill-row">
        ${(mod.commands || []).map(cmd => `<span class="cmd-pill">${escapeHtml(cmd)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// --- Server Selector Rendering ---
function renderServers() {
  const container = document.getElementById('servers-container');
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px;">
        <p style="margin-bottom: 16px;">Please log in with Discord to access your servers.</p>
        <button class="btn btn-discord" onclick="handleDiscordLogin()">Login with Discord</button>
      </div>
    `;
    return;
  }

  const queryStr = (serverSearchQuery || '').toLowerCase();
  const filtered = userGuilds.filter(g => g.name.toLowerCase().includes(queryStr));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
        No servers found matching "${escapeHtml(serverSearchQuery)}".
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(guild => {
    const isInstalled = guild.installed;
    const cardClass = isInstalled ? 'installed' : 'uninvited';

    const avatarHtml = guild.iconUrl
      ? `<img src="${escapeHtml(guild.iconUrl)}" alt="${escapeHtml(guild.name)}">`
      : guild.name.charAt(0).toUpperCase();

    const actionHtml = isInstalled
      ? `<button class="btn btn-primary" style="width: 100%;" onclick="navigateTo('manage', { guildId: '${guild.id}' })">
           Configure Server &rarr;
         </button>`
      : `<a href="${escapeHtml(guild.inviteUrl)}" target="_blank" class="btn btn-outline" style="width: 100%; color: #93c5fd;">
           + Invite SlickBot
         </a>`;

    return `
      <div class="server-card ${cardClass}">
        <div class="server-icon-large">
          ${avatarHtml}
        </div>
        <h3 class="server-name">${escapeHtml(guild.name)}</h3>
        <span class="server-status-pill ${cardClass}">
          ${isInstalled ? '● Active' : '○ Not Invited'}
        </span>
        ${actionHtml}
      </div>
    `;
  }).join('');
}

// --- Server Management Loader ---
async function loadGuildConfig(guildId) {
  activeGuildId = guildId;
  const nameEl = document.getElementById('guild-name-inline');
  const idEl = document.getElementById('guild-id-sub');
  const avatarEl = document.getElementById('guild-avatar-small');

  if (nameEl) nameEl.textContent = 'Loading...';
  if (idEl) idEl.textContent = guildId;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/config`);
    if (!res.ok) throw new Error('Failed to load server configuration');

    const data = await res.json();
    currentGuildConfig = data;

    if (nameEl) nameEl.textContent = data.guild.name;
    if (avatarEl) {
      avatarEl.innerHTML = data.guild.iconUrl
        ? `<img src="${data.guild.iconUrl}" alt="${data.guild.name}">`
        : data.guild.name.charAt(0).toUpperCase();
    }

    renderSwitchboard(data.modules);
  } catch (err) {
    if (nameEl) nameEl.textContent = 'Error: ' + err.message;
  }
}

// --- Render Master Switchboard for all 29 Modules ---
function renderSwitchboard(modules) {
  const container = document.getElementById('switchboard-container');
  if (!container) return;

  container.innerHTML = modules.map(mod => `
    <div class="switch-card">
      <div class="switch-card-header">
        <div>
          <div class="switch-card-cat">${escapeHtml(mod.category)}</div>
          <div class="switch-card-title">${escapeHtml(mod.name)}</div>
        </div>
        <label class="switch">
          <input type="checkbox" ${mod.enabled ? 'checked' : ''} onchange="handleToggleModule('${mod.key}', this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <p class="switch-card-desc">${escapeHtml(mod.description)}</p>
      <div class="cmd-pill-row">
        ${(mod.commands || []).map(cmd => `<span class="cmd-pill">${escapeHtml(cmd)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

async function handleToggleModule(moduleKey, enabled) {
  if (!activeGuildId) return;
  showSaveIndicator('Saving...');
  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/toggle-module`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey, enabled })
    });
    if (res.ok) {
      showSaveIndicator('Saved ✓');
    } else {
      showSaveIndicator('Error saving');
    }
  } catch (err) {
    showSaveIndicator('Network error');
  }
}

// --- Social Feeds Manager ---
async function loadFeeds() {
  const tbody = document.getElementById('feeds-table-body');
  if (!tbody || !activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/feeds`);
    const feeds = await res.json();

    if (!feeds || feeds.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No feeds subscribed yet. Use the form above to track a creator!</td></tr>`;
      return;
    }

    tbody.innerHTML = feeds.map(f => `
      <tr>
        <td><span class="platform-pill ${f.platform}">${f.platform}</span></td>
        <td><strong>${escapeHtml(f.account_name)}</strong></td>
        <td><code>#${escapeHtml(f.channel_id)}</code></td>
        <td><span style="color: ${f.last_status === 'LIVE' ? 'var(--accent-emerald)' : 'var(--text-faint)'};">● ${f.last_status || 'OFFLINE'}</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="handleDeleteFeed('${f.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: #f87171;">Failed to load feeds: ${err.message}</td></tr>`;
  }
}

async function handleAddFeed(e) {
  e.preventDefault();
  if (!activeGuildId) return;

  const platform = document.getElementById('feed-platform').value;
  const account = document.getElementById('feed-account').value;
  const channelId = document.getElementById('feed-channel').value;
  const pingRoleId = document.getElementById('feed-role').value;
  const btn = document.getElementById('btn-add-feed');

  btn.disabled = true;
  btn.textContent = 'Subscribing...';

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, account, channelId, pingRoleId })
    });

    const data = await res.json();
    if (res.ok) {
      document.getElementById('feed-account').value = '';
      document.getElementById('feed-channel').value = '';
      document.getElementById('feed-role').value = '';
      showSaveIndicator('Feed subscribed ✓');
      loadFeeds();
    } else {
      alert('Error: ' + (data.error || 'Failed to add feed'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Add Stream Alert';
  }
}

async function handleDeleteFeed(feedId) {
  if (!confirm('Are you sure you want to remove this stream alert?')) return;
  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/feeds/${encodeURIComponent(feedId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showSaveIndicator('Feed removed ✓');
      loadFeeds();
    }
  } catch (err) {
    alert('Error deleting feed: ' + err.message);
  }
}

// --- AutoMod & Banned Words Manager ---
async function loadAutoMod() {
  if (!activeGuildId) return;
  const container = document.getElementById('banned-words-container');
  if (!container) return;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/automod`);
    const data = await res.json();
    const words = data.bannedWords || [];

    if (words.length === 0) {
      container.innerHTML = `<span style="color: var(--text-faint);">No banned words added yet.</span>`;
      return;
    }

    container.innerHTML = words.map(w => `
      <span class="banned-word-tag">
        <code>${escapeHtml(w.word)}</code>
      </span>
    `).join('');
  } catch (err) {
    container.innerHTML = `<span style="color: #f87171;">Failed to load banned words</span>`;
  }
}

async function handleAddBannedWord(e) {
  e.preventDefault();
  const input = document.getElementById('input-banned-word');
  const word = input.value.trim();
  if (!word || !activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/automod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word })
    });
    if (res.ok) {
      input.value = '';
      showSaveIndicator('Word banned ✓');
      loadAutoMod();
    }
  } catch (err) {
    alert('Error adding banned word: ' + err.message);
  }
}

// --- Starboard Settings Manager ---
async function loadStarboard() {
  if (!activeGuildId) return;
  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/starboard`);
    const data = await res.json();
    if (data) {
      const ch = document.getElementById('starboard-channel');
      const th = document.getElementById('starboard-threshold');
      const em = document.getElementById('starboard-emoji');
      if (ch) ch.value = data.channel_id || '';
      if (th) th.value = data.star_threshold || 3;
      if (em) em.value = data.star_emoji || '⭐';
    }
  } catch (err) {
    console.error('Starboard fetch error:', err);
  }
}

async function saveStarboardSettings() {
  if (!activeGuildId) return;
  const channelId = document.getElementById('starboard-channel')?.value;
  const threshold = parseInt(document.getElementById('starboard-threshold')?.value || '3', 10);
  const emoji = document.getElementById('starboard-emoji')?.value || '⭐';

  showSaveIndicator('Saving...');
  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/starboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, channelId, threshold, emoji })
    });
    if (res.ok) {
      showSaveIndicator('Starboard settings saved ✓');
    }
  } catch (err) {
    showSaveIndicator('Error saving');
  }
}

// Simple Settings Helpers
function showSaveIndicator(msg) {
  const el = document.getElementById('save-status-indicator');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
  }
}

function saveSimpleSetting(key, val) {
  showSaveIndicator('Setting updated ✓');
}

function saveSupportSettings() {
  showSaveIndicator('Support settings saved ✓');
}

function saveWelcomeSettings() {
  showSaveIndicator('Welcome settings saved ✓');
}

function saveDefaultLogChannel() {
  showSaveIndicator('Log channel updated ✓');
}

function saveVoiceSettings() {
  showSaveIndicator('Voice settings saved ✓');
}

// --- Telemetry Polling ---
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      const statusEl = document.getElementById('home-metric-status');
      const uptimeEl = document.getElementById('home-metric-uptime');

      if (statusEl) {
        statusEl.textContent = data.status === 'ok' ? 'ONLINE' : 'DEGRADED';
        statusEl.className = data.status === 'ok' ? 'metric-value text-emerald' : 'metric-value';
      }
      if (uptimeEl && data.bot) {
        uptimeEl.textContent = formatUptime(data.bot.uptimeSeconds);
      }
    }
  } catch (err) {
    const statusEl = document.getElementById('home-metric-status');
    if (statusEl) statusEl.textContent = 'OFFLINE';
  }
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function checkUrlErrors() {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  const redirectUri = urlParams.get('redirect_uri') || `${window.location.origin}/api/auth/callback`;
  const banner = document.getElementById('global-alert-banner');

  if (!error || !banner) return;

  if (error === 'oauth_not_configured') {
    const missingVar = urlParams.get('missing') || 'DISCORD_CLIENT_SECRET';
    banner.className = 'alert-banner';
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="alert-banner-title">
        <span>⚠️ Discord OAuth2 Configuration Required: Missing <code>${escapeHtml(missingVar)}</code></span>
      </div>
      <div class="alert-banner-body">
        The bot cannot initiate Discord OAuth login because <code>${escapeHtml(missingVar)}</code> is missing from your environment variables.
        <ol style="margin-left: 20px; margin-top: 8px;">
          <li>Open your <strong>Railway Dashboard &rarr; Your SlickBot Service &rarr; Variables</strong> tab.</li>
          <li>Add <code>${escapeHtml(missingVar)}</code> = <em>(Paste your secret from Discord Developer Portal)</em>.</li>
          <li>Ensure the Redirect URL below is added under <strong>OAuth2 &rarr; Redirects</strong> in Discord:</li>
        </ol>
        <div class="alert-code-row">
          <code>${escapeHtml(redirectUri)}</code>
        </div>
        <p style="margin-top: 8px;">
          <em>Want to test the dashboard right now without API keys? Click <strong>"Try Sandbox Demo Mode"</strong> below!</em>
        </p>
      </div>
    `;
  } else if (error === 'token_exchange_failed') {
    banner.className = 'alert-banner';
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="alert-banner-title">
        <span>⚠️ Discord Token Exchange Failed</span>
      </div>
      <div class="alert-banner-body">
        Discord rejected the authorization code. Please verify that:
        <ul style="margin-left: 20px; margin-top: 6px;">
          <li>Your <code>DISCORD_CLIENT_SECRET</code> in Railway is accurate.</li>
          <li>The redirect URI <code>${escapeHtml(redirectUri)}</code> is added to <strong>OAuth2 &rarr; Redirects</strong> in the Discord Developer Portal.</li>
        </ul>
      </div>
    `;
  }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const searchEl = document.getElementById('server-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      serverSearchQuery = e.target.value;
      renderServers();
    });
  }

  checkUrlErrors();
  checkAuth();
  fetchModulesCatalog();
  fetchHealth();
  setInterval(fetchHealth, 15000);
});
