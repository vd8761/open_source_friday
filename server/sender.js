const { InputError } = require("./outreach-csv");
class SenderError extends Error {
  constructor(message, status = 502, retryAfterSeconds = 60) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function createSenderClient({ env = process.env, fetchImpl = fetch } = {}) {
  function operation(path, method) {
    if (path === "/groups") return "creating the batch group";
    if (path.startsWith("/subscribers/groups/")) return "assigning the batch audience";
    if (path === "/subscribers") return "creating the invitation contact";
    if (path.startsWith("/subscribers/")) return "checking the subscriber status";
    if (path === "/campaigns") return "creating the campaign draft";
    if (path.endsWith("/send")) return "submitting the campaign";
    return method === "GET" ? "reading the campaign or report" : "updating the campaign";
  }
  function reason(data) {
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
  async function request(path, method = "GET", body) {
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
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new SenderError(
        "Sender request outcome is unknown. Check the campaign in Sender before retrying.",
      );
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 404) return null;
    if (!response.ok || data.success === false) {
      const retry = response.headers?.get("retry-after");
      const seconds = /^\d+$/.test(retry || "")
        ? Number(retry)
        : (Date.parse(retry) - Date.now()) / 1000;
      throw new SenderError(
        response.status === 429
          ? "Sender rate limit reached. Wait before resuming."
          : `Sender request failed while ${operation(path, method)} (HTTP ${response.status}). ${reason(data)}`,
        response.status === 429 ? 429 : 502,
        Number.isFinite(seconds) ? Math.max(60, Math.ceil(seconds)) : 60,
      );
    }
    return data;
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
