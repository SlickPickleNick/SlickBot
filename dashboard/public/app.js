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
    if (tabId === 'general' || tabId === 'logging') loadAuditLogs();
    if (tabId === 'media') loadFeeds();
    if (tabId === 'safety') loadAutoMod();
    if (tabId === 'community') loadStarboard();
  }
}

// --- Dynamic Channel & Role Select Dropdown Populators ---
function populateAllDropdowns(channels = [], roles = []) {
  // Populate all Channel Selects
  document.querySelectorAll('select.channel-select').forEach(selectEl => {
    const currentValue = selectEl.value;
    const filterType = selectEl.getAttribute('data-type') || null;
    const allowNone = selectEl.getAttribute('data-allow-none') !== 'false';

    let html = allowNone ? `<option value="">-- None / Disabled --</option>` : `<option value="">Select a Channel...</option>`;
    
    channels.forEach(ch => {
      if (!filterType || ch.type === filterType || (filterType === 'text' && (ch.type === 'text' || ch.type === 'announcement'))) {
        const typeLabel = ch.type === 'voice' ? ' [Voice]' : ch.type === 'forum' ? ' [Forum]' : ch.type === 'category' ? ' [Category]' : '';
        html += `<option value="${escapeHtml(ch.id)}">#${escapeHtml(ch.name)}${typeLabel}</option>`;
      }
    });

    selectEl.innerHTML = html;
    if (currentValue) selectEl.value = currentValue;
  });

  // Populate all Role Selects
  document.querySelectorAll('select.role-select').forEach(selectEl => {
    const currentValue = selectEl.value;
    const allowNone = selectEl.getAttribute('data-allow-none') !== 'false';

    let html = allowNone ? `<option value="">-- None / No Role --</option>` : `<option value="">Select a Role...</option>`;
    
    roles.forEach(r => {
      html += `<option value="${escapeHtml(r.id)}">@${escapeHtml(r.name)}</option>`;
    });

    selectEl.innerHTML = html;
    if (currentValue) selectEl.value = currentValue;
  });

  // Enhance with live searchable autocomplete dropdown comboboxes
  initSearchableSelects();
}

// --- Interactive Searchable Autocomplete Combobox ---
function initSearchableSelects() {
  document.querySelectorAll('select.channel-select, select.role-select').forEach(selectEl => {
    const targetKey = selectEl.id || selectEl.name || Math.random().toString(36).substring(7);
    let wrapper = selectEl.parentElement.querySelector(`.searchable-select-wrapper[data-target-id="${targetKey}"]`);
    const isRole = selectEl.classList.contains('role-select');

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'searchable-select-wrapper';
      wrapper.setAttribute('data-target-id', targetKey);

      const container = document.createElement('div');
      container.className = 'searchable-select-input-container';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'searchable-select-input';
      input.placeholder = isRole ? 'Search or select role (e.g. @Mod)...' : 'Search or select channel (e.g. #stream)...';
      input.autocomplete = 'off';

      const controls = document.createElement('div');
      controls.className = 'searchable-select-controls';

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'searchable-select-clear';
      clearBtn.innerHTML = '&times;';
      clearBtn.title = 'Clear selection';

      const arrow = document.createElement('span');
      arrow.className = 'searchable-select-arrow';
      arrow.innerHTML = '&#9660;';

      controls.appendChild(clearBtn);
      controls.appendChild(arrow);
      container.appendChild(input);
      container.appendChild(controls);

      const dropdown = document.createElement('div');
      dropdown.className = 'searchable-select-dropdown';

      wrapper.appendChild(container);
      wrapper.appendChild(dropdown);

      // Hide raw native select while preserving DOM accessibility
      selectEl.style.display = 'none';
      selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

      const renderOptions = (filterText = '') => {
        dropdown.innerHTML = '';
        const options = Array.from(selectEl.options);
        const query = filterText.toLowerCase().trim();
        const filtered = options.filter(opt => !query || opt.text.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query));

        if (filtered.length === 0) {
          dropdown.innerHTML = `<div class="searchable-select-empty">No matching ${isRole ? 'roles' : 'channels'} found</div>`;
          return;
        }

        filtered.forEach(opt => {
          const item = document.createElement('div');
          item.className = 'searchable-select-option' + (opt.value === selectEl.value ? ' selected' : '');
          item.setAttribute('data-value', opt.value);
          
          let icon = isRole ? '🏷️' : '#';
          if (opt.text.includes('[Voice]')) icon = '🔊';
          if (opt.text.includes('[Forum]')) icon = '💬';
          if (opt.text.includes('[Category]')) icon = '📂';
          if (!opt.value) icon = '🚫';

          item.innerHTML = `
            <span class="option-label">
              <span>${icon}</span>
              <span>${escapeHtml(opt.text)}</span>
            </span>
          `;

          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectOption(opt.value, opt.text);
          });

          dropdown.appendChild(item);
        });
      };

      const selectOption = (val, text) => {
        selectEl.value = val;
        input.value = val ? text : '';
        clearBtn.style.display = val ? 'inline-block' : 'none';
        wrapper.classList.remove('open');
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      };

      input.addEventListener('focus', () => {
        wrapper.classList.add('open');
        renderOptions(input.value);
      });

      input.addEventListener('input', () => {
        wrapper.classList.add('open');
        renderOptions(input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          wrapper.classList.remove('open');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstOption = dropdown.querySelector('.searchable-select-option');
          if (firstOption) {
            firstOption.dispatchEvent(new MouseEvent('mousedown'));
          }
        }
      });

      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectOption('', '');
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          wrapper.classList.remove('open');
          const selectedOpt = selectEl.options[selectEl.selectedIndex];
          input.value = (selectEl.value && selectedOpt && selectEl.value !== '') ? selectedOpt.text : '';
          clearBtn.style.display = (selectEl.value && selectEl.value !== '') ? 'inline-block' : 'none';
        }
      });
    }

    // Sync input text with current select option
    const input = wrapper.querySelector('.searchable-select-input');
    const clearBtn = wrapper.querySelector('.searchable-select-clear');
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    if (input) {
      input.value = (selectEl.value && selectedOpt && selectEl.value !== '') ? selectedOpt.text : '';
    }
    if (clearBtn) {
      clearBtn.style.display = (selectEl.value && selectEl.value !== '') ? 'inline-block' : 'none';
    }
  });
}

// Helper: Insert Placeholders into Textareas
function insertPlaceholder(textareaId, tag) {
  const el = document.getElementById(textareaId);
  if (!el) return;
  const start = el.selectionStart || el.value.length;
  const end = el.selectionEnd || el.value.length;
  el.value = el.value.substring(0, start) + tag + el.value.substring(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + tag.length;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Helper: Format Channel Badge
function formatChannelName(channelId) {
  if (!channelId) return `<span style="color: var(--text-faint);">None</span>`;
  if (currentGuildConfig?.channels) {
    const found = currentGuildConfig.channels.find(c => c.id === channelId);
    if (found) {
      const prefix = found.type === 'voice' ? '🔊 ' : '#';
      return `<span class="channel-tag">${prefix}${escapeHtml(found.name)}</span>`;
    }
  }
  return `<span class="channel-tag">#${escapeHtml(channelId.slice(0, 8))}...</span>`;
}

// Helper: Format Role Badge
function formatRoleName(roleId) {
  if (!roleId) return `<span style="color: var(--text-faint);">None</span>`;
  if (currentGuildConfig?.roles) {
    const found = currentGuildConfig.roles.find(r => r.id === roleId);
    if (found) {
      const color = found.color || '#93c5fd';
      return `<span class="role-tag" style="border-color: ${color}; color: ${color};">@${escapeHtml(found.name)}</span>`;
    }
  }
  return `<span class="role-tag">@${escapeHtml(roleId.slice(0, 8))}...</span>`;
}

// --- "Refresh Channels & Roles" Action Button ---
async function refreshServerData() {
  if (!activeGuildId) return;
  const btn = document.getElementById('btn-refresh-guild');
  if (btn) btn.classList.add('spinning');
  showSaveIndicator('Re-syncing with Discord...');

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/config`);
    if (res.ok) {
      const data = await res.json();
      currentGuildConfig = data;
      populateAllDropdowns(data.channels || [], data.roles || []);
      populateAllServerSettings(data.settings || {});
      renderSwitchboard(data.modules || []);
      loadFeeds();
      loadAuditLogs();
      showSaveIndicator('Channels & roles refreshed ✓');
    } else {
      showSaveIndicator('Failed to refresh');
    }
  } catch (err) {
    showSaveIndicator('Sync error: ' + err.message);
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove('spinning');
    }, 600);
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

    populateAllDropdowns(data.channels || [], data.roles || []);
    populateAllServerSettings(data.settings || {});
    renderSwitchboard(data.modules || []);
    loadAuditLogs();
  } catch (err) {
    if (nameEl) nameEl.textContent = 'Error: ' + err.message;
  }
}

// Populate all form controls and message customizers with current active server configuration
function populateAllServerSettings(s) {
  if (!s) return;

  // Helper setter
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) {
      el.value = val;
    }
  };
  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el && typeof val === 'boolean') {
      el.checked = val;
    }
  };

  // 1. General
  if (s.general) {
    setVal('gen-timezone', s.general.timezone);
    setVal('gen-changelog-channel', s.general.changelog_channel_id);
    setVal('log-config-audit-channel', s.general.config_audit_channel_id);
  }

  // 2. Moderation & Safety
  if (s.moderation) {
    setVal('mod-mute-duration', s.moderation.mute_duration_ms);
    setVal('mod-audit-channel', s.moderation.mod_audit_channel_id);
    setVal('mod-warn-threshold', s.moderation.warn_threshold);
    setVal('mod-staff-role', s.moderation.staff_role_id);
  }
  if (s.automod) {
    setChecked('automod-toggle-invites', s.automod.filter_invites);
    setChecked('automod-toggle-spam', s.automod.anti_spam);
  }
  if (s.lockdown) {
    setVal('lockdown-channel', s.lockdown.channel_id);
    setVal('lockdown-quarantine-role', s.lockdown.quarantine_role_id);
    setVal('lockdown-message-template', s.lockdown.message);
  }

  // 3. Support & Workflows
  if (s.support) {
    setVal('ticket-panel-channel', s.support.ticket_panel_channel_id);
    setVal('ticket-transcript-channel', s.support.ticket_transcript_channel_id);
    setVal('ticket-staff-role', s.support.ticket_staff_role_id);
    setVal('ticket-auto-close', s.support.ticket_auto_close_hours);
    setVal('report-review-channel', s.support.report_review_channel_id);
    setVal('report-ping-role', s.support.report_ping_role_id);
    setChecked('report-anonymous-toggle', s.support.report_anonymous);
    setVal('app-submission-channel', s.support.app_submission_channel_id);
    setVal('app-reviewer-role', s.support.app_reviewer_role_id);
    setVal('appeal-review-channel', s.support.appeal_review_channel_id);
    setVal('appeal-reviewer-role', s.support.appeal_reviewer_role_id);
    setVal('faq-forum-channel', s.support.faq_forum_channel_id);
    setVal('faq-auto-reply-mode', s.support.faq_auto_reply_mode);
  }

  // 4. Feeds
  if (s.feeds) {
    setVal('feed-directory-channel', s.feeds.directory_channel_id);
    setVal('feed-refresh-interval', s.feeds.refresh_interval);
  }

  // 5. Onboarding & Member Greetings
  if (s.onboarding) {
    setVal('welcome-channel', s.onboarding.welcome_channel_id);
    setVal('welcome-role', s.onboarding.welcome_role_id);
    setVal('welcome-embed-title', s.onboarding.welcome_embed_title);
    setVal('welcome-dm-toggle', String(s.onboarding.welcome_dm_enabled));
    setVal('welcome-message-template', s.onboarding.welcome_message);
    setVal('welcome-embed-desc', s.onboarding.welcome_embed_desc);
    setVal('birthday-channel', s.onboarding.birthday_channel_id);
    setVal('birthday-role', s.onboarding.birthday_role_id);
    setVal('birthday-message-template', s.onboarding.birthday_message);
  }

  // 6. Community, Leveling & Starboard
  if (s.community) {
    setVal('starboard-channel', s.community.starboard_channel_id);
    setVal('starboard-threshold', s.community.starboard_threshold);
    setVal('starboard-emoji', s.community.starboard_emoji);
    setVal('leveling-channel', s.community.leveling_channel_id);
    setVal('leveling-multiplier-role', s.community.leveling_multiplier_role_id);
    setVal('leveling-message-template', s.community.leveling_message);
    setVal('suggest-channel', s.community.suggest_channel_id);
    setVal('suggest-review-channel', s.community.suggest_review_channel_id);
  }

  // 7. Audit Logging & Stats
  if (s.logging) {
    setVal('log-config-audit-channel', s.logging.config_audit_channel_id);
    setVal('log-msg-channel', s.logging.log_msg_channel_id);
    setVal('log-member-channel', s.logging.log_member_channel_id);
    setVal('log-voice-channel', s.logging.log_voice_channel_id);
    setVal('log-role-channel', s.logging.log_role_channel_id);
    setVal('stats-member-channel', s.logging.stats_member_channel_id);
    setVal('stats-bot-channel', s.logging.stats_bot_channel_id);
  }

  // 8. Voice & Utilities
  if (s.voice) {
    setVal('jtc-hub-channel', s.voice.jtc_hub_channel_id);
    setVal('jtc-name-template', s.voice.jtc_name_template);
    setVal('util-poll-channel', s.voice.util_poll_channel_id);
    setVal('util-snipe-limit', s.voice.util_snipe_limit);
  }

  // Re-sync autocomplete labels
  initSearchableSelects();
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
      loadAuditLogs();
    } else {
      showSaveIndicator('Error saving');
    }
  } catch (err) {
    showSaveIndicator('Network error');
  }
}

// --- Social Feeds Manager (With Channel & Role Dropdowns) ---
async function loadFeeds() {
  const tbody = document.getElementById('feeds-table-body');
  if (!tbody || !activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/feeds`);
    const feeds = await res.json();

    if (!feeds || feeds.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No feeds subscribed yet. Use the form above to track a creator!</td></tr>`;
      return;
    }

    tbody.innerHTML = feeds.map(f => `
      <tr>
        <td><span class="platform-pill ${f.platform}">${f.platform}</span></td>
        <td><strong>${escapeHtml(f.account_name)}</strong></td>
        <td>${formatChannelName(f.channel_id)}</td>
        <td>${formatRoleName(f.ping_role_id)}</td>
        <td><span style="color: ${f.last_status === 'LIVE' ? 'var(--accent-emerald)' : 'var(--text-faint)'};">● ${f.last_status || 'OFFLINE'}</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="handleDeleteFeed('${f.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #f87171;">Failed to load feeds: ${err.message}</td></tr>`;
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

  if (!channelId) {
    alert('Please select an announcement channel from the dropdown.');
    return;
  }

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
      showSaveIndicator('Feed subscribed ✓');
      loadFeeds();
      loadAuditLogs();
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
      loadAuditLogs();
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
      showSaveIndicator('Word filtered ✓');
      loadAutoMod();
      loadAuditLogs();
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
      if (ch && data.channel_id) ch.value = data.channel_id;
      if (th && data.star_threshold) th.value = data.star_threshold;
      if (em && data.star_emoji) em.value = data.star_emoji;
      initSearchableSelects();
    }
  } catch (err) {
    console.error('Starboard fetch error:', err);
  }
}

// --- Unified Settings Save Handlers ---
async function sendCategorySettings(category, payload) {
  if (!activeGuildId) return;
  showSaveIndicator('Saving changes...');

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/save-settings/${encodeURIComponent(category)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showSaveIndicator('Settings saved ✓');
      loadAuditLogs();
    } else {
      showSaveIndicator('Error saving');
    }
  } catch (err) {
    showSaveIndicator('Network error');
  }
}

function saveGeneralSettings() {
  sendCategorySettings('general', {
    timezone: document.getElementById('gen-timezone')?.value,
    changelogChannelId: document.getElementById('gen-changelog-channel')?.value
  });
}

function saveModerationSettings() {
  sendCategorySettings('safety', {
    muteDuration: document.getElementById('mod-mute-duration')?.value,
    auditChannelId: document.getElementById('mod-audit-channel')?.value,
    warnThreshold: parseInt(document.getElementById('mod-warn-threshold')?.value || '3', 10),
    staffRoleId: document.getElementById('mod-staff-role')?.value
  });
}

function saveAutoModSettings() {
  sendCategorySettings('safety', {
    filterInvites: document.getElementById('automod-toggle-invites')?.checked,
    antiSpam: document.getElementById('automod-toggle-spam')?.checked
  });
}

function saveLockdownSettings() {
  sendCategorySettings('safety', {
    lockdownChannelId: document.getElementById('lockdown-channel')?.value,
    quarantineRoleId: document.getElementById('lockdown-quarantine-role')?.value,
    lockdownMessage: document.getElementById('lockdown-message-template')?.value
  });
}

function saveTicketSettings() {
  sendCategorySettings('support', {
    ticketPanelChannelId: document.getElementById('ticket-panel-channel')?.value,
    ticketTranscriptChannelId: document.getElementById('ticket-transcript-channel')?.value,
    ticketStaffRoleId: document.getElementById('ticket-staff-role')?.value,
    ticketAutoCloseHours: parseInt(document.getElementById('ticket-auto-close')?.value || '24', 10)
  });
}

function saveReportSettings() {
  sendCategorySettings('support', {
    reportReviewChannelId: document.getElementById('report-review-channel')?.value,
    reportPingRoleId: document.getElementById('report-ping-role')?.value,
    reportAnonymous: document.getElementById('report-anonymous-toggle')?.checked
  });
}

function saveApplicationSettings() {
  sendCategorySettings('support', {
    appSubmissionChannelId: document.getElementById('app-submission-channel')?.value,
    appReviewerRoleId: document.getElementById('app-reviewer-role')?.value
  });
}

function saveAppealSettings() {
  sendCategorySettings('support', {
    appealReviewChannelId: document.getElementById('appeal-review-channel')?.value,
    appealReviewerRoleId: document.getElementById('appeal-reviewer-role')?.value
  });
}

function saveFaqSettings() {
  sendCategorySettings('support', {
    faqForumChannelId: document.getElementById('faq-forum-channel')?.value,
    faqAutoReplyMode: document.getElementById('faq-auto-reply-mode')?.value
  });
}

function saveFeedDirectorySettings() {
  sendCategorySettings('media', {
    directoryChannelId: document.getElementById('feed-directory-channel')?.value,
    refreshInterval: parseInt(document.getElementById('feed-refresh-interval')?.value || '120', 10)
  });
}

function saveWelcomeSettings() {
  sendCategorySettings('onboarding', {
    welcomeChannelId: document.getElementById('welcome-channel')?.value,
    welcomeRoleId: document.getElementById('welcome-role')?.value,
    welcomeTitle: document.getElementById('welcome-embed-title')?.value,
    welcomeDmEnabled: document.getElementById('welcome-dm-toggle')?.value === 'true',
    welcomeMessage: document.getElementById('welcome-message-template')?.value,
    welcomeDesc: document.getElementById('welcome-embed-desc')?.value
  });
}

function saveBirthdaySettings() {
  sendCategorySettings('onboarding', {
    birthdayChannelId: document.getElementById('birthday-channel')?.value,
    birthdayRoleId: document.getElementById('birthday-role')?.value,
    birthdayMessage: document.getElementById('birthday-message-template')?.value
  });
}

function saveStarboardSettings() {
  sendCategorySettings('community', {
    starboardChannelId: document.getElementById('starboard-channel')?.value,
    starboardThreshold: parseInt(document.getElementById('starboard-threshold')?.value || '3', 10),
    starboardEmoji: document.getElementById('starboard-emoji')?.value || '⭐'
  });
}

function saveLevelingSettings() {
  sendCategorySettings('community', {
    levelingChannelId: document.getElementById('leveling-channel')?.value,
    levelingMultiplierRoleId: document.getElementById('leveling-multiplier-role')?.value,
    levelingMessage: document.getElementById('leveling-message-template')?.value
  });
}

function saveSuggestionSettings() {
  sendCategorySettings('community', {
    suggestChannelId: document.getElementById('suggest-channel')?.value,
    suggestReviewChannelId: document.getElementById('suggest-review-channel')?.value
  });
}

function saveLoggingSettings() {
  sendCategorySettings('logging', {
    logMsgChannelId: document.getElementById('log-msg-channel')?.value,
    logMemberChannelId: document.getElementById('log-member-channel')?.value,
    logVoiceChannelId: document.getElementById('log-voice-channel')?.value,
    logRoleChannelId: document.getElementById('log-role-channel')?.value
  });
}

function saveServerStatsSettings() {
  sendCategorySettings('logging', {
    statsMemberChannelId: document.getElementById('stats-member-channel')?.value,
    statsBotChannelId: document.getElementById('stats-bot-channel')?.value
  });
}

function saveVoiceSettings() {
  sendCategorySettings('voice', {
    jtcHubChannelId: document.getElementById('jtc-hub-channel')?.value,
    jtcNameTemplate: document.getElementById('jtc-name-template')?.value,
    utilPollChannelId: document.getElementById('util-poll-channel')?.value,
    utilSnipeLimit: parseInt(document.getElementById('util-snipe-limit')?.value || '25', 10)
  });
}

// --- Bot Configuration Audit Logging ---
async function loadAuditLogs() {
  if (!activeGuildId) return;
  const overviewTbody = document.getElementById('overview-audit-table-body');
  const loggingTbody = document.getElementById('logging-audit-table-body');

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/audit-logs`);
    const logs = await res.json();

    const renderRows = (list) => {
      if (!list || list.length === 0) {
        return `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No configuration changes recorded yet.</td></tr>`;
      }
      return list.map(l => {
        const timeStr = l.created_at ? new Date(l.created_at).toLocaleString() : '--';
        const sourceBadge = l.source === 'DISCORD'
          ? `<span class="source-pill DISCORD">💬 Discord</span>`
          : `<span class="source-pill DASHBOARD">🌐 Dashboard</span>`;

        return `
          <tr>
            <td class="audit-time">${escapeHtml(timeStr)}</td>
            <td><span class="audit-actor">${escapeHtml(l.actor_user_tag || 'Admin')}</span></td>
            <td>${sourceBadge}</td>
            <td><span class="cmd-pill">${escapeHtml(l.module_key || 'GENERAL')}</span></td>
            <td>
              <strong>${escapeHtml(l.action)}</strong>
              ${l.details ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(l.details)}</div>` : ''}
            </td>
          </tr>
        `;
      }).join('');
    };

    const html = renderRows(logs);
    if (overviewTbody) overviewTbody.innerHTML = html;
    if (loggingTbody) loggingTbody.innerHTML = html;
  } catch (err) {
    console.warn('Failed to load audit logs:', err);
  }
}

async function saveConfigAuditChannel() {
  if (!activeGuildId) return;
  const channelId = document.getElementById('log-config-audit-channel')?.value;
  showSaveIndicator('Saving audit channel...');

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/config-audit-channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });
    if (res.ok) {
      showSaveIndicator('Config audit channel saved ✓');
      loadAuditLogs();
    }
  } catch (err) {
    showSaveIndicator('Error saving');
  }
}

function showSaveIndicator(msg) {
  const el = document.getElementById('save-status-indicator');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
  }
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
