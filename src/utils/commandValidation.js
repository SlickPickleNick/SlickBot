/**
 * Validates Discord application command payloads before they are sent to Discord.
 * Discord requires all required options to be listed before optional options within
 * each slash command, subcommand, and subcommand group. This helper catches that
 * issue locally so SlickBot fails with a useful message instead of a raw API error.
 */
function validateRequiredOptionOrder(options = [], path = []) {
  const errors = [];
  let optionalOptionSeen = false;

  options.forEach((option, index) => {
    const currentPath = [...path, `${option.name || `option_${index}`}`];

    if (option.required === true && optionalOptionSeen) {
      errors.push(`${currentPath.join(' > ')} is required but appears after an optional option.`);
    }

    if (option.required !== true) {
      optionalOptionSeen = true;
    }

    if (Array.isArray(option.options) && option.options.length > 0) {
      errors.push(...validateRequiredOptionOrder(option.options, currentPath));
    }
  });

  return errors;
}

function validateCommandPayloads(payload) {
  const errors = [];

  payload.forEach((command) => {
    errors.push(...validateRequiredOptionOrder(command.options || [], [command.name]));
  });

  return errors;
}

module.exports = {
  validateCommandPayloads
};
