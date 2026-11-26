import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import 'dotenv/config';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

const TEST_DB_URI = 'mongodb://127.0.0.1:27017/saraha_test_db';

let server;
let baseUrl;

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('Saraha Anonymous Messaging & Conversation API', () => {
  let alice, bob, charlie;
  let messageForRejectId;
  let messageForAcceptId;
  let rejectRequestId;
  let acceptRequestId;
  let conversationId;

  before(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key';
    await connectDB(TEST_DB_URI);
    await mongoose.connection.dropDatabase();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Register 3 users: Alice (sender), Bob (receiver), Charlie (unauthorized 3rd party)
    const r1 = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice', email: 'alice@example.com', password: 'password123' },
    });
    assert.equal(r1.status, 201);
    alice = { token: r1.data.token, user: r1.data.user };

    const r2 = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob', email: 'bob@example.com', password: 'password123' },
    });
    assert.equal(r2.status, 201);
    bob = { token: r2.data.token, user: r2.data.user };

    const r3 = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'Charlie', email: 'charlie@example.com', password: 'password123' },
    });
    assert.equal(r3.status, 201);
    charlie = { token: r3.data.token, user: r3.data.user };
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await new Promise((resolve) => server.close(resolve));
  });

  it('1) Send Anonymous Message: receiver cannot know sender identity', async () => {
    const res1 = await api('/api/messages', {
      method: 'POST',
      token: alice.token,
      body: { receiverId: bob.user._id, content: 'Secret message 1 (will be rejected)' },
    });
    assert.equal(res1.status, 201);
    messageForRejectId = res1.data.message._id;

    const res2 = await api('/api/messages', {
      method: 'POST',
      token: alice.token,
      body: { receiverId: bob.user._id, content: 'Secret message 2 (will be accepted)' },
    });
    assert.equal(res2.status, 201);
    messageForAcceptId = res2.data.message._id;

    // Bob retrieves received messages and cannot see Alice's identity
    const received = await api('/api/messages/received', { token: bob.token });
    assert.equal(received.status, 200);
    assert.equal(received.data.messages.length, 2);
    for (const msg of received.data.messages) {
      assert.equal(msg.isIdentityRevealed, false);
      assert.equal(msg.sender, null);
    }
  });

  it('2) Request Sender Identity: creates a request with status pending', async () => {
    // Charlie (not receiver) cannot request identity
    const forbidden = await api('/api/identity-requests', {
      method: 'POST',
      token: charlie.token,
      body: { messageId: messageForRejectId },
    });
    assert.equal(forbidden.status, 403);

    // Bob requests identity for both messages
    const req1 = await api('/api/identity-requests', {
      method: 'POST',
      token: bob.token,
      body: { messageId: messageForRejectId },
    });
    assert.equal(req1.status, 201);
    assert.equal(req1.data.request.status, 'pending');
    rejectRequestId = req1.data.request._id;

    const req2 = await api('/api/identity-requests', {
      method: 'POST',
      token: bob.token,
      body: { messageId: messageForAcceptId },
    });
    assert.equal(req2.status, 201);
    assert.equal(req2.data.request.status, 'pending');
    acceptRequestId = req2.data.request._id;
  });

  it('3) Get Requests: sender views all requests received from other users', async () => {
    const res = await api('/api/identity-requests', { token: alice.token });
    assert.equal(res.status, 200);
    assert.equal(res.data.requests.length, 2);
    assert.ok(res.data.requests.every((r) => r.status === 'pending'));
  });

  it('4) Reject Request: sender identity remains hidden and no conversation created', async () => {
    // Bob (receiver) cannot accept/reject on behalf of sender
    const forbidden = await api(`/api/identity-requests/${rejectRequestId}`, {
      method: 'PATCH',
      token: bob.token,
      body: { action: 'accept' },
    });
    assert.equal(forbidden.status, 403);

    const rejectRes = await api(`/api/identity-requests/${rejectRequestId}`, {
      method: 'PATCH',
      token: alice.token,
      body: { action: 'reject' },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.data.request.status, 'rejected');
    assert.equal(rejectRes.data.conversation, null);

    // Verify messageForRejectId still hides sender
    const msgRes = await api(`/api/messages/${messageForRejectId}`, { token: bob.token });
    assert.equal(msgRes.status, 200);
    assert.equal(msgRes.data.message.isIdentityRevealed, false);
    assert.equal(msgRes.data.message.sender, null);
  });

  it('4 & 5) Accept Request: reveals sender identity and creates linked conversation', async () => {
    const acceptRes = await api(`/api/identity-requests/${acceptRequestId}`, {
      method: 'PATCH',
      token: alice.token,
      body: { action: 'accept' },
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.request.status, 'accepted');
    assert.ok(acceptRes.data.conversation);
    assert.equal(acceptRes.data.conversation.originalMessage, messageForAcceptId);
    conversationId = acceptRes.data.conversation._id;

    // Receiver can now know sender's identity
    const msgRes = await api(`/api/messages/${messageForAcceptId}`, { token: bob.token });
    assert.equal(msgRes.status, 200);
    assert.equal(msgRes.data.message.isIdentityRevealed, true);
    assert.equal(msgRes.data.message.sender._id, alice.user._id);
    assert.equal(msgRes.data.message.sender.name, 'Alice');
  });

  it('4 & 5 & Authorization) Send & Get Conversation Messages: only participants allowed', async () => {
    // Charlie (3rd party) cannot send or get messages
    const charlieSend = await api(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: charlie.token,
      body: { content: 'Let me intrude!' },
    });
    assert.equal(charlieSend.status, 403);

    const charlieGet = await api(`/api/conversations/${conversationId}/messages`, {
      token: charlie.token,
    });
    assert.equal(charlieGet.status, 403);

    // Bob sends a message inside the conversation
    const bobMsg = await api(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: bob.token,
      body: { content: 'Hey Alice, nice to meet you!' },
    });
    assert.equal(bobMsg.status, 201);

    // Alice replies inside the conversation
    const aliceMsg = await api(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'Hey Bob! Glad you asked.' },
    });
    assert.equal(aliceMsg.status, 201);

    // Both retrieve the conversation messages
    const convo = await api(`/api/conversations/${conversationId}/messages`, {
      token: bob.token,
    });
    assert.equal(convo.status, 200);
    assert.equal(convo.data.conversation.originalMessage._id, messageForAcceptId);
    assert.equal(convo.data.messages.length, 2);
    assert.equal(convo.data.messages[0].content, 'Hey Alice, nice to meet you!');
    assert.equal(convo.data.messages[1].content, 'Hey Bob! Glad you asked.');
  });
});
