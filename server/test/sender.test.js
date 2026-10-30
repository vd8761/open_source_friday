const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSenderClient } = require("../sender");
const env = {
  SENDER_API_TOKEN: "private-key",
  SENDER_FROM_EMAIL: "from@example.com",
  SENDER_FROM_NAME: "OSF",
  SENDER_POSTAL_ADDRESS: "Address",
  PUBLIC_APP_URL: "https://osf.example.com",
};
function setup(responses, override = env, timing = {}) {
  const calls = [];
  return {
    calls,
    client: createSenderClient({
      env: override,
      ...timing,
      fetchImpl: async (url, init) => {
        calls.push({ url, ...init });
        assert.ok(responses.length);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return {
          ok: response.status < 400,
          status: response.status,
          headers: { get: name => name === "retry-after" ? response.retryAfter || null : response.headers?.[name] || null },
          json: async () => response.body,
        };
      },
    }),
  };
}
test("Sender API keeps secrets server-side, disables automation and uses marketing campaign audiences", async () => {
  const { client, calls } = setup([
    { status: 200, body: { data: { id: "g1" } } },
    { status: 200, body: {} },
    { status: 200, body: { data: { id: "c1" } } },
    { status: 200, body: { success: true } },
  ]);
  const group = await client.createGroup("Test");
  await client.addToGroup(group, ["one@example.com"]);
  const id = await client.createCampaign(
    "Title",
    "Subject",
    "<p>Body</p>",
    group,
  );
  await client.send(id);
  assert.equal(calls[0].headers.Authorization, "Bearer private-key");
  assert.deepEqual(JSON.parse(calls[1].body), {
    subscribers: ["one@example.com"],
    trigger_automation: false,
  });
  const body = JSON.parse(calls[2].body);
  assert.deepEqual(body.groups, ["g1"]);
  assert.equal(body.auto_followup_active, false);
  assert.equal(body.reply_to, "from@example.com");
  assert.equal(body.preheader, "Register in our application; Zoom will email your personal meeting link.");
  assert.equal(calls[3].url, "https://api.sender.net/v2/campaigns/c1/send");
});
test("Sender errors hide response details, preserve throttling, and never retry sends automatically", async () => {
  const { client, calls } = setup([
    {
      status: 429,
      retryAfter: "600",
      body: { message: "private-key and email" },
    },
  ]);
  await assert.rejects(
    client.send("c1"),
    (err) =>
      err.status === 429 &&
      err.retryAfterSeconds === 600 &&
      !err.message.includes("private-key"),
  );
  assert.equal(calls.length, 1);
  const network = setup([new Error("private-key")]);
  await assert.rejects(network.client.send("c1"), /outcome is unknown/);
  assert.equal(network.calls.length, 1);
});
test("Sender report pagination accepts documented object/array data and never follows provider-supplied URLs", async () => {
  const { client, calls } = setup([
    {
      status: 200,
      body: {
        data: [{ email: "one@example.com" }],
        links: { next: "https://malicious.example/steal" },
      },
    },
    {
      status: 200,
      body: { data: { email: "two@example.com" }, links: { next: null } },
    },
  ]);
  assert.equal((await client.report("c1", "opens")).length, 2);
  assert.ok(
    calls.every((c) =>
      c.url.startsWith("https://api.sender.net/v2/campaigns/c1/opens?"),
    ),
  );
  assert.ok(calls[1].url.includes("page=2"));
});
test("unconfigured Sender cannot make network requests", async () => {
  const { client, calls } = setup([], {});
  await assert.rejects(client.createGroup("Test"), /Configure Sender/);
  assert.equal(calls.length, 0);
});
test("Sender errors identify the failed operation without echoing provider data", async () => {
  const { client } = setup([
    { status: 400, body: { message: "Subscriber not found: private@example.com private-key" } },
    { status: 422, body: { message: "private-key", errors: { email: ["private@example.com"], secret: ["private-key"] } } },
  ]);
  await assert.rejects(client.subscriber("private@example.com"), error => {
    assert.match(error.message, /checking the subscriber status/);
    assert.match(error.message, /Subscriber not found/);
    assert.doesNotMatch(error.message, /private/);
    return true;
  });
  await assert.rejects(client.addContact({ email: "private@example.com", full_name: "" }), error => {
    assert.match(error.message, /creating the invitation contact/);
    assert.match(error.message, /request fields: email/);
    assert.doesNotMatch(error.message, /private|secret/);
    return true;
  });
});
test("Forbidden diagnostics redact credentials and contacts and preserve a safe provider reference", async () => {
  const { client } = setup([
    { status: 403, headers: { "x-request-id": "test-request-123" }, body: {
      message: "API sending is disabled. private@example.com private-key Bearer other-secret https://example.com/private-key",
    } },
    { status: 403, headers: { "content-type": "text/html", "cf-ray": "abc123-def" }, body: {} },
  ]);
  await assert.rejects(client.send("draft1"), error => {
    assert.match(error.message, /API sending is disabled/);
    assert.match(error.message, /test-request-123/);
    assert.doesNotMatch(error.message, /private@example|private-key|other-secret|https:\/\//);
    return true;
  });
  await assert.rejects(client.send("draft2"), /HTML access-denied.*abc123-def/);
});

test('403 evidence preserves HTML structure, redacts sensitive values and never retries', async () => {
  let calls = 0;
  const client = createSenderClient({ env, fetchImpl: async () => {
    calls++;
    return new Response('<html>\n<h1>Forbidden</h1><p>private-key private@example.com 203.0.113.8 Bearer secret-token https://example.com/secret</p></html>',
      { status: 403, headers: { 'Content-Type': 'text/html', 'CF-Ray': 'support-123' } });
  } });
  await assert.rejects(client.send('draft1'), error => {
    const d = error.providerDiagnostic;
    assert.equal(d.http_status, 403); assert.equal(d.headers['cf-ray'], 'support-123'); assert.equal(d.method, 'POST');
    assert.match(d.response_body, /<h1>Forbidden<\/h1>/); assert.match(d.response_body, /\n/);
    assert.doesNotMatch(JSON.stringify(d), /private-key|private@example|203\.0\.113|secret-token|example.com\/secret/);
    assert.equal(d.truncated, false); assert.equal(d.read_error, false); return true;
  });
  assert.equal(calls, 1);
});
test('403 evidence bounds response bytes and distinguishes empty and truncated bodies', async () => {
  for (const body of ['', 'x'.repeat(70000)]) {
    const client = createSenderClient({ env, fetchImpl: async () => new Response(body, { status: 403 }) });
    await assert.rejects(client.send('draft1'), error => {
      const d = error.providerDiagnostic;
      assert.equal(d.truncated, body.length > 32768); assert.equal(d.response_body === '', body === '');
      assert.ok(d.response_body.length <= 32768); assert.equal(d.read_error, false); return true;
    });
  }
});


test('Sender polls the group active count before readiness and waits while recalculation is active',async()=>{
  let clock=0;const waits=[];let checks=0;
  const {client,calls}=setup([
    {status:200,body:{data:{id:'g1',active_subscribers:0}}},
    {status:200,body:{data:{id:'g1',active_subscribers:1}}},
    {status:200,body:{data:{id:'g1',active_subscribers:2,is_recalculating_subscribers:true}}},
    {status:200,body:{data:{id:'g1',active_subscribers:'2',is_recalculating_subscribers:false}}},
  ],env,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}});
  await client.waitForGroup('g1',2,async()=>{checks++;});
  assert.deepEqual(waits,[5000,5000,5000]);assert.equal(checks,4);
  assert.equal(calls.length,4);assert.ok(calls.every(c=>c.method==='GET'&&c.url==='https://api.sender.net/v2/groups/g1'));
});
test('Sender audience timeout is bounded to two minutes and never sends a campaign',async()=>{
  let clock=0;const responses=Array.from({length:24},()=>({status:200,body:{data:{id:'g1',active_subscribers:0}}}));
  const {client,calls}=setup(responses,env,{now:()=>clock,sleep:async ms=>{clock+=ms;}});
  await assert.rejects(client.waitForGroup('g1',1),/two minutes/);
  assert.equal(clock,120000);assert.equal(calls.length,24);assert.ok(calls.every(c=>c.method==='GET'));
});
test('Sender readiness rejects invalid, missing, wrong-group and oversized audience counts',async()=>{
  for(const data of [undefined,{id:'g1'},{id:'g1',active_subscribers:null},{id:'g1',active_subscribers:-1},{id:'g1',active_subscribers:1.5},{id:'other',active_subscribers:1},{id:'g1',active_subscribers:2}]) {
    const {client,calls}=setup([{status:200,body:{data}}]);
    await assert.rejects(client.waitForGroup('g1',1),/No campaign was sent/);assert.equal(calls.length,1);
  }
  const {client,calls}=setup([]);
  for(const count of [0,201,1.5])await assert.rejects(client.waitForGroup('g1',count),/non-empty batch/);
  assert.equal(calls.length,0);
});
test('Sender readiness preserves API throttling and honours a cancellation guard before polling',async()=>{
  const {client,calls}=setup([{status:429,retryAfter:'180',body:{}}]);
  await assert.rejects(client.waitForGroup('g1',1),e=>e.status===429&&e.retryAfterSeconds===180);
  assert.equal(calls.length,1);
  const cancelled=setup([]);
  await assert.rejects(cancelled.client.waitForGroup('g1',1,async()=>{throw new Error('paused');}),/paused/);
  assert.equal(cancelled.calls.length,0);
});
test('only an exact no-subscribers send rejection is flagged for a verified-draft retry',async()=>{
  for(const body of [{message:'No subscribers selected'},{errors:[{title:'No subscribers selected',details:'Select a group'}]}]) {
    const {client,calls}=setup([{status:403,body}]);
    await assert.rejects(client.send('c1'),e=>e.audienceNotReady===true&&!e.message.includes('private-key'));assert.equal(calls.length,1);
  }
  for(const body of [{message:'Forbidden'},{message:'No subscribers selected; contact private@example.com'},{errors:[{title:'No subscribers selected'},{title:'Domain unverified'}]}]) {
    const {client}=setup([{status:403,body}]);await assert.rejects(client.send('c1'),e=>e.audienceNotReady!==true);
  }
});
