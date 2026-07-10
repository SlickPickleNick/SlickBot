const actionKeysPath = require.resolve('./actionKeys');
const original = require('./actionKeys');

const ActionKeys = Object.freeze({
  ...original.ActionKeys,
  JoinToCreateUse: 'join-to-create.use',
  JoinToCreateView: 'join-to-create.view',
  JoinToCreateConfigure: 'join-to-create.configure',
  JoinToCreateManage: 'join-to-create.manage'
});

const defaultActionLevels = Object.freeze({
  ...original.defaultActionLevels,
  [ActionKeys.JoinToCreateUse]: original.PermissionLevels.EVERYONE,
  [ActionKeys.JoinToCreateView]: original.PermissionLevels.MODERATOR,
  [ActionKeys.JoinToCreateConfigure]: original.PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.JoinToCreateManage]: original.PermissionLevels.MODERATOR
});

const defaultPublicActions = Object.freeze([
  ...new Set([...original.defaultPublicActions, ActionKeys.JoinToCreateUse])
]);

const extended = {
  ...original,
  ActionKeys,
  defaultActionLevels,
  defaultPublicActions,
  defaultTeamPermissions: Object.freeze(Object.values(ActionKeys)),
  PERMISSION_DEFAULTS_VERSION: '0.7.0'
};

require.cache[actionKeysPath].exports = extended;

module.exports = extended;
