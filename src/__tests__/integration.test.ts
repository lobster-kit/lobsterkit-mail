import { describe, it, expect, beforeAll } from 'vitest';
import { LobsterMail } from '../client.js';
import { Email } from '../email.js';

// These tests run against the local API at http://localhost:4801
// Requires: pnpm dev:api running

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:4801';

// Quick connectivity check — if the API isn't running, skip the whole suite
async function isApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const canRun = await isApiAvailable();

describe.skipIf(!canRun)('SDK Integration', () => {
  let lm: LobsterMail;

  beforeAll(async () => {
    // Create client with explicit signup (skip token persistence in tests)
    lm = await LobsterMail.create({
      baseUrl: API_URL,
      persistToken: false,
    });
  });

  it('auto-signup produces a valid token', () => {
    expect(lm.token).toMatch(/^lm_sk_test_/);
  });

  it('getAccount returns account info', async () => {
    const account = await lm.getAccount();
    expect(account.tier).toBe(0);
    expect(account.tierName).toBe('anonymous');
    expect(account.limits.canSend).toBe(false);
    expect(account.limits.maxInboxes).toBe(5);
    expect(account.usage.inboxCount).toBe(0);
  });

  it('createInbox returns an Inbox with a valid address', async () => {
    const inbox = await lm.createInbox();
    expect(inbox.id).toMatch(/^ibx_/);
    expect(inbox.address).toMatch(/^lobster-[a-z0-9]+@lobstermail\.ai$/);
    expect(inbox.isActive).toBe(true);
  });

  it('listInboxes returns created inbox', async () => {
    const inboxes = await lm.listInboxes();
    expect(inboxes.length).toBeGreaterThanOrEqual(1);
    expect(inboxes[0].id).toMatch(/^ibx_/);
  });

  it('getInbox returns inbox by ID', async () => {
    const created = await lm.createInbox();
    const fetched = await lm.getInbox(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.address).toBe(created.address);
  });

  it('deleteInbox soft-deletes', async () => {
    const inbox = await lm.createInbox();
    await lm.deleteInbox(inbox.id);
    const fetched = await lm.getInbox(inbox.id);
    expect(fetched.isActive).toBe(false);
  });

  it('inbox.receive returns empty data for new inbox', async () => {
    const inbox = await lm.createInbox();
    const { data: emails } = await inbox.receive();
    expect(emails).toHaveLength(0);
  });

  it('full inbound flow: simulate -> receive -> safeBodyForLLM', async () => {
    const inbox = await lm.createInbox();

    // Simulate inbound email via dev endpoint
    const res = await fetch(`${API_URL}/dev/simulate-inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: inbox.address,
        from: 'test-sdk@example.com',
        subject: 'SDK Test Email',
        body: 'Your verification code is 999888.',
      }),
    });
    expect(res.status).toBe(201);

    // Receive emails
    const { data: emails } = await inbox.receive();
    expect(emails.length).toBe(1);
    expect(emails[0]).toBeInstanceOf(Email);
    expect(emails[0].from).toBe('test-sdk@example.com');
    expect(emails[0].subject).toBe('SDK Test Email');

    // Get full email with body
    const full = await inbox.getEmail(emails[0].id);
    expect(full.body).toContain('Your verification code is 999888.');

    // safeBodyForLLM
    const safe = full.safeBodyForLLM();
    expect(safe).toContain('--- BEGIN UNTRUSTED EMAIL DATA ---');
    expect(safe).toContain('From: test-sdk@example.com');
    expect(safe).toContain('Subject: SDK Test Email');
    expect(safe).toContain('[EMAIL_CONTENT_START]');
    expect(safe).toContain('Your verification code is 999888.');
    expect(safe).toContain('[EMAIL_CONTENT_END]');
    expect(safe).toContain('--- END UNTRUSTED EMAIL DATA ---');

    // isInjectionRisk should be false for clean content
    expect(full.isInjectionRisk).toBe(false);
  });

  it('webhook CRUD works', async () => {
    const inbox = await lm.createInbox();

    const wh = await lm.createWebhook({
      url: 'https://example.com/webhook',
      inboxId: inbox.id,
    });
    expect(wh.id).toMatch(/^whk_/);
    expect(wh.secret).toMatch(/^whsec_/);

    const list = await lm.listWebhooks();
    expect(list.data.length).toBeGreaterThanOrEqual(1);

    await lm.deleteWebhook(wh.id);
  });
});
