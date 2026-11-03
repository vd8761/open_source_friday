# Cloudflare setup (Phase 4)

These are owner steps. Apply them to the **dev hostnames first**, and to production only after approval.

## Where things stand (checked 2026-11-03)

| Item | Current state |
|---|---|
| Nameservers for `descienceosclub.com` | Already Cloudflare (`denver.ns.cloudflare.com`, `thea.ns.cloudflare.com`). Step 1 of the brief is done. |
| `osf.descienceosclub.com` (website, Vercel) | Proxied through Cloudflare (orange cloud). Responses show `server: cloudflare` and `x-vercel-id`. |
| Production API | `open-source-friday.onrender.com`. **Not on this zone**, so Cloudflare rules do not apply to it today. |
| Dev API | `osf-v2-dev-api.onrender.com`. Also not on this zone. |

**Important:** rules for `/api/*` (WAF, rate limits, cache bypass) only apply to traffic that goes through a hostname on `descienceosclub.com`. The API already enforces its own limits, CORS allowlist, reCAPTCHA and login lockout (see "What the app already does" below). That means Cloudflare is an extra layer, not the only protection.

To put the API behind Cloudflare too (optional, owner's choice):

1. In Render → service → Settings → Custom Domains, add a hostname such as `api-dev.descienceosclub.com` for the dev service (later `api.descienceosclub.com` for production).
2. In Cloudflare DNS, add the `CNAME` that Render shows. Keep it **DNS only (grey cloud)** until Render shows the domain as verified and the certificate as issued. Then switch it to **Proxied**.
3. Set `VITE_API_URL` in Vercel (Preview first) to the new hostname and redeploy.
4. If the site uses the new API hostname, nothing changes for CORS: the browser origin is still the website.

## 1. DNS and SSL

- Vercel records: keep `osf` proxied as it is today. If Vercel ever reports the domain as "Invalid Configuration", switch that record to **DNS only**, let Vercel re-validate, then turn the proxy back on.
- SSL/TLS → Overview → encryption mode: **Full (strict)**. Vercel and Render both serve valid certificates, so strict works and nothing is downgraded.
- SSL/TLS → Edge Certificates: **Always Use HTTPS** on, **Minimum TLS 1.2**, **Automatic HTTPS Rewrites** on.
- Leave **HSTS** in Cloudflare off at first. The API sends HSTS itself in production. Turn Cloudflare HSTS on (max-age 6 months, include subdomains) only after every subdomain is confirmed to work over HTTPS.

## 2. WAF and bots

- Security → WAF → Managed rules: enable the **Cloudflare Managed Ruleset** (default action).
- Security → Bots: **Bot Fight Mode off** if the API is moved onto the zone. It challenges non-browser clients and would break the mobile app, the cron-job.org scheduler (`/api/cron/*`), and Sender/Zoom callbacks. Free plans cannot scope Bot Fight Mode to a path, so it is off for the whole zone in that case.
- If you want a challenge on the website only: Security → WAF → Custom rules → *"Managed Challenge when hostname eq osf.descienceosclub.com and URI path does not start with /api/"*. Test registration on a phone afterwards.

## 3. Rate-limiting rules (only for an API hostname on this zone)

Security → WAF → Rate limiting rules. The Free plan allows one rule, so use one combined rule, or upgrade for separate rules.

| Path (starts with) | Limit per IP | Action |
|---|---|---|
| `/api/login` | 5 / minute | Block 10 minutes |
| `/api/register` | 10 / minute | Block 1 minute |
| `/api/students/lookup` | 10 / minute | Block 1 minute |
| `/api/speaker-applications` | 10 / minute | Block 1 minute |
| `/api/lounge/` | 10 / minute | Block 1 minute |

Single combined rule for the Free plan: *URI path is in* the list above, *method eq POST*, **10 requests / 1 minute**, block for 1 minute. The API keeps the stricter 5/minute login limit itself.

Never add `/api/cron/*` to a rate-limit or challenge rule. The scheduler calls it every minute.

## 4. Cache rules

Caching → Cache Rules:

1. **Bypass cache** when *URI path starts with `/api/`*. This applies to both the website's `/api/og` link-preview function and any API hostname.
2. Static assets: leave the default (Cloudflare caches `/assets/*.js`, `.css`, images by extension). Vite file names contain a content hash, so new deploys are picked up at once.
3. Do **not** cache `index.html`, `/sw.js` or `/manifest.webmanifest`, which is the default for these. A cached `sw.js` would keep old builds on phones.

After each release: Caching → Configuration → **Purge Everything** is not required, but it is safe.

## 5. Security headers

The website already sends these from `client/vercel.json`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

The API (`server/security.js`) sends the same set, plus `X-Frame-Options: DENY` and HSTS in production.

**Content-Security-Policy:** start in report-only mode so nothing breaks. Rules → Transform Rules → Modify Response Header → *Set* `Content-Security-Policy-Report-Only` on hostname `osf.descienceosclub.com` (dev hostname first):

```
default-src 'self';
script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;
frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https:;
connect-src 'self' https://open-source-friday.onrender.com https://osf-v2-dev-api.onrender.com https://www.google.com/recaptcha/;
worker-src 'self';
manifest-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'self'
```

(Put it on one line in the Cloudflare field.) Add the API custom domain to `connect-src` if you create one in the optional step above. After a week with no violations in the browser console on home, register, recap/lounge, speak and admin pages, rename the header to `Content-Security-Policy`.

## 6. What the app already does (no Cloudflare needed)

- **CORS allowlist:** `https://osf.descienceosclub.com`, the Capacitor app origins, and (outside production) localhost and this project's Vercel preview URLs. Add more with `ALLOWED_ORIGINS`.
- **Per-IP limits:** login 5/min, lookup 10/min, register 10/min (env `*_LIMIT_PER_MINUTE`), speaker pitches 5/hour, lounge codes 10 per 15 min.
- **Admin lockout:** 5 wrong passwords for a username within 15 minutes locks that username for 15 minutes. This is stored in the database, so a restart does not reset it.
- **reCAPTCHA v3 with action names:** `register`, `lookup`, `login`, `speaker_application`, `lounge_code`; score threshold `RECAPTCHA_MIN_SCORE` (default 0.5).
- **Body size limits:** JSON 10 MB (photo crops), forms 1 MB.

## 7. Verify after each change

1. Open the site in a private window → home, an episode, register (new and existing email), the lounge code request.
2. Admin login works; five wrong passwords → "Too many failed sign-in attempts".
3. `curl -sI https://osf.descienceosclub.com | grep -i "x-content-type\|referrer\|x-frame\|cf-ray"` shows the headers.
4. cron-job.org history shows `200` for every `/api/cron/*` job.
5. Share a register link on WhatsApp → the preview card still appears (bots reach `/api/og`).
