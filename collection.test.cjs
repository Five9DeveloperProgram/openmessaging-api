const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const collection = JSON.parse(fs.readFileSync(path.join(__dirname, 'Open Messaging API.postman_collection.json'), 'utf8'));
const requests = new Map(collection.item.flatMap(folder => folder.item.map(item => [item.name, item])));
const configured = {
  baseUrl: 'https://api.example.test',
  domainId: 'demo-domain',
  deliveryProfileId: 'demo-profile',
  campaignName: 'Demo campaign',
  authSecret: 'test-secret',
  authKey: 'test-key',
  bearerToken: 'test-token',
  chatId: 'test-chat',
  sourceParticipantId: 'test-user',
  messageId: 'test-message',
  outboundMessageId: 'test-outbound',
  attachmentId: 'test-attachment'
};
function state(overrides = {}) {
  return new Map([
    ...collection.variable.map(variable => [variable.key, variable.value]),
    ...Object.entries(configured),
    ...Object.entries(overrides)
  ]);
}
function execute(name, values, response, overrides = {}) {
  const item = structuredClone(requests.get(name));
  const outcome = { skipped: false, next: undefined, failures: [], logs: [], request: item.request };
  const store = {
    get: key => values.get(key),
    set: (key, value) => values.set(key, value)
  };
  const replaceIn = text => text.replace(/{{([^{}]+)}}/g, (match, key) => {
    if (key === '$isoTimestamp') return '2026-11-06T17:00:00.000Z';
    if (key === '$guid') return '00000000-0000-4000-8000-000000000001';
    return overrides[key] ?? values.get(key) ?? match;
  });
  item.request.url.toString = () => item.request.url.raw;
  if (item.request.body) item.request.body.update = raw => { item.request.body.raw = raw; };
  const pm = {
    info: { requestName: name },
    request: item.request,
    collectionVariables: store,
    variables: { ...store, get: key => overrides[key] ?? values.get(key), replaceIn },
    execution: {
      skipRequest: () => { outcome.skipped = true; },
      setNextRequest: next => { outcome.next = next; }
    },
    response: {
      code: response?.code,
      json: () => {
        if (response?.invalidJSON) throw new SyntaxError('Invalid JSON');
        return response?.body;
      },
      to: { have: { status: code => assert.equal(response.code, code) } }
    },
    test: (name, run) => {
      try { run(); } catch (error) { outcome.failures.push({ name, error }); }
    },
    expect: value => ({
      to: { be: { a: type => {
        assert.equal(typeof value, type);
        return { and: { not: { get empty() { assert.ok(value.length > 0); return true; } } } };
      } } }
    })
  };
  const context = vm.createContext({
    pm,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    console: {
      error: message => outcome.logs.push(message),
      warn: message => outcome.logs.push(message)
    }
  });
  function run(events, listen) {
    for (const event of events || []) {
      if (event.listen === listen) {
        vm.runInContext(`{\n${event.script.exec.join('\n')}\n}`, context);
      }
    }
  }
  try {
    run(collection.event, 'prerequest');
    run(item.event, 'prerequest');
    if (response) {
      run(collection.event, 'test');
      run(item.event, 'test');
    }
  } catch (error) {
    outcome.error = error;
  }
  return outcome;
}
function successful(outcome) {
  assert.equal(outcome.error, undefined, outcome.error?.stack);
  assert.deepEqual(outcome.failures, []);
  assert.equal(outcome.skipped, false);
}

test('all 20 operations are preserved, grouped and parameterized consistently', () => {
  assert.equal(requests.size, 20);
  const keys = collection.variable.map(variable => variable.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('campaignName'));
  assert.ok(!keys.includes('chatCampaignName'));
  assert.equal(collection.auth.bearer[0].value, '{{bearerToken}}');
  for (const [name, item] of requests) {
    const url = item.request.url;
    assert.equal(url.variable, undefined, name);
    assert.ok(!url.path.some(part => part.startsWith(':')), name);
    const query = (url.query || []).filter(query => !query.disabled).map(query => `${query.key}=${query.value}`).join('&');
    assert.equal(url.raw, `{{baseUrl}}/${url.path.join('/')}${query ? '?' + query : ''}`, name);
    const payload = JSON.stringify({ url, body: item.request.body });
    for (const [, key] of payload.matchAll(/{{([^{}]+)}}/g)) {
      assert.ok(key.startsWith('$') || keys.includes(key), `${name}: undeclared ${key}`);
    }
    for (const query of url.query || []) {
      if (query.key === 'pageLimit') assert.equal(query.value, '{{pageLimit}}');
      else assert.equal(query.disabled, true);
    }
    assert.ok(item.event.some(event => event.listen === 'test'), name);
  }
  assert.equal(requests.get('authentication').request.auth.type, 'noauth');
});

test('authentication preserves credential order and captures the token', () => {
  const values = state();
  successful(execute('authentication', values, { code: 200, body: { access_token: 'new-token' } }));
  assert.equal(values.get('authEncoded'), Buffer.from('test-secret:test-key').toString('base64'));
  assert.equal(values.get('bearerToken'), 'new-token');
});

test('ordered text demo chains chat, USER participant and message IDs', () => {
  const values = state({ chatId: '', sourceParticipantId: '', messageId: '' });
  const chat = { chatId: 'new-chat', participants: [
    { type: 'AGENT', participantId: 'agent-id' },
    { type: 'USER', participantId: 'customer-id' }
  ] };
  const responses = {
    'Create a new chat': { code: 201, body: chat },
    'Retrieve chat details': { code: 200, body: chat },
    'Show typing indicator': { code: 204 },
    'Add a message to a chat': { code: 201, body: { messageId: 'new-message' } },
    'List all messages in a chat': { code: 200, body: { chatMessages: [] } },
    'Retrieve a chat message': { code: 200, body: { messageId: 'new-message' } },
    'Retrieve chat interaction history': { code: 200, body: { items: [] } }
  };
  for (const item of collection.item.find(folder => folder.name === '01 - Text chat demo').item) {
    successful(execute(item.name, values, responses[item.name]));
  }
  assert.equal(values.get('chatId'), 'new-chat');
  assert.equal(values.get('sourceParticipantId'), 'customer-id');
  assert.equal(values.get('messageId'), 'new-message');
});

test('demo payloads use real values, valid types and fresh timestamps without import junk', () => {
  const values = state({
    campaignName: 'Sales "VIP"\\North\nDemo',
    messageText: 'Quotes: "hello"\nNew line \\ slash'
  });
  const create = execute('Create a new chat', values);
  successful(create);
  const chat = JSON.parse(create.request.body.raw);
  assert.deepEqual(Object.keys(chat).sort(), ['attributes', 'campaignSource', 'channel', 'contactSource']);
  assert.deepEqual(chat.campaignSource, { campaignName: values.get('campaignName') });
  assert.equal(chat.channel, 'GENERIC');
  assert.equal(chat.contactSource.clientHandleType, 'CHANNEL_DEFAULT');
  assert.ok(create.request.body.raw.length < 1500);
  values.set('chatId', 'new-chat');
  values.set('sourceParticipantId', 'new-user');
  const send = execute('Add a message to a chat', values);
  successful(send);
  const message = JSON.parse(send.request.body.raw);
  assert.equal(message.text, values.get('messageText'));
  assert.equal(message.type, 'TEXT');
  assert.equal(message.timestamp, '2026-11-06T17:00:00.000Z');
  assert.equal(message.sourceParticipantId, 'new-user');
  assert.equal(message.attachments, undefined);
});

test('missing settings and invalid pagination prevent sending and stop the runner', () => {
  for (const [name, key, value] of [
    ['Create a new chat', 'domainId', ''],
    ['Create a new chat', 'deliveryProfileId', 'string'],
    ['Create a new chat', 'campaignName', ''],
    ['Create a new chat', 'baseUrl', 'http://api.example.test'],
    ['Create a new chat', 'baseUrl', 'https://api.example.test/'],
    ['Add a message to a chat', 'sourceParticipantId', ''],
    ['Retrieve chat details', 'bearerToken', ''],
    ['List all messages in a chat', 'pageLimit', '0'],
    ['List all messages in a chat', 'pageLimit', '1.5'],
    ['authentication', 'authKey', '']
  ]) {
    const outcome = execute(name, state({ [key]: value }));
    assert.ok(outcome.error, `${name}: ${key}`);
    assert.ok(outcome.skipped);
    assert.equal(outcome.next, null);
    assert.ok(outcome.logs.length);
  }
});

test('failed create/auth/send attempts clear stale outputs and never capture error fields', () => {
  for (const [name, key] of [
    ['Create a new chat', 'chatId'],
    ['authentication', 'bearerToken'],
    ['Add a message to a chat', 'messageId'],
    ['Create chat attachment', 'attachmentId']
  ]) {
    const values = state();
    const outcome = execute(name, values, { code: 401, body: { chatId: 'bad', messageId: 'bad', access_token: 'bad' } });
    assert.ok(outcome.error);
    assert.equal(outcome.next, null);
    assert.equal(values.get(key), '');
    assert.equal(outcome.failures.length, 1);
  }
});

test('successful status without required output fails instead of reusing stale IDs', () => {
  for (const [name, code, key] of [
    ['authentication', 200, 'bearerToken'],
    ['Create a new chat', 201, 'chatId'],
    ['Add a message to a chat', 201, 'messageId']
  ]) {
    const values = state();
    const outcome = execute(name, values, { code, body: {} });
    assert.ok(outcome.error);
    assert.equal(outcome.next, null);
    assert.equal(values.get(key), '');
  }
});

test('malformed or non-object JSON stops the runner without retaining an old token or ID', () => {
  for (const [name, code, key] of [
    ['authentication', 200, 'bearerToken'],
    ['Create a new chat', 201, 'chatId'],
    ['Add a message to a chat', 201, 'messageId'],
    ['Create chat attachment', 201, 'attachmentId']
  ]) {
    for (const response of [{ code, invalidJSON: true }, { code, body: null }, { code, body: [] }]) {
      const values = state();
      const outcome = execute(name, values, response);
      assert.ok(outcome.error);
      assert.equal(outcome.next, null);
      assert.equal(values.get(key), '');
    }
  }
});

test('shadowed runtime variables prevent acting on the wrong chat or message', () => {
  for (const key of ['chatId', 'messageId', 'bearerToken']) {
    const outcome = execute('Retrieve a chat message', state(), undefined, { [key]: 'wrong-environment-value' });
    assert.ok(outcome.skipped);
    assert.equal(outcome.next, null);
    assert.match(outcome.error.message, /override hides the collection value/);
  }
});

test('missing USER participant is reported, never substituted with an agent', () => {
  const values = state();
  const outcome = execute('Create a new chat', values, {
    code: 201, body: { chatId: 'new-chat', participants: [{ type: 'AGENT', participantId: 'agent-id' }] }
  });
  successful(outcome);
  assert.equal(values.get('sourceParticipantId'), '');
  assert.ok(outcome.logs.some(message => message.includes('No USER participant')));
  assert.ok(execute('Add a message to a chat', values).skipped);
});

test('acknowledgments require a separate outbound ID and preserve the customer message ID', () => {
  for (const name of [...requests.keys()].filter(name => name.startsWith('Acknowledge'))) {
    const values = state();
    const result = execute(name, values, { code: 204 });
    successful(result);
    assert.ok(result.request.url.raw.includes('{{outboundMessageId}}'));
    assert.ok(!result.request.url.raw.includes('{{messageId}}'));
    assert.equal(values.get('messageId'), 'test-message');
    assert.ok(execute(name, state({ outboundMessageId: '' })).skipped);
  }
});

test('destructive actions require explicit opt-in and successful termination resets state', () => {
  for (const name of ['Update message in an open chat', 'Delete message from an open chat', 'Terminate chat']) {
    const outcome = execute(name, state());
    assert.ok(outcome.skipped);
    assert.equal(outcome.next, null);
    successful(execute(name, state({ allowDestructiveActions: 'true' }), { code: name.startsWith('Update') ? 200 : 204 }));
  }
  const values = state({ allowDestructiveActions: 'true' });
  successful(execute('Terminate chat', values, { code: 204 }));
  for (const key of ['chatId', 'sourceParticipantId', 'messageId', 'outboundMessageId', 'attachmentId', 'uploadUrl']) {
    assert.equal(values.get(key), '');
  }
  assert.equal(values.get('allowDestructiveActions'), 'false');
});

test('attachment metadata captures ID and signed upload URL without performing an upload', () => {
  const values = state();
  const outcome = execute('Create chat attachment', values, {
    code: 201, body: { attachmentId: 'new-attachment', uploadUrl: 'https://upload.example.test/signed' }
  });
  successful(outcome);
  const body = JSON.parse(outcome.request.body.raw);
  assert.equal(body.name, 'demo.txt');
  assert.match(body.externalId, /^[a-f0-9-]{36}$/);
  assert.equal(values.get('attachmentId'), 'new-attachment');
  assert.equal(values.get('uploadUrl'), 'https://upload.example.test/signed');
});
