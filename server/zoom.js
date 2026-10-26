// Zoom credentials and access tokens must remain on the server.
class ZoomError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function meetingId(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{9,11}$/.test(value.trim())) {
    throw new ZoomError('Enter a Zoom Meeting ID containing 9–11 digits (without spaces).', 400);
  }
  return value.trim();
}
function createZoomClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  let token;
  let expiresAt = 0;
  let tokenRequest;
  const configured = () => Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);
  async function accessToken() {
    if (!configured()) throw new ZoomError('Zoom credentials are not configured on the server.', 503);
    if (token && now() < expiresAt) return token;
    if (!tokenRequest) {
      tokenRequest = (async () => {
        const response = await fetchImpl('https://zoom.us/oauth/token', {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'account_credentials', account_id: env.ZOOM_ACCOUNT_ID }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) throw new ZoomError('Zoom authentication failed. Check the server credentials and app activation.', 503);
        token = data.access_token;
        expiresAt = now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000;
        return token;
      })().finally(() => { tokenRequest = undefined; });
    }
    return tokenRequest;
  }
  async function request(path, options = {}, retry = true) {
    const response = await fetchImpl(`https://api.zoom.us/v2${path}`, {
      ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 && retry) {
      token = undefined;
      return request(path, options, false);
    }
    const data = await response.json();
    // Do not persist or log Zoom response bodies, which can contain personal data.
    if (!response.ok) throw new ZoomError(`Zoom request failed (HTTP ${response.status}, code ${Number(data.code) || 'unknown'}).`, 502);
    return data;
  }
  return {
    configured,
    async validateMeeting(id) {
      const data = await request(`/meetings/${meetingId(id)}`);
      if (data.type !== 2 || data.settings?.approval_type !== 0) {
        throw new ZoomError('Use a scheduled, non-recurring Zoom meeting with registration enabled and automatic approval.', 400);
      }
    },
    async addRegistrant(id, student) {
      if (!student.email || !student.full_name?.trim()) throw new ZoomError('Student name and email are required for Zoom registration.', 400);
      // Reconcile with Zoom before writing, including after a timeout or a process crash.
      // Zoom has no idempotency key for this endpoint.
      let nextPage = '';
      do {
        const query = new URLSearchParams({ status: 'approved', page_size: '300' });
        if (nextPage) query.set('next_page_token', nextPage);
        const page = await request(`/meetings/${meetingId(id)}/registrants?${query}`);
        const existing = page.registrants?.find(item => item.email?.toLowerCase() === student.email.trim().toLowerCase());
        if (existing) {
          if (!existing.id || !existing.join_url) throw new ZoomError('Existing Zoom registration is missing its join link.');
          return { registrantId: existing.id, joinUrl: existing.join_url };
        }
        nextPage = page.next_page_token || '';
      } while (nextPage);
      const [first_name, ...last] = student.full_name.trim().split(/\s+/);
      const data = await request(`/meetings/${meetingId(id)}/registrants`, {
        method: 'POST', body: JSON.stringify({ email: student.email.trim(), first_name, last_name: last.join(' '), auto_approve: true }),
      });
      if (!data.registrant_id || !data.join_url) throw new ZoomError('Zoom did not return an approved registration. Check the meeting settings.');
      return { registrantId: data.registrant_id, joinUrl: data.join_url };
    },
  };
}
module.exports = { createZoomClient, meetingId, ZoomError };
