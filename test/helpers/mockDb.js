const { setQueryHandler, resetQueryHandler } = require('../../src/services/db');

class MockDatabase {
  constructor() {
    this.tables = new Map();
    this.customHandlers = [];
  }

  install() {
    setQueryHandler(async (text, params = []) => {
      for (const handler of this.customHandlers) {
        const handled = await handler(text, params);
        if (handled !== undefined) return handled;
      }
      return this.handleDefault(text, params);
    });
  }

  uninstall() {
    resetQueryHandler();
    this.tables.clear();
    this.customHandlers = [];
  }

  addHandler(matcherOrFn, responseOrFn) {
    if (typeof matcherOrFn === 'function') {
      this.customHandlers.unshift(matcherOrFn);
    } else {
      this.customHandlers.unshift(async (text, params) => {
        const matches = typeof matcherOrFn === 'string'
          ? text.toLowerCase().includes(matcherOrFn.toLowerCase())
          : matcherOrFn.test(text);
        if (matches) {
          if (typeof responseOrFn === 'function') return responseOrFn(text, params);
          return responseOrFn;
        }
        return undefined;
      });
    }
  }

  handleDefault(text, params) {
    const trimmed = text.trim();
    // Return empty result set default
    return { rows: [], rowCount: 0 };
  }
}

module.exports = { MockDatabase };
