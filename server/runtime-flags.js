const { ZoomError } = require('./zoom');

// Outside production the dev database is a copy of real student data, so every outbound
// integration is off unless its flag is explicitly "true". Production keeps v1.0 behaviour.
function runtimeFlags(env = process.env) {
  const environment = ['development', 'preview', 'production'].includes(env.OSF_ENV) ? env.OSF_ENV : 'development';
  const production = environment === 'production';
  const flag = name => env[name] == null || env[name] === '' ? production : env[name] === 'true';
  const list = name => String(env[name] || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return {
    environment,
    production,
    workers: flag('ENABLE_WORKERS'),
    zoom: flag('ENABLE_ZOOM'),
    sender: flag('ENABLE_SENDER'),
    push: flag('ENABLE_PUSH'),
    // Outside production these narrow an enabled integration to the owner's test recipients.
    zoomTestAllowlist: list('ZOOM_TEST_ALLOWLIST'),
    pushTestAllowlist: list('PUSH_TEST_ALLOWLIST'),
  };
}

function dryRun(service, detail) {
  console.log(`[${service}] dry-run: ${detail}`);
}

// Zoom emails every registrant, so outside production only allowlisted emails are enrolled.
function guardZoom(zoom, flags) {
  const off = new ZoomError(`Zoom is off in the ${flags.environment} environment (dry-run).`, 503);
  if (!flags.zoom) return {
    configured: () => false,
    disabledReason: off.message,
    async validateMeeting(id) { dryRun('Zoom', `meeting ${id} not validated`); },
    async attendance() { dryRun('Zoom', 'attendance report not requested'); throw off; },
    async addRegistrant() { dryRun('Zoom', 'registrant not created'); throw off; },
  };
  if (flags.production) return zoom;
  return {
    ...zoom,
    async addRegistrant(id, student) {
      if (!flags.zoomTestAllowlist.includes(String(student.email || '').trim().toLowerCase())) {
        dryRun('Zoom', `registration ${student.registration_id ?? ''} is not on ZOOM_TEST_ALLOWLIST`);
        throw new ZoomError('This email is not on ZOOM_TEST_ALLOWLIST, so it was not sent to Zoom (dry-run).', 403);
      }
      return zoom.addRegistrant(id, student);
    },
  };
}

// Campaign start and the invite worker both stop when Sender reports it is not configured.
function guardSender(sender, flags) {
  if (flags.sender) return sender;
  return {
    ...sender,
    configured: () => false,
    disabledReason: `Sender is off in the ${flags.environment} environment (dry-run). Campaigns cannot start.`,
    identity: () => ({ ...sender.identity(), configured: false }),
  };
}

// Subscriptions are matched by push_subscriptions.id, as listed in PUSH_TEST_ALLOWLIST.
function pushAllowed(flags, subscription) {
  if (!flags.push) return false;
  return flags.production || flags.pushTestAllowlist.includes(String(subscription.id));
}

module.exports = { runtimeFlags, guardZoom, guardSender, pushAllowed, dryRun };
