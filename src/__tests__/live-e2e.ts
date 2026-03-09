/**
 * Live end-to-end test — real email from Gmail to LobsterMail
 *
 * This script hits the production API at api.lobstermail.ai,
 * creates a real inbox, and waits for YOU to send a real email
 * from your Google Workspace account.
 *
 * Usage:
 *   npx tsx packages/sdk/src/__tests__/live-e2e.ts
 *
 * What it does:
 *   1. Auto-signup (or reuse existing token)
 *   2. Create a smart inbox
 *   3. Print the address and WAIT for you to send an email to it
 *   4. Receive the email, print it, run security checks
 *   5. Show the LLM-safe body
 */
import { LobsterMail } from '../index.js';
import * as readline from 'node:readline';

// ── Config ──────────────────────────────────────────────────────
const WAIT_TIMEOUT = 5 * 60_000; // 5 minutes to send the email

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  LobsterMail — Live E2E Test (real email)   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ─── Step 1: Create client ───────────────────────────────────
  console.log('Step 1: LobsterMail.create() — auto-signup...');
  const lm = await LobsterMail.create({
    // Uses default https://api.lobstermail.ai — through the Cloudflare edge proxy
    persistToken: true, // save to ~/.lobstermail/token for reuse
  });
  console.log(`  ✅ Token: ${lm.token.slice(0, 25)}...`);

  // ─── Step 2: Check account ──────────────────────────────────
  console.log('\nStep 2: getAccount()...');
  const acct = await lm.getAccount();
  console.log(`  ✅ Account: ${acct.id}`);
  console.log(`  ✅ Tier: ${acct.tier} (${acct.tierName})`);
  console.log(`  ✅ Inboxes used: ${acct.usage.inboxCount}`);

  // ─── Step 3: Smart inbox ────────────────────────────────────
  console.log('\nStep 3: createSmartInbox()...');
  const inbox = await lm.createSmartInbox({
    name: 'Live Test',
    org: 'LobsterMail',
    displayName: 'Live E2E Test',
  });
  console.log(`  ✅ Inbox created: ${inbox.address}`);
  console.log(`  ✅ Inbox ID: ${inbox.id}`);

  // ─── Step 4: Wait for human to send email ───────────────────
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│                                              │');
  console.log(`│  📧  Send an email to:                       │`);
  console.log(`│                                              │`);
  console.log(`│      ${inbox.address}`);
  console.log('│                                              │');
  console.log('│  From your Google Workspace account.         │');
  console.log('│  Any subject / body you like.                │');
  console.log('│                                              │');
  console.log('└──────────────────────────────────────────────┘\n');

  await prompt('Press ENTER once you\'ve sent the email...');

  // ─── Step 5: Wait for email ─────────────────────────────────
  console.log('\nStep 5: inbox.waitForEmail() — polling...');
  const startMs = Date.now();
  const email = await inbox.waitForEmail({
    timeout: WAIT_TIMEOUT,
  });
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  if (!email) {
    console.error(`\n  ❌ No email received within ${WAIT_TIMEOUT / 1000}s timeout`);
    process.exit(1);
  }

  console.log(`  ✅ Email received in ${elapsed}s`);
  console.log(`  ✅ From: ${email.from}`);
  console.log(`  ✅ Subject: ${email.subject}`);
  console.log(`  ✅ Preview: ${email.preview?.slice(0, 100)}`);
  console.log(`  ✅ Direction: ${email.direction}`);
  console.log(`  ✅ Has attachments: ${email.hasAttachments}`);

  // ─── Step 6: Security analysis ──────────────────────────────
  console.log('\nStep 6: Security analysis...');
  console.log(`  ✅ Injection risk score: ${email.security.injectionRiskScore}`);
  console.log(`  ✅ Is injection risk: ${email.isInjectionRisk}`);
  console.log(`  ✅ Security flags: [${email.security.flags.join(', ') || 'none'}]`);
  console.log(`  ✅ SPF: ${email.security.spf ?? 'n/a'}`);
  console.log(`  ✅ DKIM: ${email.security.dkim ?? 'n/a'}`);
  console.log(`  ✅ DMARC: ${email.security.dmarc ?? 'n/a'}`);

  // ─── Step 7: LLM-safe body ─────────────────────────────────
  console.log('\nStep 7: email.safeBodyForLLM()...');
  const safe = email.safeBodyForLLM();
  console.log('  ─── LLM-safe output ───');
  console.log(safe);
  console.log('  ─── end ───');

  const hasMarkers =
    safe.includes('--- BEGIN UNTRUSTED EMAIL DATA ---') &&
    safe.includes('[EMAIL_CONTENT_START]') &&
    safe.includes('[EMAIL_CONTENT_END]') &&
    safe.includes('--- END UNTRUSTED EMAIL DATA ---');
  console.log(`\n  ✅ Boundary markers present: ${hasMarkers}`);
  if (!hasMarkers) {
    console.error('  ❌ Missing boundary markers!');
    process.exit(1);
  }

  // ─── Step 8: List all emails in inbox ───────────────────────
  console.log('\nStep 8: inbox.receive() — list...');
  const { data: all } = await inbox.receive();
  console.log(`  ✅ Total emails in inbox: ${all.length}`);

  // ─── Done ───────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✅  ALL CHECKS PASSED — live email works!   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nInbox: ${inbox.address}`);
  console.log(`Email from: ${email.from}`);
  console.log(`Subject: ${email.subject}`);
}

main().catch((err) => {
  console.error('\n❌ LIVE E2E FAILED:', err);
  process.exit(1);
});
