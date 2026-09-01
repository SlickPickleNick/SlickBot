# Testing & Verification Guidelines

This rule outlines how to write, maintain, and execute automated tests in SlickBot.

---

## 1. Test Framework & Runner

SlickBot uses the **Node.js Native Test Runner** (`node --test`) and standard `node:assert/strict`. No external test runner dependencies (e.g. Jest/Mocha) are required.

- **Test Directory**: `test/unit/`
- **File Naming Pattern**: `*.test.js`
- **Execution**: `npm test` or `node --test test/unit/<filename>.test.js`

---

## 2. Writing Unit Tests

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { setQueryHandler, resetQueryHandler } = require('../../src/services/db');
const MyService = require('../../src/modules/myFeature/myFeatureService');

describe('MyFeature Service Tests', () => {
  beforeEach(() => {
    // Setup mock query handler
    setQueryHandler(async (text, params) => {
      if (text.includes('SELECT')) {
        return { rows: [{ id: 1, name: 'Test' }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    // Always reset query handler to avoid cross-test pollution
    resetQueryHandler();
  });

  it('should fetch feature items correctly', async () => {
    const result = await MyService.getItem('guild-123');
    assert.equal(result.name, 'Test');
  });
});
```

---

## 3. Command Payload Validation

Before committing slash command changes, always run:
```bash
npm run validate:commands
```
This utility parses all command payloads through `src/utils/commandValidation.js` to ensure required options appear before optional options and all command structures adhere to Discord API rules.

---

## 4. Pre-Completion Verification Checklist

Whenever code changes are made:
- [ ] Run `npm run validate:commands` (must exit with 0 errors).
- [ ] Run `npm test` (all tests must pass).
- [ ] Ensure new features have accompanying unit tests in `test/unit/`.
