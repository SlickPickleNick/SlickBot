# Domain Modules & Service Architecture Guidelines

This rule outlines the architectural standards for creating and maintaining domain modules in `src/modules/`.

---

## 1. Module Structure & Separation of Concerns

Each domain module in `src/modules/<domain>/` is split into distinct layers:

```text
src/modules/<domain>/
├── <domain>Service.js   # Business logic, database queries, calculations, validations
└── <domain>Ui.js        # Embed creation, ActionRow builders, Button/Select/Modal layouts
```

### Principles:
1. **No Discord UI in Services**: `*Service.js` files must focus purely on data operations, database transactions, state retrieval, and business rules. They should return raw objects, arrays, or structured status payloads.
2. **Dedicated UI Helpers**: `*Ui.js` files format data into Discord embeds, buttons, select menus, and modals using helpers from `src/modules/ui/panels.js`, `src/modules/ui/customIds.js`, and `src/utils/format.js`.
3. **No Circular Dependencies**: UI modules may import Service modules to fetch default options, but Service modules should not depend on UI rendering functions.

---

## 2. Module Registry Integration (`src/modules/moduleRegistry.js`)

Every feature module in SlickBot must be declared in `src/modules/moduleRegistry.js`:

```javascript
// 1. Add to ModuleKeys enum
const ModuleKeys = Object.freeze({
  // ... existing keys ...
  NEW_MODULE: 'NEW_MODULE'
});

// 2. Add to defaultModules list (enabled by default or disabled)
const defaultModules = [
  // ...
  { key: ModuleKeys.NEW_MODULE, enabled: true }
];

// 3. Add to implementedModules list
const implementedModules = Object.freeze([
  // ...
  ModuleKeys.NEW_MODULE
]);
```

### Core vs. Toggleable Modules:
- **Core Modules** (`PERMISSIONS`, `LOGGING`, `STATUS`): Always enabled; cannot be disabled by guild administrators.
- **Toggleable Modules**: Can be toggled on/off per guild via `/modules toggle` or the interactive Setup Center.

---

## 3. Manager Panels & Setup Center Integration

SlickBot provides interactive management panels for modules in `src/modules/ui/panels.js`:
- Each module can register an interactive management panel providing live status, configuration toggles, and direct configuration action buttons.
- Connect panel navigation buttons with `CustomIds.SetupOpenManagerPrefix + moduleKey`.
- Support one-click fresh install defaults in `src/modules/onboarding/` to ensure zero-friction onboarding.

---

## 4. Permissions & Access Control

- Use `src/modules/permissions/permissionsService.js` to enforce guild-specific role overrides and permission levels.
- Slash commands can define baseline permissions using `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` in command builders, while granular team roles (Admin, Moderator, Support) are managed through the permissions module.
