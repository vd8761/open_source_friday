const { InputError } = require("./outreach-csv");
const { captureResponse } = require("./sender-diagnostic");
const { createSenderPacer } = require("./sender-pacing");
class SenderError extends Error {
  constructor(message, status = 502, retryAfterSeconds = 60) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function createSenderClient({ env = process.env, fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now(),
} = {}) {
  const pacer=createSenderPacer({now,sleep});
  function operation(path, method) {
    if (path === "/groups") return "creating the batch group";
    if (path.startsWith("/groups/")) return "checking the batch audience";
    if (path.startsWith("/subscribers/groups/")) return "assigning the batch audience";
    if (path === "/subscribers") return "creating the invitation contact";
    if (path.startsWith("/subscribers/")) return "checking the subscriber status";
    if (path === "/campaigns") return "creating the campaign draft";
    if (path.endsWith("/send")) return "submitting the campaign";
    return method === "GET" ? "reading the campaign or report" : "updating the campaign";
  }
  function reason(data, status, headers) {
    if (status === 403) {
      const raw = typeof data.message === "string" ? data.message
        : typeof data.error === "string" ? data.error : "";
      const redacted = raw
        .split(env.SENDER_API_TOKEN || "\u0000").join("[redacted token]")
        .replace(/Bearer\s+\S+/gi, "Bearer [redacted token]")
        .replace(/https?:\/\/\S+/gi, "[redacted URL]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
        .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted identifier]")
        .replace(/[\r\n\t]/g, " ").slice(0, 400);
      const reference = headers?.get("cf-ray") || headers?.get("x-request-id") || "";
      const requestId = /^[a-z0-9-]{6,128}$/i.test(reference)
        ? ` Provider request reference: ${reference}.` : "";
      return (redacted ? `Sender response: ${redacted}`
        : /html/i.test(headers?.get("content-type") || "")
          ? "Sender returned an HTML access-denied page instead of an API response."
          : "Sender did not provide a JSON explanation for the access denial.") + requestId;
    }
    // Only return fixed diagnostics. Never echo provider text, which may contain
    // contact information or credentials from an invalid request.
    const message = typeof data.message === "string" ? data.message.toLowerCase() : "";
    if (/subscriber.*(not found|does not exist|doesn't exist)/.test(message)) return "Subscriber not found.";
    if (/domain.*(not verified|unverified)|verif.*domain/.test(message)) return "Verify the sending domain in Sender.";
    if (/unsubscribe/.test(message)) return "Check the campaign unsubscribe link in Sender.";
    if (/limit|quota|credit/.test(message)) return "Check the Sender account sending quota.";
    if (/approv|activat/.test(message)) return "Check account or campaign activation in Sender.";
    const fields = ["email", "firstname", "lastname", "groups", "subject", "from", "reply_to", "content", "content_type", "subscribers"]
      .filter(field => Object.hasOwn(data.errors || {}, field));
    return fields.length ? `Check these request fields: ${fields.join(", ")}.` : "Check account permissions, verified domain and quota in Sender.";
  }
  const configured = () =>
    Boolean(
      env.SENDER_API_TOKEN &&
      env.SENDER_FROM_EMAIL &&
      env.SENDER_FROM_NAME &&
      env.SENDER_POSTAL_ADDRESS &&
      env.PUBLIC_APP_URL,
    );
  async function requestOnce(path, method, body, timeoutMs, observe) {
    if (!configured())
      throw new SenderError(
        "Configure Sender API token, verified From address/name, postal address and public app URL on the backend.",
        503,
      );
    let response;
    try {
      response = await fetchImpl(`https://api.sender.net/v2${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${env.SENDER_API_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SenderError(
        "Sender request outcome is unknown. Check the campaign in Sender before retrying.",
      );
    }
    observe(response);
    const diagnostic = response.status === 403 && /^\/campaigns\/[a-z\d_-]+\/send$/i.test(path)
      ? await captureResponse(response, path, method, env) : null;
    let data;
    if (diagnostic) {
      try { data = JSON.parse(diagnostic.response_body); } catch { data = {}; }
    } else data = await response.json().catch(() => ({}));
    if (response.status === 404) return null;
    if (!response.ok || data.success === false) {
      const seconds = pacer.retrySeconds(response.headers);
      const error = new SenderError(
        response.status === 429
          ? `Sender rate limit reached while ${operation(path, method)}. Wait before manually resuming.`
          : `Sender request failed while ${operation(path, method)} (HTTP ${response.status}). ${reason(data, response.status, response.headers)}`,
        response.status === 429 ? 429 : 502,
        Number.isFinite(seconds) ? Math.max(60, Math.ceil(seconds)) : 60,
      );
      // Only this exact provider rejection is eligible for the worker's bounded retry.
      // A generic 403, HTML page, timeout or quota error remains an uncertain send.
      const noSubscribers = value => typeof value === 'string' && value.trim().toLowerCase() === 'no subscribers selected';
      if (method === 'POST' && path.endsWith('/send') && [400,403,422].includes(response.status)
        && (noSubscribers(data.message) || noSubscribers(data.error)
          || (Array.isArray(data.errors) && data.errors.length === 1 && noSubscribers(data.errors[0]?.title)))) {
        error.audienceNotReady = true;
        error.message = 'Sender has not finished calculating the campaign audience (No subscribers selected).';
      }
      if (diagnostic) error.providerDiagnostic = diagnostic;
      throw error;
    }
    return data;
  }
  function request(path, method = 'GET', body, timeoutMs = 20000, deadline) {
    // No network or send retry is hidden here. Explicit 429s retain the normal
    // campaign pause, and all callers share the same paced request queue.
    return pacer.run((observe,remaining)=>requestOnce(path,method,body,remaining===undefined?timeoutMs:Math.min(timeoutMs,remaining),observe),{
      deadline,onCooldown:seconds=>new SenderError('Sender rate limit cooldown remains active. Wait before manually resuming.',429,Math.min(seconds,2147483647)),onDeadline:()=>new SenderError('Sender audience could not be confirmed within two minutes because API requests are waiting for a cooldown. No campaign was sent.'),
    });
  }
  async function list(path) {
    const result = [];
    for (let page = 1; page <= 1000; page++) {
      const response = await request(`${path}?limit=100&page=${page}`);
      if (!response) throw new SenderError("Sender report was not found.");
      const data = response.data;
      if (Array.isArray(data)) result.push(...data);
      else if (data && typeof data === "object" && data.email)
        result.push(data);
      else if (data != null)
        throw new SenderError(
          "Sender report format was not recognized; no tracking statuses were inferred.",
        );
      if (
        !response.links?.next &&
        (!response.meta?.last_page || page >= Number(response.meta.last_page))
      )
        return result;
    }
    throw new SenderError("Sender report exceeded the page limit.");
  }
  return {
    configured,
    identity: () => ({
      from_email: env.SENDER_FROM_EMAIL || "",
      from_name: env.SENDER_FROM_NAME || "",
      configured: configured(),
    }),
    async createGroup(title) {
      const result = await request("/groups", "POST", { title });
      if (!result?.data?.id)
        throw new SenderError("Sender did not return a group ID.");
      return String(result.data.id);
    },
    async waitForGroup(id, expected, beforePoll = async () => {}) {
      if (!Number.isSafeInteger(expected) || expected < 1 || expected > 200)
        throw new InputError('Use a non-empty batch of at most 200 recipients.');
      const deadline = now() + 120000;
      for (let poll = 0; poll < 25; poll++) {
        await beforePoll();
        const remaining = deadline - now();
        if (remaining <= 0) break;
        const group = (await request(`/groups/${encodeURIComponent(id)}`, 'GET', undefined, Math.min(20000, remaining), deadline))?.data;
        const raw = group?.active_subscribers;
        const count = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!group || String(group.id) !== String(id) || !Number.isSafeInteger(count) || count < 0)
          throw new SenderError('Sender did not return a valid active subscriber count. No campaign was sent.');
        if (count > expected)
          throw new SenderError('Sender group has more active subscribers than the selected batch. No campaign was sent.');
        if (count === expected && group.is_recalculating_subscribers !== true) return;
        const delay = Math.min(5000, deadline - now());
        if (delay <= 0) break;
        await sleep(delay);
      }
      throw new SenderError('Sender is still calculating the batch audience after two minutes. No campaign was sent. Please resume later.');
    },
    async subscriber(email) {
      return (
        (await request(`/subscribers/${encodeURIComponent(email)}`))?.data ||
        null
      );
    },
    async addContact(contact) {
      const [firstname, ...last] = contact.full_name.trim().split(/\s+/);
      await request("/subscribers", "POST", {
        email: contact.email,
        firstname,
        lastname: last.join(" "),
        trigger_automation: false,
      });
    },
    async addToGroup(id, emails) {
      if (!emails.length)
        throw new InputError("Cannot send to an empty audience.");
      await request(`/subscribers/groups/${encodeURIComponent(id)}`, "POST", {
        subscribers: emails,
        trigger_automation: false,
      });
    },
    async createCampaign(title, subject, content, groupId) {
      const result = await request("/campaigns", "POST", {
        title,
        subject,
        preheader: "Register in our application; Zoom will email your personal meeting link.",
        from: env.SENDER_FROM_NAME,
        reply_to: env.SENDER_FROM_EMAIL,
        content_type: "html",
        content,
        groups: [groupId],
        auto_followup_active: false,
        google_analytics: 0,
      });
      if (!result?.data?.id)
        throw new SenderError("Sender did not return a campaign ID.");
      return String(result.data.id);
    },
    async send(id) {
      if (!(await request(`/campaigns/${encodeURIComponent(id)}/send`, "POST")))
        throw new SenderError("Sender campaign not found.");
    },
    async campaign(id) {
      return (await request(`/campaigns/${encodeURIComponent(id)}`))?.data;
    },
    async report(id, kind) {
      if (
        ![
          "emails-sent",
          "opens",
          "clicks",
          "hard_bounces",
          "soft_bounces",
          "unsubscribes",
          "complaints",
        ].includes(kind)
      )
        throw new InputError("Invalid report type.");
      return list(`/campaigns/${encodeURIComponent(id)}/${kind}`);
    },
  };
}
module.exports = { createSenderClient, SenderError };
