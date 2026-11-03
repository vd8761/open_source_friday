// Browser access, response headers and admin login lockout for the API.

const PRODUCTION_ORIGINS = ['https://osf.descienceosclub.com'];
// Capacitor apps load from these local origins on iOS and Android.
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
// Vercel preview URLs of this project only, e.g. open-source-friday-git-v20-main-ariyas-projects-40e5ec5b.vercel.app.
const PREVIEW_PATTERN = /^https:\/\/open-source-friday-[a-z0-9-]+-ariyas-projects-40e5ec5b\.vercel\.app$/;

// Which web origins may call the API from a browser. Requests without an Origin header (server-to-server,
// link-preview function, scheduler) are not browser cross-origin calls and are unaffected.
function allowedOrigin(env, flags) {
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const exact = new Set([...PRODUCTION_ORIGINS, ...APP_ORIGINS, ...extra, ...(flags.production ? [] : DEV_ORIGINS)]);
  return (origin) => !origin || exact.has(origin) || (!flags.production && PREVIEW_PATTERN.test(origin));
}

function corsOptions(env, flags) {
  const allowed = allowedOrigin(env, flags);
  return {
    origin: (origin, done) => done(null, allowed(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

function securityHeaders(flags) {
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      // Speaker photos and covers are shown on the website, a different origin from the API.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (flags.production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

// Admin sign-in: after MAX_FAILURES wrong passwords for a username within the window, that username is
// locked for LOCK_MINUTES. Stored in the database so restarts do not reset it.
const MAX_FAILURES = 5, WINDOW_MINUTES = 15, LOCK_MINUTES = 15;
function createLoginGuard(pool) {
  const key = (username) => String(username || '').trim().toLowerCase().slice(0, 100);
  return {
    async lockedMinutes(username) {
      const row = (await pool.query('SELECT locked_until FROM admin_login_attempts WHERE username_key=$1 AND locked_until > NOW()', [key(username)])).rows[0];
      return row ? Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000)) : 0;
    },
    async failed(username) {
      await pool.query(`INSERT INTO admin_login_attempts(username_key,failures,first_failure_at) VALUES($1,1,NOW())
        ON CONFLICT(username_key) DO UPDATE SET
          failures = CASE WHEN admin_login_attempts.first_failure_at < NOW() - INTERVAL '${WINDOW_MINUTES} minutes' THEN 1 ELSE admin_login_attempts.failures + 1 END,
          first_failure_at = CASE WHEN admin_login_attempts.first_failure_at < NOW() - INTERVAL '${WINDOW_MINUTES} minutes' THEN NOW() ELSE admin_login_attempts.first_failure_at END`, [key(username)]);
      // Returns the failed attempt number in the current window, or MAX_FAILURES once the username is locked.
      const row = (await pool.query(`UPDATE admin_login_attempts SET
          locked_until = CASE WHEN failures >= ${MAX_FAILURES} THEN NOW() + INTERVAL '${LOCK_MINUTES} minutes' ELSE locked_until END,
          failures = CASE WHEN failures >= ${MAX_FAILURES} THEN 0 ELSE failures END
        WHERE username_key=$1 RETURNING failures, locked_until > NOW() AS locked`, [key(username)])).rows[0];
      return row.locked ? MAX_FAILURES : row.failures;
    },
    async succeeded(username) {
      await pool.query('DELETE FROM admin_login_attempts WHERE username_key=$1', [key(username)]);
    },
  };
}

module.exports = { corsOptions, allowedOrigin, securityHeaders, createLoginGuard, MAX_FAILURES, LOCK_MINUTES };
