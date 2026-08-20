function createMockUser(overrides = {}) {
  const id = overrides.id || '100000000000000001';
  const username = overrides.username || 'TestUser';
  return {
    id,
    username,
    tag: overrides.tag || `${username}#0001`,
    bot: Boolean(overrides.bot),
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    send: async () => ({ id: 'mock-dm-id' }),
    ...overrides
  };
}

function createMockRole(overrides = {}) {
  const id = overrides.id || '200000000000000001';
  return {
    id,
    name: overrides.name || 'TestRole',
    color: overrides.color || 0x00ff00,
    position: overrides.position || 1,
    permissions: {
      has: (perm) => overrides.permissions?.includes?.(perm) ?? false
    },
    ...overrides
  };
}

function createMockMember(overrides = {}) {
  const user = overrides.user || createMockUser(overrides);
  const roleMap = new Map((overrides.roles || []).map((r) => [typeof r === 'string' ? r : r.id, typeof r === 'string' ? createMockRole({ id: r }) : r]));
  return {
    id: user.id,
    user,
    nickname: overrides.nickname || null,
    displayName: overrides.displayName || user.username,
    roles: {
      cache: roleMap,
      add: async (roleId) => { roleMap.set(roleId, createMockRole({ id: roleId })); },
      remove: async (roleId) => { roleMap.delete(roleId); }
    },
    permissions: {
      has: (perm) => Boolean(overrides.isAdmin || overrides.permissions?.includes?.(perm))
    },
    voice: {
      channelId: overrides.voiceChannelId || null,
      setChannel: async () => {}
    },
    ...overrides
  };
}

function createMockChannel(overrides = {}) {
  const id = overrides.id || '300000000000000001';
  const sentMessages = [];
  return {
    id,
    name: overrides.name || 'test-channel',
    type: overrides.type || 0,
    isTextBased: () => overrides.isTextBased !== false,
    isVoiceBased: () => Boolean(overrides.isVoiceBased),
    isThread: () => Boolean(overrides.isThread),
    send: async (payload) => {
      const msg = { id: `msg-${Date.now()}-${Math.random()}`, ...payload, channelId: id };
      sentMessages.push(msg);
      return msg;
    },
    permissionOverwrites: {
      edit: async () => {},
      delete: async () => {}
    },
    delete: async () => {},
    sentMessages,
    ...overrides
  };
}

function createMockGuild(overrides = {}) {
  const id = overrides.id || '400000000000000001';
  const memberMap = new Map();
  const channelMap = new Map();
  const roleMap = new Map();

  const guild = {
    id,
    name: overrides.name || 'Test Guild',
    members: {
      cache: memberMap,
      fetch: async (userId) => memberMap.get(userId) || null
    },
    channels: {
      cache: channelMap,
      fetch: async (channelId) => channelMap.get(channelId) || null,
      create: async (data) => {
        const ch = createMockChannel({ ...data, guildId: id });
        channelMap.set(ch.id, ch);
        return ch;
      }
    },
    roles: {
      cache: roleMap,
      fetch: async (roleId) => roleMap.get(roleId) || null
    },
    ...overrides
  };

  (overrides.initialMembers || []).forEach((m) => memberMap.set(m.id, m));
  (overrides.initialChannels || []).forEach((c) => channelMap.set(c.id, c));
  (overrides.initialRoles || []).forEach((r) => roleMap.set(r.id, r));

  return guild;
}

function createMockMessage(overrides = {}) {
  const user = overrides.author || createMockUser();
  const guild = overrides.guild || createMockGuild();
  const channel = overrides.channel || createMockChannel({ guildId: guild.id });
  const member = overrides.member || createMockMember({ user, guild });

  const reactions = new Map();

  return {
    id: overrides.id || `msg-${Date.now()}`,
    content: overrides.content || '',
    author: user,
    member,
    guild,
    channel,
    channelId: channel.id,
    guildId: guild.id,
    reply: async (payload) => ({ id: `reply-${Date.now()}`, ...payload }),
    react: async (emoji) => {
      reactions.set(emoji, (reactions.get(emoji) || 0) + 1);
      return { emoji };
    },
    delete: async () => {},
    reactions: {
      cache: reactions
    },
    ...overrides
  };
}

function createMockInteraction(overrides = {}) {
  const user = overrides.user || createMockUser();
  const guild = overrides.guild || createMockGuild();
  const channel = overrides.channel || createMockChannel({ guildId: guild.id });
  const member = overrides.member || createMockMember({ user, guild });

  const replies = [];

  return {
    id: overrides.id || `int-${Date.now()}`,
    customId: overrides.customId || null,
    commandName: overrides.commandName || null,
    user,
    member,
    guild,
    channel,
    guildId: guild.id,
    channelId: channel.id,
    replied: false,
    deferred: false,
    values: overrides.values || [],
    options: {
      getString: (name) => overrides.options?.[name] ?? null,
      getInteger: (name) => overrides.options?.[name] ?? null,
      getNumber: (name) => overrides.options?.[name] ?? null,
      getBoolean: (name) => overrides.options?.[name] ?? null,
      getUser: (name) => overrides.options?.[name] ?? null,
      getMember: (name) => overrides.options?.[name] ?? null,
      getRole: (name) => overrides.options?.[name] ?? null,
      getChannel: (name) => overrides.options?.[name] ?? null,
      getSubcommand: () => overrides.subcommand || null,
      getSubcommandGroup: () => overrides.subcommandGroup || null
    },
    reply: async (payload) => {
      const resp = typeof payload === 'string' ? { content: payload } : payload;
      replies.push(resp);
      return resp;
    },
    deferReply: async () => {},
    editReply: async (payload) => {
      const resp = typeof payload === 'string' ? { content: payload } : payload;
      replies.push(resp);
      return resp;
    },
    followUp: async (payload) => {
      const resp = typeof payload === 'string' ? { content: payload } : payload;
      replies.push(resp);
      return resp;
    },
    showModal: async () => {},
    isChatInputCommand: () => Boolean(overrides.commandName),
    isButton: () => Boolean(overrides.customId && !overrides.values),
    isStringSelectMenu: () => Boolean(overrides.customId && overrides.values),
    isModalSubmit: () => Boolean(overrides.isModalSubmit),
    replies,
    ...overrides
  };
}

module.exports = {
  createMockUser,
  createMockRole,
  createMockMember,
  createMockChannel,
  createMockGuild,
  createMockMessage,
  createMockInteraction
};
