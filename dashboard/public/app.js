// SlickBot Web Dashboard SPA Client
let currentUser = null;
let userGuilds = [];
let activeGuildId = null;
let currentGuildConfig = null;
let allModulesList = [];
let currentCategoryFilter = 'ALL';
let botClientId = '123456789012345678';
let serverSearchQuery = '';
let hasUnsavedChanges = false;

// --- Navigation Router ---
function navigateTo(viewName, params = {}) {
  if (hasUnsavedChanges && !confirm('You have unsaved changes. Are you sure you want to leave without saving?')) {
    return;
  }
  clearDashboardDirty();

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
    if (tabId === 'embed-studio') initEmbedStudio();
    if (tabId === 'role-studio') { loadRolePanelsList(); updateRolePanelPreview(); }
    if (tabId === 'custom-studio') { loadCustomCommandsList(); updateCustomCommandPreview(); }
    if (tabId === 'analytics-studio') loadServerAnalytics();
  }
}

// --- Unsaved Changes Dirty State Tracker ---
function markDashboardDirty() {
  hasUnsavedChanges = true;
  const bar = document.getElementById('unsaved-changes-bar');
  if (bar) bar.classList.add('visible');

  const headerSave = document.getElementById('btn-save-header');
  if (headerSave) {
    headerSave.classList.remove('btn-outline');
    headerSave.classList.add('btn-primary');
  }
}

function clearDashboardDirty() {
  hasUnsavedChanges = false;
  const bar = document.getElementById('unsaved-changes-bar');
  if (bar) bar.classList.remove('visible');
}

// --- Dynamic Channel & Role Select Dropdown Populators ---
function populateAllDropdowns(channels = [], roles = []) {
  // Populate all Channel Selects
  document.querySelectorAll('select.channel-select').forEach(selectEl => {
    const currentValue = selectEl.value;
    const filterType = selectEl.getAttribute('data-type') || null;
    const allowNone = selectEl.getAttribute('data-allow-none') !== 'false';

    let html = allowNone ? `<option value="">-- None / Disabled --</option>` : `<option value="">Select a Target Channel...</option>`;
    
    // Group channels by Category / Parent
    const uncategorized = [];
    const categoriesMap = new Map();

    channels.forEach(ch => {
      // Exclude pure category headers from message destination lists unless explicitly requested
      if (ch.type === 'category' && filterType !== 'category') return;

      const isTextEligible = ch.canSend ?? (!filterType || ch.type === 'text' || ch.type === 'announcement' || ch.type === 'thread' || ch.type === 'forum' || ch.type === 'voice' || ch.type === 'stage' || ch.type === 'media');

      if (!filterType || ch.type === filterType || (filterType === 'text' && isTextEligible)) {
        if (ch.parentName) {
          if (!categoriesMap.has(ch.parentName)) categoriesMap.set(ch.parentName, []);
          categoriesMap.get(ch.parentName).push(ch);
        } else {
          uncategorized.push(ch);
        }
      }
    });

    const formatOptionHtml = (ch) => {
      let icon = '#';
      let typeLabel = '';
      if (ch.type === 'announcement') { icon = '📢'; typeLabel = ' [Announce]'; }
      else if (ch.type === 'voice') { icon = '🔊'; typeLabel = ' [Voice Text]'; }
      else if (ch.type === 'stage') { icon = '🎭'; typeLabel = ' [Stage Text]'; }
      else if (ch.type === 'forum') { icon = '💬'; typeLabel = ' [Forum]'; }
      else if (ch.type === 'thread') { icon = '🧵'; typeLabel = ' [Thread]'; }
      else if (ch.type === 'media') { icon = '🎬'; typeLabel = ' [Media]'; }
      else if (ch.type === 'category') { icon = '📂'; typeLabel = ' [Category]'; }

      return `<option value="${escapeHtml(ch.id)}">${icon} ${escapeHtml(ch.name)}${typeLabel}</option>`;
    };

    if (categoriesMap.size > 0) {
      if (uncategorized.length > 0) {
        html += `<optgroup label="General / Uncategorized">`;
        uncategorized.forEach(ch => { html += formatOptionHtml(ch); });
        html += `</optgroup>`;
      }
      for (const [catName, catChannels] of categoriesMap.entries()) {
        html += `<optgroup label="📂 ${escapeHtml(catName)}">`;
        catChannels.forEach(ch => { html += formatOptionHtml(ch); });
        html += `</optgroup>`;
      }
    } else {
      channels.forEach(ch => {
        if (ch.type === 'category' && filterType !== 'category') return;
        html += formatOptionHtml(ch);
      });
    }

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
    const targetKey = selectEl.dataset.selectId || (selectEl.dataset.selectId = (selectEl.id || selectEl.name || 'sel_' + Math.random().toString(36).substring(7)));
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
      input.placeholder = isRole ? 'Search or select role (e.g. @Moderator)...' : 'Search or select channel (e.g. #announcements)...';
      input.autocomplete = 'off';

      const controls = document.createElement('div');
      controls.className = 'searchable-select-controls';

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'searchable-select-clear';
      clearBtn.innerHTML = '&times;';
      clearBtn.title = 'Clear selection';

      arrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        if (isOpen) {
          wrapper.classList.remove('open');
        } else {
          wrapper.classList.add('open');
          input.focus();
          renderOptions('');
        }
      });

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
        const query = (filterText || '').toLowerCase().trim().replace(/^[#@📢🔊💬🧵🎬📂]\s*/, '');
        const filtered = options.filter(opt => {
          if (!opt.value && !query) return true;
          if (!opt.value && query) return false;
          const cleanText = opt.text.toLowerCase().replace(/^[#@📢🔊💬🧵🎬📂]\s*/, '');
          return !query || cleanText.includes(query) || opt.value.toLowerCase().includes(query) || (opt.parentElement?.label || '').toLowerCase().includes(query);
        });

        if (filtered.length === 0) {
          dropdown.innerHTML = `<div class="searchable-select-empty">No matching ${isRole ? 'roles' : 'channels'} found</div>`;
          return;
        }

        filtered.forEach(opt => {
          const item = document.createElement('div');
          item.className = 'searchable-select-option' + (opt.value === selectEl.value ? ' selected' : '');
          item.setAttribute('data-value', opt.value);
          
          let iconHtml = '';
          if (isRole) {
            if (!opt.value) {
              iconHtml = '🚫';
            } else {
              const roleObj = (currentGuildConfig?.roles || []).find(r => r.id === opt.value);
              const colorHex = roleObj?.color && roleObj.color !== '#000000' ? roleObj.color : '#94a3b8';
              iconHtml = `<span class="role-color-dot" style="background: ${colorHex};"></span>`;
            }
          } else {
            let icon = '#';
            if (opt.text.includes('📢')) icon = '📢';
            else if (opt.text.includes('🔊') || opt.text.includes('[Voice')) icon = '🔊';
            else if (opt.text.includes('💬') || opt.text.includes('[Forum')) icon = '💬';
            else if (opt.text.includes('🧵') || opt.text.includes('[Thread')) icon = '🧵';
            else if (opt.text.includes('🎬') || opt.text.includes('[Media')) icon = '🎬';
            else if (opt.text.includes('📂') || opt.text.includes('[Category')) icon = '📂';
            else if (!opt.value) icon = '🚫';
            iconHtml = `<span>${icon}</span>`;
          }

          const groupLabel = opt.parentElement?.tagName === 'OPTGROUP' ? opt.parentElement.label : '';
          const groupBadge = groupLabel ? `<span style="font-size: 11px; color: var(--text-faint); margin-left: auto; white-space: nowrap;">${escapeHtml(groupLabel)}</span>` : '';

          item.innerHTML = `
            <span class="option-label" style="display: flex; align-items: center; gap: 8px; width: 100%;">
              ${iconHtml}
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(opt.text.replace(/^[#📢🔊💬🧵🎬📂@]\s*/, ''))}</span>
              ${groupBadge}
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
        const isPlaceholder = !val || text.startsWith('Select a') || text.startsWith('-- None');
        input.value = (val && !isPlaceholder) ? text.replace(/^[#📢🔊💬🧵🎬📂@]\s*/, '') : '';
        clearBtn.style.display = (val && !isPlaceholder) ? 'inline-block' : 'none';
        wrapper.classList.remove('open');
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        markDashboardDirty();
      };

      input.addEventListener('focus', () => {
        wrapper.classList.add('open');
        input.select();
        renderOptions('');
      });

      input.addEventListener('click', () => {
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
        renderOptions('');
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          wrapper.classList.remove('open');
          const selectedOpt = selectEl.options[selectEl.selectedIndex];
          const isPlaceholder = !selectEl.value || (selectedOpt && (selectedOpt.text.startsWith('Select a') || selectedOpt.text.startsWith('-- None')));
          input.value = (selectEl.value && selectedOpt && !isPlaceholder) ? selectedOpt.text.replace(/^[#📢🔊💬🧵🎬📂@]\s*/, '') : '';
          clearBtn.style.display = (selectEl.value && !isPlaceholder) ? 'inline-block' : 'none';
        }
      });
    }

    // Sync input text with current select option
    const input = wrapper.querySelector('.searchable-select-input');
    const clearBtn = wrapper.querySelector('.searchable-select-clear');
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    const isPlaceholder = !selectEl.value || (selectedOpt && (selectedOpt.text.startsWith('Select a') || selectedOpt.text.startsWith('-- None')));
    if (input) {
      input.value = (selectEl.value && selectedOpt && !isPlaceholder) ? selectedOpt.text.replace(/^[#📢🔊💬🧵🎬📂@]\s*/, '') : '';
    }
    if (clearBtn) {
      clearBtn.style.display = (selectEl.value && !isPlaceholder) ? 'inline-block' : 'none';
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
  markDashboardDirty();
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
      if (document.getElementById('tab-panel-analytics-studio')?.classList.contains('active')) {
        loadServerAnalytics();
      }
      if (document.getElementById('tab-panel-role-studio')?.classList.contains('active')) {
        loadRolePanelsList();
      }
      if (document.getElementById('tab-panel-custom-studio')?.classList.contains('active')) {
        loadCustomCommandsList();
      }
      clearDashboardDirty();
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
    clearDashboardDirty();
  } catch (err) {
    if (nameEl) nameEl.textContent = 'Error: ' + err.message;
  }
}

// Populate all form controls and message customizers with current active server configuration
function populateAllServerSettings(s) {
  if (!s) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el && typeof val === 'boolean') el.checked = val;
  };

  // 1. General
  if (s.general) {
    setVal('gen-timezone', s.general.timezone);
    setVal('gen-prefix', s.general.prefix || '!');
    setVal('gen-changelog-channel', s.general.changelog_channel_id);
    setVal('gen-config-audit-channel', s.general.config_audit_channel_id);
    setVal('log-config-audit-channel', s.general.config_audit_channel_id);
  }

  // 2. Moderation & Safety
  if (s.moderation) {
    setVal('mod-mute-duration', s.moderation.mute_duration_ms);
    setVal('mod-audit-channel', s.moderation.mod_audit_channel_id);
    setVal('mod-warn-threshold', s.moderation.warn_threshold);
    setVal('mod-staff-role', s.moderation.staff_role_id);
    setChecked('mod-dm-notifications', s.moderation.dm_notifications ?? true);
  }
  if (s.automod) {
    setChecked('automod-toggle-invites', s.automod.filter_invites ?? true);
    setChecked('automod-toggle-spam', s.automod.anti_spam ?? true);
    setVal('automod-max-mentions', s.automod.max_mentions || 5);
    setVal('automod-anti-caps', s.automod.anti_caps_percent || 70);
    setVal('automod-exempt-role', s.automod.exempt_role_id);
  }
  if (s.lockdown) {
    setVal('lockdown-channel', s.lockdown.channel_id);
    setVal('lockdown-quarantine-role', s.lockdown.quarantine_role_id);
    setVal('lockdown-scope', s.lockdown.scope || 'TEXT_CHANNELS');
    setVal('lockdown-message-template', s.lockdown.message);
  }

  // 3. Support & Workflows
  if (s.support) {
    setVal('ticket-panel-channel', s.support.ticket_panel_channel_id);
    setVal('ticket-transcript-channel', s.support.ticket_transcript_channel_id);
    setVal('ticket-staff-role', s.support.ticket_staff_role_id);
    setVal('ticket-admin-role', s.support.ticket_admin_role_id);
    setVal('ticket-auto-close', s.support.ticket_auto_close_hours || 24);
    setVal('ticket-naming-format', s.support.ticket_naming_format || 'ticket-{username}');
    setVal('ticket-welcome-message', s.support.ticket_welcome_message);
    setVal('report-review-channel', s.support.report_review_channel_id);
    setVal('report-ping-role', s.support.report_ping_role_id);
    setChecked('report-anonymous-toggle', s.support.report_anonymous ?? true);
    setChecked('report-require-reason', s.support.report_require_reason ?? true);
    setVal('app-submission-channel', s.support.app_submission_channel_id);
    setVal('app-reviewer-role', s.support.app_reviewer_role_id);
    setVal('app-approved-role', s.support.app_approved_role_id);
    setVal('app-q1', s.support.app_q1);
    setVal('app-q2', s.support.app_q2);
    setVal('appeal-review-channel', s.support.appeal_review_channel_id);
    setVal('appeal-reviewer-role', s.support.appeal_reviewer_role_id);
    setVal('appeal-cooldown-days', s.support.appeal_cooldown_days || 30);
    setVal('faq-forum-channel', s.support.faq_forum_channel_id);
    setVal('faq-auto-reply-mode', s.support.faq_auto_reply_mode || 'ENABLED');
  }

  // 4. Feeds
  if (s.feeds) {
    setVal('feed-directory-channel', s.feeds.directory_channel_id);
    setVal('feed-refresh-interval', s.feeds.refresh_interval || 120);
    setVal('feed-message-template', s.feeds.message_template);
  }

  // 5. Onboarding & Member Greetings
  if (s.onboarding) {
    setVal('welcome-channel', s.onboarding.welcome_channel_id);
    setVal('welcome-role', s.onboarding.welcome_role_id);
    setVal('welcome-embed-title', s.onboarding.welcome_embed_title);
    setVal('welcome-dm-toggle', String(s.onboarding.welcome_dm_enabled ?? false));
    setVal('welcome-banner-url', s.onboarding.welcome_banner_url);
    setVal('welcome-embed-color', s.onboarding.welcome_embed_color || '#3b82f6');
    setVal('welcome-message-template', s.onboarding.welcome_message);
    setVal('welcome-embed-desc', s.onboarding.welcome_embed_desc);
    setVal('birthday-channel', s.onboarding.birthday_channel_id);
    setVal('birthday-role', s.onboarding.birthday_role_id);
    setVal('birthday-message-template', s.onboarding.birthday_message);
    setVal('role-panel-channel', s.onboarding.role_panel_channel_id);
    setVal('role-panel-mode', s.onboarding.role_panel_mode || 'BUTTONS');
    setVal('temprole-max-hours', s.onboarding.temprole_max_hours || 168);
  }

  // 6. Community, Leveling & Starboard
  if (s.community) {
    setVal('starboard-channel', s.community.starboard_channel_id);
    setVal('starboard-threshold', s.community.starboard_threshold || 3);
    setVal('starboard-emoji', s.community.starboard_emoji || '⭐');
    setChecked('starboard-self-stars', s.community.starboard_self_stars ?? false);
    setChecked('starboard-allow-nsfw', s.community.starboard_allow_nsfw ?? false);
    setVal('leveling-channel', s.community.leveling_channel_id);
    setVal('leveling-multiplier-role', s.community.leveling_multiplier_role_id);
    setVal('leveling-xp-rate', s.community.leveling_xp_rate || 15);
    setVal('leveling-reward-5', s.community.leveling_reward_5);
    setVal('leveling-reward-10', s.community.leveling_reward_10);
    setVal('leveling-reward-25', s.community.leveling_reward_25);
    setVal('leveling-message-template', s.community.leveling_message);
    setVal('suggest-channel', s.community.suggest_channel_id);
    setVal('suggest-review-channel', s.community.suggest_review_channel_id);
    setChecked('suggest-auto-thread', s.community.suggest_auto_thread ?? true);
    setChecked('suggest-anonymous', s.community.suggest_anonymous ?? false);
    setVal('giveaway-channel', s.community.giveaway_channel_id);
    setVal('giveaway-manager-role', s.community.giveaway_manager_role_id);
    setVal('games-counting-channel', s.community.games_counting_channel_id);
    setVal('games-trivia-channel', s.community.games_trivia_channel_id);
  }

  // 7. Audit Logging & Stats
  if (s.logging) {
    setVal('gen-config-audit-channel', s.logging.config_audit_channel_id);
    setVal('log-config-audit-channel', s.logging.config_audit_channel_id);
    setVal('log-msg-channel', s.logging.log_msg_channel_id);
    setVal('log-member-channel', s.logging.log_member_channel_id);
    setVal('log-voice-channel', s.logging.log_voice_channel_id);
    setVal('log-role-channel', s.logging.log_role_channel_id);
    setVal('stats-member-channel', s.logging.stats_member_channel_id);
    setVal('stats-member-format', s.logging.stats_member_format || 'Members: {count}');
    setVal('stats-bot-channel', s.logging.stats_bot_channel_id);
    setVal('stats-bot-format', s.logging.stats_bot_format || 'Bots: {count}');
  }

  // 8. Voice & Utilities
  if (s.voice) {
    setVal('jtc-hub-channel', s.voice.jtc_hub_channel_id);
    setVal('jtc-name-template', s.voice.jtc_name_template || "{user}'s Lounge");
    setVal('jtc-user-limit', s.voice.jtc_user_limit || 0);
    setVal('jtc-category', s.voice.jtc_category_id);
    setVal('util-poll-channel', s.voice.util_poll_channel_id);
    setVal('util-snipe-limit', s.voice.util_snipe_limit || 25);
    setChecked('util-afk-toggle', s.voice.util_afk_toggle ?? true);
  }

  // Re-sync autocomplete labels
  initSearchableSelects();
}

// --- Collect All Dashboard Settings for Pushing to Server ---
function collectAllDashboardSettings() {
  const configAuditChan = document.getElementById('gen-config-audit-channel')?.value || document.getElementById('log-config-audit-channel')?.value;

  return {
    general: {
      timezone: document.getElementById('gen-timezone')?.value,
      prefix: document.getElementById('gen-prefix')?.value || '!',
      changelog_channel_id: document.getElementById('gen-changelog-channel')?.value,
      config_audit_channel_id: configAuditChan
    },
    moderation: {
      mute_duration_ms: document.getElementById('mod-mute-duration')?.value,
      mod_audit_channel_id: document.getElementById('mod-audit-channel')?.value,
      warn_threshold: parseInt(document.getElementById('mod-warn-threshold')?.value || '3', 10),
      staff_role_id: document.getElementById('mod-staff-role')?.value,
      dm_notifications: document.getElementById('mod-dm-notifications')?.checked ?? true
    },
    automod: {
      filter_invites: document.getElementById('automod-toggle-invites')?.checked ?? true,
      anti_spam: document.getElementById('automod-toggle-spam')?.checked ?? true,
      max_mentions: parseInt(document.getElementById('automod-max-mentions')?.value || '5', 10),
      anti_caps_percent: parseInt(document.getElementById('automod-anti-caps')?.value || '70', 10),
      exempt_role_id: document.getElementById('automod-exempt-role')?.value
    },
    lockdown: {
      channel_id: document.getElementById('lockdown-channel')?.value,
      quarantine_role_id: document.getElementById('lockdown-quarantine-role')?.value,
      scope: document.getElementById('lockdown-scope')?.value || 'TEXT_CHANNELS',
      message: document.getElementById('lockdown-message-template')?.value
    },
    support: {
      ticket_panel_channel_id: document.getElementById('ticket-panel-channel')?.value,
      ticket_transcript_channel_id: document.getElementById('ticket-transcript-channel')?.value,
      ticket_staff_role_id: document.getElementById('ticket-staff-role')?.value,
      ticket_admin_role_id: document.getElementById('ticket-admin-role')?.value,
      ticket_auto_close_hours: parseInt(document.getElementById('ticket-auto-close')?.value || '24', 10),
      ticket_naming_format: document.getElementById('ticket-naming-format')?.value || 'ticket-{username}',
      ticket_welcome_message: document.getElementById('ticket-welcome-message')?.value,
      report_review_channel_id: document.getElementById('report-review-channel')?.value,
      report_ping_role_id: document.getElementById('report-ping-role')?.value,
      report_anonymous: document.getElementById('report-anonymous-toggle')?.checked ?? true,
      report_require_reason: document.getElementById('report-require-reason')?.checked ?? true,
      app_submission_channel_id: document.getElementById('app-submission-channel')?.value,
      app_reviewer_role_id: document.getElementById('app-reviewer-role')?.value,
      app_approved_role_id: document.getElementById('app-approved-role')?.value,
      app_q1: document.getElementById('app-q1')?.value,
      app_q2: document.getElementById('app-q2')?.value,
      appeal_review_channel_id: document.getElementById('appeal-review-channel')?.value,
      appeal_reviewer_role_id: document.getElementById('appeal-reviewer-role')?.value,
      appeal_cooldown_days: parseInt(document.getElementById('appeal-cooldown-days')?.value || '30', 10),
      faq_forum_channel_id: document.getElementById('faq-forum-channel')?.value,
      faq_auto_reply_mode: document.getElementById('faq-auto-reply-mode')?.value || 'ENABLED'
    },
    feeds: {
      directory_channel_id: document.getElementById('feed-directory-channel')?.value,
      refresh_interval: parseInt(document.getElementById('feed-refresh-interval')?.value || '120', 10),
      message_template: document.getElementById('feed-message-template')?.value
    },
    onboarding: {
      welcome_channel_id: document.getElementById('welcome-channel')?.value,
      welcome_role_id: document.getElementById('welcome-role')?.value,
      welcome_embed_title: document.getElementById('welcome-embed-title')?.value,
      welcome_dm_enabled: document.getElementById('welcome-dm-toggle')?.value === 'true',
      welcome_banner_url: document.getElementById('welcome-banner-url')?.value,
      welcome_embed_color: document.getElementById('welcome-embed-color')?.value,
      welcome_message: document.getElementById('welcome-message-template')?.value,
      welcome_embed_desc: document.getElementById('welcome-embed-desc')?.value,
      birthday_channel_id: document.getElementById('birthday-channel')?.value,
      birthday_role_id: document.getElementById('birthday-role')?.value,
      birthday_message: document.getElementById('birthday-message-template')?.value,
      role_panel_channel_id: document.getElementById('role-panel-channel')?.value,
      role_panel_mode: document.getElementById('role-panel-mode')?.value || 'BUTTONS',
      temprole_max_hours: parseInt(document.getElementById('temprole-max-hours')?.value || '168', 10)
    },
    community: {
      starboard_channel_id: document.getElementById('starboard-channel')?.value,
      starboard_threshold: parseInt(document.getElementById('starboard-threshold')?.value || '3', 10),
      starboard_emoji: document.getElementById('starboard-emoji')?.value || '⭐',
      starboard_self_stars: document.getElementById('starboard-self-stars')?.checked ?? false,
      starboard_allow_nsfw: document.getElementById('starboard-allow-nsfw')?.checked ?? false,
      leveling_channel_id: document.getElementById('leveling-channel')?.value,
      leveling_multiplier_role_id: document.getElementById('leveling-multiplier-role')?.value,
      leveling_xp_rate: parseInt(document.getElementById('leveling-xp-rate')?.value || '15', 10),
      leveling_reward_5: document.getElementById('leveling-reward-5')?.value,
      leveling_reward_10: document.getElementById('leveling-reward-10')?.value,
      leveling_reward_25: document.getElementById('leveling-reward-25')?.value,
      leveling_message: document.getElementById('leveling-message-template')?.value,
      suggest_channel_id: document.getElementById('suggest-channel')?.value,
      suggest_review_channel_id: document.getElementById('suggest-review-channel')?.value,
      suggest_auto_thread: document.getElementById('suggest-auto-thread')?.checked ?? true,
      suggest_anonymous: document.getElementById('suggest-anonymous')?.checked ?? false,
      giveaway_channel_id: document.getElementById('giveaway-channel')?.value,
      giveaway_manager_role_id: document.getElementById('giveaway-manager-role')?.value,
      games_counting_channel_id: document.getElementById('games-counting-channel')?.value,
      games_trivia_channel_id: document.getElementById('games-trivia-channel')?.value
    },
    logging: {
      config_audit_channel_id: configAuditChan,
      log_msg_channel_id: document.getElementById('log-msg-channel')?.value,
      log_member_channel_id: document.getElementById('log-member-channel')?.value,
      log_voice_channel_id: document.getElementById('log-voice-channel')?.value,
      log_role_channel_id: document.getElementById('log-role-channel')?.value,
      stats_member_channel_id: document.getElementById('stats-member-channel')?.value,
      stats_member_format: document.getElementById('stats-member-format')?.value || 'Members: {count}',
      stats_bot_channel_id: document.getElementById('stats-bot-channel')?.value,
      stats_bot_format: document.getElementById('stats-bot-format')?.value || 'Bots: {count}'
    },
    voice: {
      jtc_hub_channel_id: document.getElementById('jtc-hub-channel')?.value,
      jtc_name_template: document.getElementById('jtc-name-template')?.value || "{user}'s Lounge",
      jtc_user_limit: parseInt(document.getElementById('jtc-user-limit')?.value || '0', 10),
      jtc_category_id: document.getElementById('jtc-category')?.value,
      util_poll_channel_id: document.getElementById('util-poll-channel')?.value,
      util_snipe_limit: parseInt(document.getElementById('util-snipe-limit')?.value || '25', 10),
      util_afk_toggle: document.getElementById('util-afk-toggle')?.checked ?? true
    }
  };
}

// --- "💾 Save Changes" Master Action ---
async function handleSaveAllDashboard() {
  if (!activeGuildId) return;

  const btnHeader = document.getElementById('btn-save-header');
  const btnFloating = document.getElementById('btn-save-floating');

  if (btnHeader) btnHeader.textContent = 'Saving...';
  if (btnFloating) btnFloating.textContent = 'Saving...';
  showSaveIndicator('Pushing configuration to bot...');

  const settingsPayload = collectAllDashboardSettings();

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/save-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: settingsPayload })
    });

    if (res.ok) {
      if (currentGuildConfig) currentGuildConfig.settings = settingsPayload;
      clearDashboardDirty();
      showSaveIndicator('Configuration saved to server ✓');
      loadAuditLogs();
    } else {
      showSaveIndicator('Error saving changes');
    }
  } catch (err) {
    showSaveIndicator('Network error: ' + err.message);
  } finally {
    if (btnHeader) btnHeader.textContent = '💾 Save Changes';
    if (btnFloating) btnFloating.textContent = '💾 Save Changes';
  }
}

// --- "↺ Reset Changes" Master Action ---
function handleResetDashboard() {
  if (!currentGuildConfig?.settings) return;
  populateAllServerSettings(currentGuildConfig.settings);
  clearDashboardDirty();
  showSaveIndicator('Changes reset to server state ↺');
}

// --- Server Configuration Health & Readiness Diagnostics Scan ---
async function runServerDiagnostics() {
  if (!activeGuildId) return;
  const container = document.getElementById('diagnostics-container');
  const btn = document.getElementById('btn-run-diagnostics');
  if (btn) btn.classList.add('spinning');
  if (container) container.innerHTML = `<div style="padding: 12px; color: var(--text-muted);">Running deep configuration diagnostics...</div>`;

  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/diagnostics`);
    if (!res.ok) throw new Error('Diagnostics scan failed');

    const data = await res.json();
    const score = data.score || 100;
    const checks = data.checks || [];

    let scoreClass = 'PASS';
    let scoreText = 'OPTIMAL & READY';
    if (score < 70) {
      scoreClass = 'FAIL';
      scoreText = 'ACTION REQUIRED';
    } else if (score < 90) {
      scoreClass = 'WARN';
      scoreText = 'NEEDS ATTENTION';
    }

    let html = `
      <div class="diag-summary-header">
        <div class="diag-score-display">
          <div class="diag-score-badge ${scoreClass}">${score}%</div>
          <div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 15px;">Overall Health Status: ${scoreText}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${checks.filter(c => c.status === 'PASS').length} of ${checks.length} system checks fully operational</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="runServerDiagnostics()">🔄 Re-Scan</button>
      </div>

      <div class="diag-item-list">
    `;

    checks.forEach(c => {
      let icon = '🟢';
      if (c.status === 'WARN') icon = '🟡';
      if (c.status === 'FAIL') icon = '🔴';

      html += `
        <div class="diag-item">
          <div class="diag-icon">${icon}</div>
          <div class="diag-body">
            <div class="diag-title">${escapeHtml(c.name)} <span class="cmd-pill" style="font-size: 10px; margin-left: 6px;">${escapeHtml(c.category)}</span></div>
            <div class="diag-desc">${escapeHtml(c.message)}</div>
            ${c.recommendation ? `<div class="diag-rec">💡 Recommendation: ${escapeHtml(c.recommendation)}</div>` : ''}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color: #f87171; padding: 8px;">Scan error: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) btn.classList.remove('spinning');
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
  showSaveIndicator('Updating module state...');
  try {
    const res = await fetch(`/api/guilds/${encodeURIComponent(activeGuildId)}/toggle-module`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey, enabled })
    });
    if (res.ok) {
      showSaveIndicator('Module updated ✓');
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

  // Dirty change listener across all manage content inputs
  const contentArea = document.querySelector('.manage-content-area');
  if (contentArea) {
    contentArea.addEventListener('input', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        markDashboardDirty();
      }
    });
    contentArea.addEventListener('change', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        markDashboardDirty();
      }
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  checkUrlErrors();
  checkAuth();
  fetchModulesCatalog();
  fetchHealth();
  setInterval(fetchHealth, 15000);
});

// ==========================================================================
// 🎨 DISCORD EMBED & ANNOUNCEMENT STUDIO ENGINE
// ==========================================================================

let embedFieldsList = [];
let editingEmbedMessageId = null;
let editingEmbedChannelId = null;

function formatDiscordMarkdown(text) {
  if (!text) return '';
  let str = escapeHtml(text);
  // Code block
  str = str.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  str = str.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Underline
  str = str.replace(/__([^_]+)__/g, '<u>$1</u>');
  // Strikethrough
  str = str.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Mentions
  str = str.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@user</span>');
  str = str.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>');
  str = str.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');
  str = str.replace(/@(everyone|here)/g, '<span class="mention">@$1</span>');
  return str;
}

function initEmbedStudio() {
  if (currentGuildConfig?.channels) {
    populateAllDropdowns(currentGuildConfig.channels, currentGuildConfig.roles || []);
  }
  if (embedFieldsList.length === 0) {
    embedFieldsList = [
      { id: 'f_1', name: '📌 Important Guidelines', value: 'Please respect all members and follow Discord TOS.', inline: false },
      { id: 'f_2', name: '🎫 Need Help?', value: 'Open a ticket in #support-tickets', inline: true },
      { id: 'f_3', name: '🔔 Stay Updated', value: 'Grab stream roles in #onboarding', inline: true }
    ];
    renderEmbedFieldsList();
  }
  updateEmbedPreview();
}

function resetEmbedStudio() {
  cancelMessageEditMode();
  document.getElementById('embed-template-select').value = '';
  document.getElementById('embed-content').value = '';
  document.getElementById('embed-author-name').value = '';
  document.getElementById('embed-author-icon').value = '';
  document.getElementById('embed-author-url').value = '';
  document.getElementById('embed-title').value = '🌟 Official Community Announcement';
  document.getElementById('embed-title-url').value = '';
  document.getElementById('embed-description').value = 'Write your announcement details here...';
  setEmbedColor('#5865f2');
  document.getElementById('embed-thumbnail-url').value = '';
  document.getElementById('embed-image-url').value = '';
  document.getElementById('embed-footer-text').value = 'SlickBot Announcement Engine';
  document.getElementById('embed-footer-icon').value = '';
  document.getElementById('embed-timestamp-toggle').checked = true;
  embedFieldsList = [];
  renderEmbedFieldsList();
  updateEmbedPreview();
}

function handleAddEmbedField(initialObj = null) {
  if (embedFieldsList.length >= 25) {
    alert('Maximum 25 fields allowed per Discord embed.');
    return;
  }
  const fieldId = 'f_' + Math.random().toString(36).substring(7);
  embedFieldsList.push(initialObj || {
    id: fieldId,
    name: 'New Section',
    value: 'Section description text',
    inline: false
  });
  renderEmbedFieldsList();
  updateEmbedPreview();
}

function handleRemoveEmbedField(fieldId) {
  embedFieldsList = embedFieldsList.filter(f => f.id !== fieldId);
  renderEmbedFieldsList();
  updateEmbedPreview();
}

function handleEmbedFieldChange(fieldId, key, value) {
  const f = embedFieldsList.find(item => item.id === fieldId);
  if (f) {
    f[key] = value;
    updateEmbedPreview();
  }
}

function renderEmbedFieldsList() {
  const container = document.getElementById('embed-fields-container');
  const countEl = document.getElementById('embed-fields-count');
  if (!container) return;

  if (countEl) countEl.textContent = embedFieldsList.length;

  if (embedFieldsList.length === 0) {
    container.innerHTML = `<div style="color: var(--text-faint); font-size: 13px; padding: 6px 0;">No fields added yet. Click "+ Add Field" to create a section.</div>`;
    return;
  }

  container.innerHTML = embedFieldsList.map((f, idx) => `
    <div class="embed-field-row" data-field-id="${f.id}">
      <div>
        <input type="text" class="form-input" style="font-size: 13px; font-weight: 600;" placeholder="Field Name" value="${escapeHtml(f.name)}" oninput="handleEmbedFieldChange('${f.id}', 'name', this.value)">
      </div>
      <div>
        <input type="text" class="form-input" style="font-size: 13px;" placeholder="Field Value" value="${escapeHtml(f.value)}" oninput="handleEmbedFieldChange('${f.id}', 'value', this.value)">
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <label class="checkbox-label" style="font-size: 12px; margin-bottom: 0;">
          <input type="checkbox" ${f.inline ? 'checked' : ''} onchange="handleEmbedFieldChange('${f.id}', 'inline', this.checked)">
          <span>Inline</span>
        </label>
      </div>
      <div>
        <button type="button" class="btn btn-outline btn-sm" style="color: var(--accent-red); padding: 4px 8px;" onclick="handleRemoveEmbedField('${f.id}')" title="Delete Field">&times;</button>
      </div>
    </div>
  `).join('');
}

function setEmbedColor(hex) {
  const picker = document.getElementById('embed-color-picker');
  const hexInput = document.getElementById('embed-color-hex');
  if (picker) picker.value = hex;
  if (hexInput) hexInput.value = hex;
  updateEmbedPreview();
}

function handleEmbedColorPicker(val) {
  const hexInput = document.getElementById('embed-color-hex');
  if (hexInput) hexInput.value = val;
  updateEmbedPreview();
}

function handleEmbedColorHex(val) {
  let hex = val.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    const picker = document.getElementById('embed-color-picker');
    if (picker) picker.value = hex;
    updateEmbedPreview();
  }
}

function handleApplyEmbedTemplate(templateKey) {
  if (!templateKey) return;

  if (templateKey === 'welcome') {
    document.getElementById('embed-content').value = 'Welcome to the server @everyone!';
    document.getElementById('embed-author-name').value = 'SlickBot Community Gateway';
    document.getElementById('embed-title').value = '👋 Welcome to Our Server!';
    document.getElementById('embed-description').value = 'We are thrilled to have you here! Please make sure to check out our rules, select your roles, and say hi in `#general-chat`.';
    setEmbedColor('#5865f2');
    embedFieldsList = [
      { id: 'f_1', name: '📜 Rules & Guidelines', value: '1. Be kind & respectful\n2. No spam or self-promo\n3. Keep channels relevant', inline: false },
      { id: 'f_2', name: '🎭 Self Roles', value: 'Head over to #roles to pick your stream pings.', inline: true },
      { id: 'f_3', name: '🎫 Need Help?', value: 'Open a ticket in #support-tickets anytime.', inline: true }
    ];
  } else if (templateKey === 'announcement') {
    document.getElementById('embed-content').value = '📢 @everyone Attention Community Members!';
    document.getElementById('embed-author-name').value = 'Server Leadership Team';
    document.getElementById('embed-title').value = '🌟 Important Community Announcement';
    document.getElementById('embed-description').value = 'We are excited to share some major updates regarding our server infrastructure, upcoming events, and new bot features.';
    setEmbedColor('#f59e0b');
    embedFieldsList = [
      { id: 'f_1', name: '🚀 What is New?', value: 'SlickBot 29 modular systems have been deployed across our community.', inline: false },
      { id: 'f_2', name: '🏆 Progression Rewards', value: 'Earn voice XP and milestone roles simply by hanging out!', inline: true },
      { id: 'f_3', name: '📅 Date & Time', value: 'Effective immediately.', inline: true }
    ];
  } else if (templateKey === 'patch_notes') {
    document.getElementById('embed-content').value = '';
    document.getElementById('embed-author-name').value = 'SlickBot Releases';
    document.getElementById('embed-title').value = '⚡ Bot Release v0.9.8 Changelog';
    document.getElementById('embed-description').value = 'A brand new update has been pushed to SlickBot! Here is what changed:';
    setEmbedColor('#10b981');
    embedFieldsList = [
      { id: 'f_1', name: '✨ New Features', value: '• Interactive Visual Embed Builder\n• Custom Command Studio\n• Role Panels Live Preview\n• Server Analytics & Heatmaps', inline: false },
      { id: 'f_2', name: '🛠️ Fixes & Polish', value: '• Zero command duplication\n• Faster database connection pooling\n• Responsive web console', inline: false }
    ];
  } else if (templateKey === 'event') {
    document.getElementById('embed-content').value = '🎉 @everyone Community Game Night is happening this weekend!';
    document.getElementById('embed-author-name').value = 'Community Events Team';
    document.getElementById('embed-title').value = '🎮 Weekend Community Game Night';
    document.getElementById('embed-description').value = 'Join us this Saturday for community trivia, Jackbox games, and voice lounge hangouts with special prizes!';
    setEmbedColor('#8b5cf6');
    embedFieldsList = [
      { id: 'f_1', name: '🕒 Time & Location', value: 'Saturday @ 8:00 PM ET in General Voice Lounge', inline: true },
      { id: 'f_2', name: '🎁 Prizes & Rewards', value: 'VIP Role, 5,000 XP & Discord Nitro', inline: true },
      { id: 'f_3', name: '📝 How to RSVP', value: 'Click the RSVP button in the event card below!', inline: false }
    ];
  } else if (templateKey === 'stream') {
    document.getElementById('embed-content').value = '🔴 @everyone SlickPickleNick is now LIVE!';
    document.getElementById('embed-author-name').value = 'Twitch Alerts';
    document.getElementById('embed-title').value = '🔴 LIVE NOW: Playing Community Games with Viewers!';
    document.getElementById('embed-title-url').value = 'https://twitch.tv/slickpicklenick';
    document.getElementById('embed-description').value = 'Come hang out in chat, earn drop codes, and join multiplayer matches!';
    setEmbedColor('#9146ff');
    embedFieldsList = [
      { id: 'f_1', name: '🎮 Category', value: 'Just Chatting / Gaming', inline: true },
      { id: 'f_2', name: '🎁 Stream Drops', value: 'Type /redeem in Discord for stream XP!', inline: true }
    ];
  } else if (templateKey === 'giveaway') {
    document.getElementById('embed-content').value = '🎉 SPECIAL GIVEAWAY @everyone!';
    document.getElementById('embed-author-name').value = 'SlickBot Giveaways';
    document.getElementById('embed-title').value = '🎁 Discord Nitro (1 Month) Giveaway!';
    document.getElementById('embed-description').value = 'To celebrate our community milestone, we are giving away 1 Month of Discord Nitro to one lucky member!';
    setEmbedColor('#ec4899');
    embedFieldsList = [
      { id: 'f_1', name: '👑 Hosted By', value: 'SlickPickleNick', inline: true },
      { id: 'f_2', name: '⏰ Ends In', value: '48 Hours', inline: true },
      { id: 'f_3', name: '🎉 How to Enter', value: 'Click the 🎉 button on this giveaway message!', inline: false }
    ];
  } else if (templateKey === 'support') {
    document.getElementById('embed-content').value = '';
    document.getElementById('embed-author-name').value = 'SlickBot Support Desk';
    document.getElementById('embed-title').value = '🎫 Need Assistance? Open a Support Ticket';
    document.getElementById('embed-description').value = 'Our staff team is here to assist you with any questions, member reports, or appeals.';
    setEmbedColor('#5865f2');
    embedFieldsList = [
      { id: 'f_1', name: '❓ General Support', value: 'Questions about server perks, roles, or bot commands.', inline: true },
      { id: 'f_2', name: '🛡️ Member Reports', value: 'Confidential reporting for rule violations.', inline: true },
      { id: 'f_3', name: '⚖️ Ban Appeals', value: 'Submit an appeal for moderated accounts.', inline: true }
    ];
  } else if (templateKey === 'blank') {
    resetEmbedStudio();
    return;
  }

  renderEmbedFieldsList();
  updateEmbedPreview();
}

function updateEmbedPreview() {
  const content = document.getElementById('embed-content')?.value || '';
  const authorName = document.getElementById('embed-author-name')?.value || '';
  const authorIcon = document.getElementById('embed-author-icon')?.value || '';
  const authorUrl = document.getElementById('embed-author-url')?.value || '';
  const title = document.getElementById('embed-title')?.value || '';
  const titleUrl = document.getElementById('embed-title-url')?.value || '';
  const description = document.getElementById('embed-description')?.value || '';
  const color = document.getElementById('embed-color-hex')?.value || '#5865f2';
  const thumbnailUrl = document.getElementById('embed-thumbnail-url')?.value || '';
  const imageUrl = document.getElementById('embed-image-url')?.value || '';
  const footerText = document.getElementById('embed-footer-text')?.value || '';
  const footerIcon = document.getElementById('embed-footer-icon')?.value || '';
  const showTimestamp = document.getElementById('embed-timestamp-toggle')?.checked ?? true;

  // 1. Text body above embed
  const simTextContent = document.getElementById('discord-sim-text-content');
  if (simTextContent) {
    if (content.trim()) {
      simTextContent.style.display = 'block';
      simTextContent.innerHTML = formatDiscordMarkdown(content);
    } else {
      simTextContent.style.display = 'none';
    }
  }

  // 2. Embed Card Border Color
  const embedCard = document.getElementById('discord-sim-embed-card');
  if (embedCard) {
    embedCard.style.borderLeftColor = color;
  }

  // 3. Author
  const authorEl = document.getElementById('discord-sim-author');
  const authorIconEl = document.getElementById('discord-sim-author-icon');
  const authorNameEl = document.getElementById('discord-sim-author-name');
  if (authorEl && authorNameEl) {
    if (authorName.trim()) {
      authorEl.style.display = 'flex';
      authorNameEl.textContent = authorName;
      if (authorIcon && authorIconEl) {
        authorIconEl.src = authorIcon;
        authorIconEl.style.display = 'inline-block';
      } else if (authorIconEl) {
        authorIconEl.style.display = 'none';
      }
    } else {
      authorEl.style.display = 'none';
    }
  }

  // 4. Title
  const titleEl = document.getElementById('discord-sim-title');
  if (titleEl) {
    if (title.trim()) {
      titleEl.style.display = 'block';
      if (titleUrl && (titleUrl.startsWith('http://') || titleUrl.startsWith('https://'))) {
        titleEl.innerHTML = `<a href="${escapeHtml(titleUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`;
      } else {
        titleEl.textContent = title;
      }
    } else {
      titleEl.style.display = 'none';
    }
  }

  // 5. Description
  const descEl = document.getElementById('discord-sim-description');
  if (descEl) {
    if (description.trim()) {
      descEl.style.display = 'block';
      descEl.innerHTML = formatDiscordMarkdown(description);
    } else {
      descEl.style.display = 'none';
    }
  }

  // 6. Fields Grid
  const fieldsGrid = document.getElementById('discord-sim-fields-grid');
  if (fieldsGrid) {
    if (embedFieldsList.length > 0) {
      fieldsGrid.style.display = 'grid';
      fieldsGrid.innerHTML = embedFieldsList.map(f => `
        <div class="discord-field-item ${f.inline ? '' : 'full-width'}">
          <div class="discord-field-name">${escapeHtml(f.name || '\u200B')}</div>
          <div class="discord-field-val">${formatDiscordMarkdown(f.value || '\u200B')}</div>
        </div>
      `).join('');
    } else {
      fieldsGrid.style.display = 'none';
      fieldsGrid.innerHTML = '';
    }
  }

  // 7. Thumbnail
  const thumbContainer = document.getElementById('discord-sim-thumbnail-container');
  const thumbImg = document.getElementById('discord-sim-thumbnail');
  if (thumbContainer && thumbImg) {
    if (thumbnailUrl.trim() && (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://'))) {
      thumbContainer.style.display = 'block';
      thumbImg.src = thumbnailUrl;
    } else {
      thumbContainer.style.display = 'none';
    }
  }

  // 8. Image
  const imageContainer = document.getElementById('discord-sim-image-container');
  const imageImg = document.getElementById('discord-sim-image');
  if (imageContainer && imageImg) {
    if (imageUrl.trim() && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      imageContainer.style.display = 'block';
      imageImg.src = imageUrl;
    } else {
      imageContainer.style.display = 'none';
    }
  }

  // 9. Footer & Timestamp
  const footerEl = document.getElementById('discord-sim-footer');
  const footerTextEl = document.getElementById('discord-sim-footer-text');
  const footerIconEl = document.getElementById('discord-sim-footer-icon');
  const bulletEl = document.getElementById('discord-sim-footer-bullet');
  const timeEl = document.getElementById('discord-sim-footer-time');

  if (footerEl && footerTextEl) {
    if (footerText.trim() || showTimestamp) {
      footerEl.style.display = 'flex';
      footerTextEl.textContent = footerText || '';

      if (footerIcon && footerIconEl) {
        footerIconEl.src = footerIcon;
        footerIconEl.style.display = 'inline-block';
      } else if (footerIconEl) {
        footerIconEl.style.display = 'none';
      }

      if (showTimestamp && timeEl) {
        timeEl.style.display = 'inline';
        if (bulletEl) bulletEl.style.display = footerText.trim() ? 'inline' : 'none';
      } else if (timeEl) {
        timeEl.style.display = 'none';
        if (bulletEl) bulletEl.style.display = 'none';
      }
    } else {
      footerEl.style.display = 'none';
    }
  }
}

// --- Load Existing Message for In-Place Editing ---
async function handleLoadExistingMessage() {
  const rawInput = document.getElementById('embed-load-input')?.value || '';
  if (!rawInput.trim()) {
    alert('Please paste a Discord message link or Message ID.');
    return;
  }

  let messageId = rawInput.trim();
  let channelId = '';

  // Extract from Discord Message Link: https://discord.com/channels/guildId/channelId/messageId
  const match = rawInput.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i);
  if (match) {
    channelId = match[2];
    messageId = match[3];
  } else {
    // If not a link, check selected channel in target dropdown
    channelId = document.getElementById('embed-target-channel')?.value || '';
  }

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/messages/${encodeURIComponent(messageId)}?channelId=${encodeURIComponent(channelId)}`);
    const data = await res.json();

    if (!res.ok || !data.ok || !data.message) {
      throw new Error(data.error || 'Could not fetch message from Discord.');
    }

    const msg = data.message;
    editingEmbedMessageId = msg.id;
    editingEmbedChannelId = msg.channelId || channelId;

    // Show active editing badge & cancel button
    const badge = document.getElementById('embed-edit-badge');
    const badgeText = document.getElementById('embed-editing-id-text');
    const cancelBtn = document.getElementById('btn-cancel-edit-mode');
    const dispatchBtn = document.getElementById('btn-dispatch-embed');

    if (badge && badgeText) {
      badge.style.display = 'inline-flex';
      badgeText.textContent = `#${msg.id}`;
    }
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (dispatchBtn) {
      dispatchBtn.innerHTML = '💾 Update Existing Discord Message';
      dispatchBtn.classList.remove('btn-primary');
      dispatchBtn.classList.add('btn-discord');
    }

    // Set Target Channel if matched
    const targetChannelSelect = document.getElementById('embed-target-channel');
    if (targetChannelSelect && msg.channelId) {
      targetChannelSelect.value = msg.channelId;
    }

    // Populate Content & Embed
    document.getElementById('embed-content').value = msg.content || '';

    if (msg.embed) {
      const e = msg.embed;
      document.getElementById('embed-title').value = e.title || '';
      document.getElementById('embed-title-url').value = e.url || '';
      document.getElementById('embed-description').value = e.description || '';
      if (e.color) setEmbedColor(e.color);
      document.getElementById('embed-author-name').value = e.author?.name || '';
      document.getElementById('embed-author-icon').value = e.author?.icon_url || e.author?.iconURL || '';
      document.getElementById('embed-author-url').value = e.author?.url || '';
      document.getElementById('embed-thumbnail-url').value = e.thumbnail?.url || '';
      document.getElementById('embed-image-url').value = e.image?.url || '';
      document.getElementById('embed-footer-text').value = e.footer?.text || '';
      document.getElementById('embed-footer-icon').value = e.footer?.icon_url || e.footer?.iconURL || '';
      document.getElementById('embed-timestamp-toggle').checked = Boolean(e.timestamp);

      embedFieldsList = (e.fields || []).map((f, i) => ({
        id: 'f_' + i + '_' + Math.random().toString(36).substring(7),
        name: f.name || '',
        value: f.value || '',
        inline: Boolean(f.inline)
      }));
      renderEmbedFieldsList();
    }

    updateEmbedPreview();
    alert(`Loaded message #${msg.id} successfully! You can now edit its embed and click "Update Existing Discord Message".`);
  } catch (err) {
    alert('Error loading message: ' + err.message);
  }
}

function cancelMessageEditMode() {
  editingEmbedMessageId = null;
  editingEmbedChannelId = null;
  const badge = document.getElementById('embed-edit-badge');
  const cancelBtn = document.getElementById('btn-cancel-edit-mode');
  const dispatchBtn = document.getElementById('btn-dispatch-embed');
  const loadInput = document.getElementById('embed-load-input');

  if (badge) badge.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (loadInput) loadInput.value = '';
  if (dispatchBtn) {
    dispatchBtn.innerHTML = '🚀 Dispatch Embed to Discord';
    dispatchBtn.classList.remove('btn-discord');
    dispatchBtn.classList.add('btn-primary');
  }
}

// --- Dispatch or Edit Discord Embed ---
async function handleDispatchEmbed() {
  const channelId = document.getElementById('embed-target-channel')?.value;
  if (!channelId) {
    alert('Please select a target Discord channel.');
    return;
  }

  const content = document.getElementById('embed-content')?.value || '';
  const authorName = document.getElementById('embed-author-name')?.value || '';
  const authorIcon = document.getElementById('embed-author-icon')?.value || '';
  const authorUrl = document.getElementById('embed-author-url')?.value || '';
  const title = document.getElementById('embed-title')?.value || '';
  const titleUrl = document.getElementById('embed-title-url')?.value || '';
  const description = document.getElementById('embed-description')?.value || '';
  const color = document.getElementById('embed-color-hex')?.value || '#5865f2';
  const thumbnailUrl = document.getElementById('embed-thumbnail-url')?.value || '';
  const imageUrl = document.getElementById('embed-image-url')?.value || '';
  const footerText = document.getElementById('embed-footer-text')?.value || '';
  const footerIcon = document.getElementById('embed-footer-icon')?.value || '';
  const showTimestamp = document.getElementById('embed-timestamp-toggle')?.checked ?? true;

  const embedPayload = {
    title: title || undefined,
    url: titleUrl || undefined,
    description: description || undefined,
    color,
    author: authorName ? { name: authorName, icon_url: authorIcon || undefined, url: authorUrl || undefined } : undefined,
    thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    image: imageUrl ? { url: imageUrl } : undefined,
    footer: footerText ? { text: footerText, icon_url: footerIcon || undefined } : undefined,
    timestamp: showTimestamp,
    fields: embedFieldsList.map(f => ({ name: f.name, value: f.value, inline: f.inline }))
  };

  const dispatchBtn = document.getElementById('btn-dispatch-embed');
  const origBtnText = dispatchBtn ? dispatchBtn.innerHTML : '';
  if (dispatchBtn) {
    dispatchBtn.disabled = true;
    dispatchBtn.innerHTML = '⏳ Sending to Discord...';
  }

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/send-embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        messageId: editingEmbedMessageId,
        content: content || undefined,
        embed: (title || description || embedFieldsList.length > 0) ? embedPayload : null
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to dispatch message');

    alert(`Success! ${data.message} (Message ID: ${data.messageId})`);
    if (editingEmbedMessageId) {
      cancelMessageEditMode();
    }
  } catch (err) {
    alert('Error dispatching message: ' + err.message);
  } finally {
    if (dispatchBtn) {
      dispatchBtn.disabled = false;
      dispatchBtn.innerHTML = origBtnText;
    }
  }
}

// --- JSON Export & Import ---
function handleExportEmbedJson() {
  const content = document.getElementById('embed-content')?.value || '';
  const authorName = document.getElementById('embed-author-name')?.value || '';
  const authorIcon = document.getElementById('embed-author-icon')?.value || '';
  const authorUrl = document.getElementById('embed-author-url')?.value || '';
  const title = document.getElementById('embed-title')?.value || '';
  const titleUrl = document.getElementById('embed-title-url')?.value || '';
  const description = document.getElementById('embed-description')?.value || '';
  const color = document.getElementById('embed-color-hex')?.value || '#5865f2';
  const thumbnailUrl = document.getElementById('embed-thumbnail-url')?.value || '';
  const imageUrl = document.getElementById('embed-image-url')?.value || '';
  const footerText = document.getElementById('embed-footer-text')?.value || '';
  const footerIcon = document.getElementById('embed-footer-icon')?.value || '';
  const showTimestamp = document.getElementById('embed-timestamp-toggle')?.checked ?? true;

  const colorInt = parseInt(color.replace('#', ''), 16) || 0x5865f2;

  const payload = {
    content: content || undefined,
    embeds: [{
      title: title || undefined,
      url: titleUrl || undefined,
      description: description || undefined,
      color: colorInt,
      author: authorName ? { name: authorName, icon_url: authorIcon || undefined, url: authorUrl || undefined } : undefined,
      thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
      image: imageUrl ? { url: imageUrl } : undefined,
      footer: footerText ? { text: footerText, icon_url: footerIcon || undefined } : undefined,
      timestamp: showTimestamp ? new Date().toISOString() : undefined,
      fields: embedFieldsList.map(f => ({ name: f.name, value: f.value, inline: f.inline }))
    }]
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    alert('Discord / Discohook JSON copied to clipboard!');
  }).catch(() => {
    prompt('Copy JSON below:', jsonStr);
  });
}

function openJsonImportModal() {
  const raw = prompt('Paste Discord / Discohook Embed JSON here:');
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    const embed = (Array.isArray(data.embeds) && data.embeds[0]) ? data.embeds[0] : data;

    if (data.content) document.getElementById('embed-content').value = data.content;
    if (embed.title) document.getElementById('embed-title').value = embed.title;
    if (embed.url) document.getElementById('embed-title-url').value = embed.url;
    if (embed.description) document.getElementById('embed-description').value = embed.description;
    if (embed.color) {
      const hex = typeof embed.color === 'number' ? '#' + embed.color.toString(16).padStart(6, '0') : embed.color;
      setEmbedColor(hex);
    }
    if (embed.author?.name) document.getElementById('embed-author-name').value = embed.author.name;
    if (embed.author?.icon_url || embed.author?.iconURL) document.getElementById('embed-author-icon').value = embed.author.icon_url || embed.author.iconURL;
    if (embed.author?.url) document.getElementById('embed-author-url').value = embed.author.url;
    if (embed.thumbnail?.url) document.getElementById('embed-thumbnail-url').value = embed.thumbnail.url;
    if (embed.image?.url) document.getElementById('embed-image-url').value = embed.image.url;
    if (embed.footer?.text) document.getElementById('embed-footer-text').value = embed.footer.text;
    if (embed.footer?.icon_url || embed.footer?.iconURL) document.getElementById('embed-footer-icon').value = embed.footer.icon_url || embed.footer.iconURL;

    if (Array.isArray(embed.fields)) {
      embedFieldsList = embed.fields.map((f, i) => ({
        id: 'f_' + i + '_' + Math.random().toString(36).substring(7),
        name: f.name || '',
        value: f.value || '',
        inline: Boolean(f.inline)
      }));
      renderEmbedFieldsList();
    }

    updateEmbedPreview();
    alert('Embed JSON imported successfully!');
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
}

// ==========================================================================
// 🎭 VISUAL ROLE PANELS STUDIO ENGINE
// ==========================================================================

let rolePanelOptionItems = [];

async function loadRolePanelsList() {
  const container = document.getElementById('rp-published-table-container');
  if (!container || !activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/role-panels`);
    const data = await res.json();
    const panels = data.panels || [];

    if (panels.length === 0) {
      container.innerHTML = `<div style="color: var(--text-faint); font-size: 13px; padding: 6px 0;">No active role panels created for this server yet. Create one above!</div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>Title</th>
            <th>Style</th>
            <th>Options</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${panels.map(p => `
            <tr>
              <td><code>${escapeHtml(p.name)}</code></td>
              <td><strong>${escapeHtml(p.title || p.name)}</strong></td>
              <td><span class="badge-status-active">${escapeHtml(p.panel_display_mode || 'BUTTONS')}</span></td>
              <td>${p.options?.length || p.option_count || 0} Roles</td>
              <td>
                <button type="button" class="btn btn-outline btn-sm" style="color: var(--accent-red); padding: 2px 8px;" onclick="handleDeleteRolePanel('${escapeHtml(p.name)}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red); font-size: 13px;">Failed to load role panels.</div>`;
  }
}

function handleAddRolePanelOption(opt = null) {
  if (rolePanelOptionItems.length >= 25) {
    alert('Maximum 25 roles per panel.');
    return;
  }

  const optId = 'ro_' + Math.random().toString(36).substring(7);
  rolePanelOptionItems.push(opt || {
    id: optId,
    roleId: '',
    label: 'Notification Alert',
    emoji: '🔔',
    buttonColor: '#5865f2'
  });
  renderRolePanelOptions();
  updateRolePanelPreview();
}

function handleRemoveRolePanelOption(optId) {
  rolePanelOptionItems = rolePanelOptionItems.filter(item => item.id !== optId);
  renderRolePanelOptions();
  updateRolePanelPreview();
}

function handleRoleOptionChange(optId, key, value) {
  const item = rolePanelOptionItems.find(o => o.id === optId);
  if (item) {
    item[key] = value;
    updateRolePanelPreview();
  }
}

function renderRolePanelOptions() {
  const container = document.getElementById('rp-options-container');
  if (!container) return;

  if (rolePanelOptionItems.length === 0) {
    container.innerHTML = `<div style="color: var(--text-faint); font-size: 13px; padding: 6px 0;">No role options added. Click "+ Add Role Option".</div>`;
    return;
  }

  const roleOptionsHtml = (selectedId) => {
    let html = `<option value="">-- Select Role --</option>`;
    if (currentGuildConfig?.roles) {
      currentGuildConfig.roles.forEach(r => {
        html += `<option value="${escapeHtml(r.id)}" ${r.id === selectedId ? 'selected' : ''}>@${escapeHtml(r.name)}</option>`;
      });
    }
    return html;
  };

  container.innerHTML = rolePanelOptionItems.map(item => `
    <div class="role-option-card" data-opt-id="${item.id}">
      <div>
        <select class="form-select role-select" style="font-size: 13px;" onchange="handleRoleOptionChange('${item.id}', 'roleId', this.value)">
          ${roleOptionsHtml(item.roleId)}
        </select>
      </div>
      <div>
        <input type="text" class="form-input" style="font-size: 13px;" placeholder="Label" value="${escapeHtml(item.label)}" oninput="handleRoleOptionChange('${item.id}', 'label', this.value)">
      </div>
      <div>
        <input type="text" class="form-input" style="font-size: 13px; text-align: center;" placeholder="🔔" value="${escapeHtml(item.emoji || '')}" oninput="handleRoleOptionChange('${item.id}', 'emoji', this.value)">
      </div>
      <div>
        <select class="form-select" style="font-size: 12px;" onchange="handleRoleOptionChange('${item.id}', 'buttonColor', this.value)">
          <option value="#5865f2" ${item.buttonColor === '#5865f2' ? 'selected' : ''}>Blurple</option>
          <option value="#248046" ${item.buttonColor === '#248046' ? 'selected' : ''}>Green</option>
          <option value="#da373c" ${item.buttonColor === '#da373c' ? 'selected' : ''}>Red</option>
          <option value="#4e5058" ${item.buttonColor === '#4e5058' ? 'selected' : ''}>Gray</option>
        </select>
      </div>
      <div>
        <button type="button" class="btn btn-outline btn-sm" style="color: var(--accent-red); padding: 4px 8px;" onclick="handleRemoveRolePanelOption('${item.id}')">&times;</button>
      </div>
    </div>
  `).join('');

  initSearchableSelects();
}

function updateRolePanelPreview() {
  const title = document.getElementById('rp-title')?.value || '📢 Stream & Announcement Roles';
  const desc = document.getElementById('rp-description')?.value || 'Click a button below to toggle your notification alerts.';
  const color = document.getElementById('rp-color')?.value || '#5865f2';
  const displayMode = document.getElementById('rp-display-mode')?.value || 'BUTTONS';

  const titleEl = document.getElementById('rp-sim-title');
  const descEl = document.getElementById('rp-sim-description');
  const cardEl = document.getElementById('rp-sim-embed-card');
  const compEl = document.getElementById('rp-sim-components');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (cardEl) cardEl.style.borderLeftColor = color;

  if (compEl) {
    if (displayMode === 'DROPDOWN') {
      compEl.innerHTML = `
        <div class="d-select-menu">
          <span>Choose a role to toggle...</span>
          <span>▼</span>
        </div>
      `;
    } else {
      if (rolePanelOptionItems.length === 0) {
        compEl.innerHTML = `
          <button type="button" class="d-btn d-btn-primary">🔔 Stream Alerts</button>
          <button type="button" class="d-btn d-btn-success">🎉 Giveaways</button>
        `;
      } else {
        compEl.innerHTML = rolePanelOptionItems.map(item => {
          let btnClass = 'd-btn-primary';
          if (item.buttonColor === '#248046') btnClass = 'd-btn-success';
          else if (item.buttonColor === '#da373c') btnClass = 'd-btn-danger';
          else if (item.buttonColor === '#4e5058') btnClass = 'd-btn-secondary';
          return `<button type="button" class="d-btn ${btnClass}">${escapeHtml(item.emoji || '')} ${escapeHtml(item.label || 'Role')}</button>`;
        }).join('');
      }
    }
  }
}

async function handlePublishRolePanel() {
  const name = document.getElementById('rp-name')?.value;
  const title = document.getElementById('rp-title')?.value;
  const description = document.getElementById('rp-description')?.value;
  const mode = document.getElementById('rp-mode')?.value;
  const displayMode = document.getElementById('rp-display-mode')?.value;
  const color = document.getElementById('rp-color')?.value;
  const headerImageUrl = document.getElementById('rp-header-image')?.value;
  const channelId = document.getElementById('rp-target-channel')?.value;

  if (!name || !title) {
    alert('Please provide a panel slug identifier and title.');
    return;
  }

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/role-panels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        title,
        description,
        mode,
        displayMode,
        color,
        headerImageUrl: headerImageUrl || null,
        channelId: channelId || null,
        options: rolePanelOptionItems
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to publish role panel');

    alert(`Role panel "${title}" successfully configured and saved!`);
    loadRolePanelsList();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function handleDeleteRolePanel(panelName) {
  if (!confirm(`Are you sure you want to delete role panel "${panelName}"?`)) return;

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/role-panels/${encodeURIComponent(panelName)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete panel');
    loadRolePanelsList();
  } catch (e) {
    alert('Error deleting panel: ' + e.message);
  }
}

// ==========================================================================
// ⚡ CUSTOM COMMANDS STUDIO ENGINE
// ==========================================================================

async function loadCustomCommandsList() {
  const container = document.getElementById('cc-table-container');
  if (!container || !activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/custom-commands`);
    const data = await res.json();
    const commands = data.commands || [];

    if (commands.length === 0) {
      container.innerHTML = `<div style="color: var(--text-faint); font-size: 13px; padding: 6px 0;">No custom commands created yet. Create your first trigger above!</div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Trigger</th>
            <th>Type</th>
            <th>Response Preview</th>
            <th>Uses</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${commands.map(cmd => `
            <tr>
              <td><code>!${escapeHtml(cmd.name)}</code></td>
              <td><span class="badge-status-active">${cmd.embed_enabled ? 'Embed' : 'Text'}</span></td>
              <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(cmd.response || cmd.embed_description || '')}</td>
              <td>${cmd.usage_count || 0}</td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding: 2px 8px;" onclick="handleEditCustomCommand('${escapeHtml(cmd.name)}', '${escapeHtml(cmd.response || '')}', '${escapeHtml(cmd.embed_title || '')}', '${escapeHtml(cmd.embed_color || '#5865f2')}', ${Boolean(cmd.embed_enabled)})">Edit</button>
                  <button type="button" class="btn btn-outline btn-sm" style="color: var(--accent-red); padding: 2px 8px;" onclick="handleDeleteCustomCommand('${escapeHtml(cmd.name)}')">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red); font-size: 13px;">Failed to load custom commands.</div>`;
  }
}

function insertVariableTag(tag) {
  const textarea = document.getElementById('cc-response');
  if (!textarea) return;

  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const current = textarea.value;

  textarea.value = current.substring(0, start) + tag + current.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;

  updateCustomCommandPreview();
}

function updateCustomCommandPreview() {
  const response = document.getElementById('cc-response')?.value || 'Hello {user}! Check out our server rules in {channel}.';
  const simBox = document.getElementById('cc-sim-output');
  if (!simBox) return;

  let simulated = escapeHtml(response)
    .replaceAll('{user}', '<span class="mention">@SlickPickleNick</span>')
    .replaceAll('{username}', 'SlickPickleNick')
    .replaceAll('{server}', 'Slick Community')
    .replaceAll('{channel}', '<span class="mention">#general-chat</span>')
    .replaceAll('{memberCount}', '1,420')
    .replaceAll('{trigger}', '!rules')
    .replaceAll('{uses}', '42');

  simBox.innerHTML = simulated;
}

function handleCustomCommandModeChange(mode) {
  const embedOpts = document.getElementById('cc-embed-options');
  if (embedOpts) {
    embedOpts.style.display = mode === 'embed' ? 'grid' : 'none';
  }
}

function resetCustomCommandForm() {
  document.getElementById('cc-name').value = '';
  document.getElementById('cc-response').value = '';
  document.getElementById('cc-mode').value = 'text';
  document.getElementById('cc-embed-title').value = '';
  document.getElementById('cc-embed-color').value = '#5865f2';
  handleCustomCommandModeChange('text');
  updateCustomCommandPreview();
  const heading = document.getElementById('cc-editor-heading');
  if (heading) heading.textContent = '➕ Add / Edit Custom Command';
}

function handleEditCustomCommand(name, response, embedTitle, embedColor, embedEnabled) {
  document.getElementById('cc-name').value = name;
  document.getElementById('cc-response').value = response;
  document.getElementById('cc-mode').value = embedEnabled ? 'embed' : 'text';
  document.getElementById('cc-embed-title').value = embedTitle || '';
  document.getElementById('cc-embed-color').value = embedColor || '#5865f2';
  handleCustomCommandModeChange(embedEnabled ? 'embed' : 'text');
  updateCustomCommandPreview();

  const heading = document.getElementById('cc-editor-heading');
  if (heading) heading.textContent = `✏️ Edit Custom Command !${name}`;
  window.scrollTo({ top: document.getElementById('cc-name').offsetTop - 100, behavior: 'smooth' });
}

async function handleSaveCustomCommand() {
  const name = document.getElementById('cc-name')?.value;
  const response = document.getElementById('cc-response')?.value;
  const mode = document.getElementById('cc-mode')?.value;
  const embedTitle = document.getElementById('cc-embed-title')?.value;
  const embedColor = document.getElementById('cc-embed-color')?.value;

  if (!name || !response) {
    alert('Please provide a command trigger name and response.');
    return;
  }

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/custom-commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        response,
        embedEnabled: mode === 'embed',
        embedTitle: mode === 'embed' ? embedTitle : null,
        embedColor: mode === 'embed' ? embedColor : null
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save custom command');

    alert(`Custom command !${name} saved successfully!`);
    resetCustomCommandForm();
    loadCustomCommandsList();
  } catch (e) {
    alert('Error saving command: ' + e.message);
  }
}

async function handleDeleteCustomCommand(name) {
  if (!confirm(`Delete custom command !${name}?`)) return;

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/custom-commands/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete command');
    loadCustomCommandsList();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// ==========================================================================
// 📈 SERVER ANALYTICS & PEAK ACTIVITY HEATMAPS ENGINE
// ==========================================================================

let cachedAnalyticsData = null;
let currentAnalyticsRange = '24h';

async function loadServerAnalytics() {
  if (!activeGuildId) return;

  try {
    const res = await fetch(`/api/guilds/${activeGuildId}/analytics`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to fetch analytics');

    cachedAnalyticsData = data;

    // 1. Metric Cards
    const m = data.summary || {};
    document.getElementById('analytics-metric-msgs').textContent = (m.messages24h || 0).toLocaleString();
    document.getElementById('analytics-metric-voice').textContent = `${m.voiceHours24h || 0} hrs`;
    document.getElementById('analytics-metric-members').textContent = (m.activeMembers || 0).toLocaleString();
    document.getElementById('analytics-metric-health').textContent = `${m.healthScore || 94}%`;

    // 2. SVG Area Chart
    renderAnalyticsSvgChart(data, currentAnalyticsRange);

    // 3. Heatmap
    renderAnalyticsHeatmap(data.heatmap || []);

    // 4. Top Channels & Member Flow
    renderAnalyticsTopChannels(data.topChannels || []);
    renderAnalyticsMemberFlow(data.memberFlow || []);
  } catch (e) {
    console.error('Analytics load error:', e);
  }
}

function switchAnalyticsRange(range) {
  currentAnalyticsRange = range;
  document.getElementById('btn-chart-24h')?.classList.toggle('active', range === '24h');
  document.getElementById('btn-chart-7d')?.classList.toggle('active', range === '7d');

  if (cachedAnalyticsData) {
    renderAnalyticsSvgChart(cachedAnalyticsData, range);
  }
}

function renderAnalyticsSvgChart(data, range) {
  const svg = document.getElementById('analytics-svg-chart');
  if (!svg) return;

  const points = range === '24h' ? (data.velocity24h || []) : (data.velocity7d || []);
  if (points.length === 0) return;

  const width = 800;
  const height = 240;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(...points.map(p => p.messages), 50);

  // Build message points & voice points
  const msgCoords = points.map((p, i) => {
    const x = padLeft + (i / (points.length - 1)) * chartW;
    const y = padTop + chartH - (p.messages / maxVal) * chartH;
    return { x, y, val: p.messages, label: range === '24h' ? p.hour : p.day };
  });

  const pathD = msgCoords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
  const areaD = `${pathD} L ${msgCoords[msgCoords.length - 1].x} ${padTop + chartH} L ${padLeft} ${padTop + chartH} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.0"/>
      </linearGradient>
    </defs>

    <!-- Grid Horizontal Lines -->
    <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#2e2b27" stroke-dasharray="3,3"/>
    <line x1="${padLeft}" y1="${padTop + chartH * 0.5}" x2="${width - padRight}" y2="${padTop + chartH * 0.5}" stroke="#2e2b27" stroke-dasharray="3,3"/>
    <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="#44403c"/>

    <!-- Area Fill -->
    <path d="${areaD}" fill="url(#areaGrad)"/>

    <!-- Smooth Velocity Line -->
    <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Data Nodes & Labels -->
    ${msgCoords.filter((_, i) => i % (range === '24h' ? 3 : 1) === 0).map(pt => `
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="#3b82f6" stroke="#0c0a09" stroke-width="2">
        <title>${pt.label}: ${pt.val} messages</title>
      </circle>
      <text x="${pt.x.toFixed(1)}" y="${height - 15}" font-size="10" fill="#a8a29e" text-anchor="middle">${pt.label}</text>
    `).join('')}
  `;
}

function renderAnalyticsHeatmap(heatmapData) {
  const container = document.getElementById('analytics-heatmap-grid');
  if (!container) return;

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = '';

  for (let day = 0; day < 7; day++) {
    html += `<div class="heatmap-label">${dayLabels[day]}</div>`;
    for (let hour = 0; hour < 24; hour++) {
      const item = heatmapData.find(h => h.day === day && h.hour === hour) || { intensity: 1, count: 5 };
      html += `<div class="heatmap-cell lvl-${item.intensity}" title="${dayLabels[day]} ${hour.toString().padStart(2, '0')}:00 &bull; ${item.count} interactions"></div>`;
    }
  }

  container.innerHTML = html;
}

function renderAnalyticsTopChannels(channels) {
  const container = document.getElementById('analytics-top-channels-list');
  if (!container) return;

  container.innerHTML = channels.map(ch => `
    <div class="channel-bar-item">
      <div style="width: 140px; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${ch.type === 'voice' ? '🔊' : '#'} ${escapeHtml(ch.name)}
      </div>
      <div class="channel-bar-track">
        <div class="channel-bar-fill" style="width: ${ch.activityPercent}%;"></div>
      </div>
      <div style="width: 50px; text-align: right; font-size: 12px; font-weight: 600; color: var(--text-muted);">
        ${ch.activityPercent}%
      </div>
    </div>
  `).join('');
}

function renderAnalyticsMemberFlow(flow) {
  const container = document.getElementById('analytics-member-flow-list');
  if (!container) return;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${flow.map(f => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 13px;">
          <span style="font-weight: 600; width: 40px;">${f.day}</span>
          <span style="color: var(--accent-emerald);">+${f.joined} Joins</span>
          <span style="color: var(--accent-red);">-${f.left} Leaves</span>
          <span style="font-weight: 700; color: ${f.net >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)'}; width: 60px; text-align: right;">
            ${f.net >= 0 ? '+' : ''}${f.net} Net
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

