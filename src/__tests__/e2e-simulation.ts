/**
 * End-to-end simulation: "npm install @lobsterkit/lobstermail → it just works"
 *
 * This script simulates exactly what an AI agent would do after
 * `npm install @lobsterkit/lobstermail`. Run against a live local API.
 *
 * Usage: npx tsx packages/sdk/src/__tests__/e2e-simulation.ts
 */
import { LobsterMail, Email } from '../index.js';

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:4801';

async function main() {
  console.log('=== LobsterMail E2E Simulation ===\n');

  // ─── Step 1: Auto-signup ───
  console.log('Step 1: LobsterMail.create() — auto-signup...');
  const lm = await LobsterMail.create({
    baseUrl: API_URL,
    persistToken: false, // don't pollute ~/.lobstermail/token
  });
  console.log(`  ✅ Token: ${lm.token.slice(0, 20)}...`);

  // ─── Step 2: Check account ───
  console.log('\nStep 2: getAccount()...');
  const acct = await lm.getAccount();
  console.log(`  ✅ Tier: ${acct.tier} (${acct.tierName})`);
  console.log(`  ✅ Can send: ${acct.limits.canSend}`);
  console.log(`  ✅ Max inboxes: ${acct.limits.maxInboxes}`);
  console.log(`  ✅ Created at: ${acct.createdAt}`);
  console.log(`  ✅ Last active: ${acct.lastActiveAt}`);
  console.log(`  ✅ X verification pending: ${acct.xVerificationPending}`);

  // ─── Step 3: Smart inbox ───
  console.log('\nStep 3: createSmartInbox() — identity-based naming...');
  const inbox = await lm.createSmartInbox({
    name: 'Test Agent',
    org: 'Simulation',
    displayName: 'E2E Test Agent',
  });
  console.log(`  ✅ Address: ${inbox.address}`);
  console.log(`  ✅ ID: ${inbox.id}`);
  console.log(`  ✅ Active: ${inbox.isActive}`);

  // ─── Step 4: Preferred name inbox ───
  console.log('\nStep 4: createSmartInbox() — preferred name...');
  const inbox2 = await lm.createSmartInbox({
    preferred: ['e2e-bot', 'e2e-test'],
    displayName: 'E2E Bot',
  });
  console.log(`  ✅ Address: ${inbox2.address}`);

  // ─── Step 5: Collision handling ───
  console.log('\nStep 5: createSmartInbox() — collision fallback...');
  const inbox3 = await lm.createSmartInbox({
    name: 'Test Agent', // same name as step 3 — should get variation
    org: 'Simulation',
  });
  console.log(`  ✅ Address: ${inbox3.address} (should be different from ${inbox.address})`);
  if (inbox3.address === inbox.address) {
    console.error('  ❌ COLLISION — got same address!');
    process.exit(1);
  }

  // ─── Step 6: List inboxes ───
  console.log('\nStep 6: listInboxes()...');
  const allInboxes = await lm.listInboxes();
  console.log(`  ✅ Total inboxes: ${allInboxes.length}`);

  // ─── Step 7: Simulate inbound email ───
  console.log('\nStep 7: Simulate inbound email...');
  const simRes = await fetch(`${API_URL}/dev/simulate-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: inbox.address,
      from: 'verify@example.com',
      subject: 'Your verification code',
      body: 'Your code is 847291. Enter it to complete signup.',
    }),
  });
  if (!simRes.ok) {
    console.error(`  ❌ Simulate failed: ${simRes.status} ${await simRes.text()}`);
    process.exit(1);
  }
  console.log('  ✅ Email simulated');

  // ─── Step 8: Receive emails ───
  console.log('\nStep 8: inbox.receive()...');
  const { data: emails } = await inbox.receive();
  console.log(`  ✅ Received ${emails.length} email(s)`);
  if (emails.length === 0) {
    console.error('  ❌ Expected at least 1 email');
    process.exit(1);
  }
  const email = emails[0];
  console.log(`  ✅ From: ${email.from}`);
  console.log(`  ✅ Subject: ${email.subject}`);
  console.log(`  ✅ Preview: ${email.preview}`);
  console.log(`  ✅ Is injection risk: ${email.isInjectionRisk}`);

  // ─── Step 9: Get full email ───
  console.log('\nStep 9: inbox.getEmail() — full body...');
  const full = await inbox.getEmail(email.id);
  console.log(`  ✅ Body: ${full.body?.slice(0, 80)}`);
  console.log(`  ✅ Security score: ${full.security.injectionRiskScore}`);
  console.log(`  ✅ Security flags: [${full.security.flags.join(', ')}]`);

  // ─── Step 10: safeBodyForLLM ───
  console.log('\nStep 10: email.safeBodyForLLM()...');
  const safe = full.safeBodyForLLM();
  const hasMarkers =
    safe.includes('--- BEGIN UNTRUSTED EMAIL DATA ---') &&
    safe.includes('[EMAIL_CONTENT_START]') &&
    safe.includes('[EMAIL_CONTENT_END]') &&
    safe.includes('--- END UNTRUSTED EMAIL DATA ---');
  console.log(`  ✅ Has boundary markers: ${hasMarkers}`);
  if (!hasMarkers) {
    console.error('  ❌ Missing boundary markers in safeBodyForLLM output');
    process.exit(1);
  }
  console.log(`  ✅ Contains verification code: ${safe.includes('847291')}`);

  // ─── Step 11: Dot equivalence ───
  console.log('\nStep 11: Dot equivalence — send to dotted address...');
  // inbox.address might be "test-agent@lobstermail.ai"
  // Let's send to the dotted variant
  const parts = inbox.address.split('@');
  const localPart = parts[0];
  const domain = parts[1];
  // Insert a dot after first char if localPart has no dots
  const dottedLocal = localPart.length > 2
    ? localPart[0] + '.' + localPart.slice(1)
    : localPart;
  const dottedAddress = `${dottedLocal}@${domain}`;
  console.log(`  Original: ${inbox.address}`);
  console.log(`  Dotted:   ${dottedAddress}`);

  const dotRes = await fetch(`${API_URL}/dev/simulate-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: dottedAddress,
      from: 'dot-test@example.com',
      subject: 'Dot equivalence test',
      body: 'This email was sent to the dotted variant of your address.',
    }),
  });
  if (!dotRes.ok) {
    console.error(`  ❌ Dot equivalence failed: ${dotRes.status} ${await dotRes.text()}`);
    process.exit(1);
  }
  console.log('  ✅ Dot equivalence works — email delivered to same inbox');

  // Verify both emails are in the same inbox
  const { data: allEmails } = await inbox.receive();
  console.log(`  ✅ Inbox now has ${allEmails.length} email(s) (expected 2)`);
  if (allEmails.length !== 2) {
    console.error(`  ❌ Expected 2 emails, got ${allEmails.length}`);
    process.exit(1);
  }

  // ─── Step 12: Webhooks ───
  console.log('\nStep 12: Webhook CRUD...');
  const wh = await lm.createWebhook({
    url: 'https://example.com/hook',
    inboxId: inbox.id,
  });
  console.log(`  ✅ Webhook created: ${wh.id}`);
  console.log(`  ✅ Secret: ${wh.secret.slice(0, 15)}...`);

  const webhooks = await lm.listWebhooks();
  console.log(`  ✅ Total webhooks: ${webhooks.data.length}`);

  await lm.deleteWebhook(wh.id);
  console.log('  ✅ Webhook deleted');

  // ─── Step 13: Delete inbox ───
  console.log('\nStep 13: deleteInbox()...');
  await lm.deleteInbox(inbox2.id);
  const deleted = await lm.getInbox(inbox2.id);
  console.log(`  ✅ Inbox ${inbox2.id} isActive: ${deleted.isActive} (expected false)`);
  if (deleted.isActive) {
    console.error('  ❌ Inbox should be soft-deleted');
    process.exit(1);
  }

  // ─── Step 14: Random inbox (fallback) ───
  console.log('\nStep 14: createInbox() — random address...');
  const randomInbox = await lm.createInbox();
  console.log(`  ✅ Random address: ${randomInbox.address}`);
  const isLobsterFormat = /^lobster-[a-z0-9]+@lobstermail\.ai$/.test(randomInbox.address);
  console.log(`  ✅ Matches lobster-xxxx format: ${isLobsterFormat}`);

  // ─── Done ───
  console.log('\n============================');
  console.log('✅ ALL STEPS PASSED');
  console.log('============================');
  console.log(`\nTotal inboxes created: ${(await lm.listInboxes()).length}`);
  console.log('The "npm install @lobsterkit/lobstermail" flow works end-to-end.');
}

main().catch((err) => {
  console.error('\n❌ SIMULATION FAILED:', err);
  process.exit(1);
});
