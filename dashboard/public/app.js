let currentUser = null;
let userGuilds = [];
let activeGuildId = null;
let currentGuildConfig = null;
let botClientId = '123456789012345678';
let serverSearchQuery = '';

// --- Navigation Router ---
function navigateTo(viewName, params = {}) {
  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');

  // Update navigation button visibility
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

        // If URL has ?view=servers or user is logged in on fresh load, show servers
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
    alert('Failed to initialize demo session');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    userGuilds = [];
    renderAuthHeader();
    navigateTo('home');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// --- Server Selection Rendering ---
function renderServers() {
  const container = document.getElementById('servers-container');
  if (!container) return;

  const filtered = userGuilds.filter(g => {
    return !serverSearchQuery || g.name.toLowerCase().includes(serverSearchQuery.toLowerCase());
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);">
        <h3>No manageable servers found</h3>
        <p style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">
          You need Administrator or Manage Server permissions on a Discord server to configure SlickBot.
        </p>
      </div>
    `;
    return;
  }

  // Sort installed servers first, then uninvited
  filtered.sort((a, b) => (b.installed === true ? 1 : 0) - (a.installed === true ? 1 : 0));

  container.innerHTML = filtered.map(guild => {
    const isInstalled = guild.installed;
    const iconContent = guild.iconUrl
      ? `<img src="${guild.iconUrl}" alt="${escapeHtml(guild.name)}" class="server-icon-img">`
      : `<div class="server-icon-placeholder">${escapeHtml(guild.name.substring(0, 2).toUpperCase())}</div>`;

    if (isInstalled) {
      // Installed Server Card: Full Color, Vibrant, Direct Configure Action
      return `
        <div class="server-card installed">
          <div class="server-icon-wrap">
            ${iconContent}
          </div>
          <div class="server-name" title="${escapeHtml(guild.name)}">${escapeHtml(guild.name)}</div>
          <span class="badge badge-active">SlickBot Active</span>
          <button class="btn btn-primary server-action-btn" onclick="navigateTo('manage', { guildId: '${guild.id}' })">
            Configure Server
          </button>
        </div>
      `;
    } else {
      // Uninvited Server Card: Greyscale, Muted, Discord Bot Invite Action
      return `
        <div class="server-card uninvited">
          <div class="server-icon-wrap">
            ${iconContent}
          </div>
          <div class="server-name" title="${escapeHtml(guild.name)}">${escapeHtml(guild.name)}</div>
          <span class="badge badge-muted">Not Invited</span>
          <a href="${guild.inviteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline server-action-btn">
            + Invite SlickBot
          </a>
        </div>
      `;
    }
  }).join('');
}

// --- Server Management / Config Console ---
async function loadGuildConfig(guildId) {
  activeGuildId = guildId;
  const bannerName = document.getElementById('guild-banner-name');
  const bannerId = document.getElementById('guild-banner-id');
  const bannerAvatar = document.getElementById('guild-banner-avatar');
  const modulesContainer = document.getElementById('guild-modules-container');

  if (bannerName) bannerName.textContent = 'Loading Server...';
  if (bannerId) bannerId.textContent = guildId;
  if (modulesContainer) {
    modulesContainer.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-muted);">Fetching server modules...</div>';
  }

  try {
    const res = await fetch(`/api/guilds/${guildId}/config`);
    if (!res.ok) throw new Error('Failed to load server configuration');
    
    currentGuildConfig = await res.json();
    const guild = currentGuildConfig.guild;

    if (bannerName) bannerName.textContent = guild.name;
    if (bannerAvatar) {
      bannerAvatar.innerHTML = guild.iconUrl
        ? `<img src="${guild.iconUrl}" alt="${escapeHtml(guild.name)}">`
        : escapeHtml(guild.name.substring(0, 2).toUpperCase());
    }

    renderGuildModules(currentGuildConfig.modules || []);
  } catch (err) {
    if (modulesContainer) {
      modulesContainer.innerHTML = `<div style="padding: 32px; text-align: center; color: #f87171;">Error: ${err.message}</div>`;
    }
  }
}

function renderGuildModules(modules) {
  const container = document.getElementById('guild-modules-container');
  if (!container) return;

  container.innerHTML = modules.map(mod => `
    <div class="guild-module-row">
      <div class="guild-module-info">
        <div class="guild-module-name">${escapeHtml(mod.name)}</div>
        <div class="guild-module-desc">${escapeHtml(mod.description)}</div>
        <div class="guild-module-meta">
          <span>Action Key: <code>${escapeHtml(mod.actionKey)}</code></span>
          <span>Category: <strong>${escapeHtml(mod.category)}</strong></span>
        </div>
      </div>
      <div>
        <label class="switch">
          <input type="checkbox" ${mod.enabled ? 'checked' : ''} onchange="toggleModule('${mod.key}', this.checked)">
          <span class="slider"></span>
        </label>
      </div>
    </div>
  `).join('');
}

async function toggleModule(moduleKey, enabled) {
  const statusEl = document.getElementById('save-status-indicator');
  if (statusEl) statusEl.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/toggle-module`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey, enabled })
    });

    if (res.ok) {
      if (statusEl) {
        statusEl.textContent = '✓ Saved automatically';
        setTimeout(() => { statusEl.textContent = ''; }, 2500);
      }
    } else {
      throw new Error('Save failed');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = '⚠️ Save failed';
  }
}

// --- Live Telemetry Poller ---
async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('Health check failed');
    const data = await res.json();

    const statusEl = document.getElementById('home-metric-status');
    const pingEl = document.getElementById('home-metric-ping');
    const uptimeEl = document.getElementById('home-metric-uptime');

    if (statusEl) statusEl.textContent = data.status.toUpperCase();
    if (pingEl) pingEl.textContent = `${data.bot.ping} ms`;
    if (uptimeEl) uptimeEl.textContent = formatUptime(data.bot.uptimeSeconds || 0);
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
    banner.className = 'alert-banner';
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="alert-banner-title">
        <span>⚠️ Discord OAuth2 Configuration Required</span>
      </div>
      <div class="alert-banner-body">
        To use real Discord login, you must add your Discord Client Secret to Railway and configure the Redirect URI in the Discord Developer Portal:
        <ol style="margin-left: 20px; margin-top: 8px;">
          <li>Go to <strong>Railway &rarr; Variables</strong> and set <code>DISCORD_CLIENT_SECRET</code>.</li>
          <li>Go to <a href="https://discord.com/developers/applications" target="_blank" style="color:#93c5fd;text-decoration:underline;">Discord Developer Portal</a> &rarr; Your App &rarr; <strong>OAuth2 &rarr; Redirects</strong>.</li>
          <li>Add this exact Redirect URL:</li>
        </ol>
        <div class="alert-code-row">
          <code>${escapeHtml(redirectUri)}</code>
        </div>
        <p style="margin-top: 8px;">
          <em>Want to test right now without secrets? Click <strong>"Try Sandbox Demo Mode"</strong> below!</em>
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
  fetchHealth();
  setInterval(fetchHealth, 15000);
});
