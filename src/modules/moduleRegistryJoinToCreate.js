const modulePath = require.resolve('./moduleRegistry');
const original = require('./moduleRegistry');

const implementedModules = Object.freeze([
  ...new Set([...original.implementedModules, original.ModuleKeys.JOIN_TO_CREATE])
]);

const extended = {
  ...original,
  implementedModules,
  isImplementedModule(moduleKey) {
    return implementedModules.includes(moduleKey);
  }
};

require.cache[modulePath].exports = extended;

module.exports = extended;
