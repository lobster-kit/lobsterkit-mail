# lobstermail

Email infrastructure for autonomous AI agents. Create your own inbox, choose your own address, receive emails, and read verification codes — all without human intervention.

## Install

```bash
npm install lobstermail
```

No API keys needed. No configuration. The SDK creates its own account automatically.

## Quick Start

```typescript
import { LobsterMail } from 'lobstermail';

const lm = await LobsterMail.create();
const inbox = await lm.createSmartInbox({
  name: 'Sarah Shield',
  org: 'Palisade',
});
// inbox.address → "sarah-shield@lobstermail.ai"

const email = await inbox.waitForEmail({
  filter: { from: 'noreply@service.com' },
  timeout: 60000,
});

if (email) {
  console.log(email.safeBodyForLLM()); // injection-safe output
}
```

## Smart Inbox Naming

Don't settle for `lobster-xxxx`. Use `createSmartInbox()` to get a meaningful address:

```typescript
// Identity-based: tries sarah-shield → sarah-shield-palisade → s-shield → sarah-shield1..5 → random
const inbox = await lm.createSmartInbox({ name: 'Sarah Shield', org: 'Palisade' });

// Purpose-based: tries billing-bot → billing → random
const inbox = await lm.createSmartInbox({ preferred: ['billing-bot', 'billing'] });
```

Dots are cosmetic (Gmail-style): `sarah.shield` and `sarahshield` deliver to the same mailbox.

## Receiving Email

```typescript
const { data: emails } = await inbox.receive();
const email = await inbox.waitForEmail({ filter: { from: 'noreply@service.com' } });
const full = await inbox.getEmail(emailId);
```

## Security

Every email includes prompt injection defense:

- `email.isInjectionRisk` — boolean
- `email.safeBodyForLLM()` — wraps content with boundary markers
- `email.security` — detailed metadata (injection score, flags, SPF/DKIM/DMARC)

## Custom Domains

Use your own domain instead of `@lobstermail.ai`. Requires **Tier 2 (Builder)** or above.

```typescript
const domain = await lm.addDomain({ domain: 'yourdomain.com' });
console.log(domain.status);     // 'pending_verification'
console.log(domain.dnsRecords); // DNS records to configure
```

Configure all five DNS records at your DNS provider:

| # | Purpose | Type | Host | Value |
|---|---------|------|------|-------|
| 1 | Verification | TXT | `_lobstermail.yourdomain.com` | `lobstermail-verify=dom_abc123` |
| 2 | Inbound mail | MX | `yourdomain.com` | `mx.lobstermail.ai` (priority 10) |
| 3 | SPF | TXT | `yourdomain.com` | `v=spf1 include:spf.lobstermail.ai ~all` |
| 4 | DKIM | CNAME | `lobstermail._domainkey.yourdomain.com` | `dkim.lobstermail.ai` |
| 5 | DMARC | TXT | `_dmarc.yourdomain.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` |

If you already have an SPF record, add `include:spf.lobstermail.ai` to it rather than creating a new one.

After DNS propagation, verify and start using your domain:

```typescript
await lm.verifyDomain(domain.id);

const inbox = await lm.createInbox({
  localPart: 'agent',
  domain: 'yourdomain.com',
});
// inbox.address → "agent@yourdomain.com"
```

## API

| Method | Description |
|--------|-------------|
| `LobsterMail.create(config?)` | Create client (auto-signup) |
| `lm.verify(opts)` | Verify account to unlock sending |
| `lm.createSmartInbox(opts?)` | Inbox with intelligent naming |
| `lm.createInbox(opts?)` | Inbox with random or custom address |
| `inbox.receive(opts?)` | Poll for emails (paginated) |
| `inbox.waitForEmail(opts?)` | Wait with backoff |
| `inbox.getEmail(emailId)` | Get full email body |
| `inbox.send(opts)` | Send email (Tier 1+) |
| `email.safeBodyForLLM()` | Injection-safe format |
| `lm.addDomain(opts)` | Register a custom domain |
| `lm.getDomain(id)` | Get domain details |
| `lm.listDomains()` | List all custom domains |
| `lm.verifyDomain(id)` | Trigger DNS re-verification |
| `lm.deleteDomain(id)` | Delete a custom domain |

## OpenClaw Channel Plugin

LobsterMail works as a native [OpenClaw](https://openclaw.ai) channel plugin — giving your agent a real email address as a first-class messaging surface alongside Telegram, Discord, etc.

### Install

```bash
openclaw plugins install lobstermail
```

### Configure

Add to your OpenClaw config (`~/.openclaw/config.yaml`):

```yaml
channels:
  lobstermail:
    token: "lm_sk_..."           # LobsterMail API token
    inboxId: "ibx__..."          # Inbox ID to send/receive from
    inboxAddress: "agent@lobstermail.ai"
    webhookSecret: "whsec_..."   # HMAC-SHA256 secret (optional but recommended)
    allowFrom: ["*"]             # Who can email the agent (* = anyone)
```

### How it works

- **Outbound:** Your agent sends email via the standard `message` tool — same interface as Telegram/Discord
- **Inbound:** Emails arrive via webhook, verified with HMAC signatures, sanitized for prompt injection, then delivered to the agent as messages
- **Security:** Boundary markers stripped, injection risk scored, SPF/DKIM/DMARC metadata attached

### Getting a token

```typescript
import { LobsterMail } from 'lobstermail';
const lm = await LobsterMail.create();          // auto-signup, no API key needed
const inbox = await lm.createSmartInbox();       // get an address
console.log(inbox.address);                      // → "your-agent@lobstermail.ai"
```

Use the token from `~/.lobstermail/config.json` and the inbox ID from the response.

## LobsterKit Ecosystem

`lobstermail` is part of the LobsterKit ecosystem alongside [@lobsterkit/vault](https://www.npmjs.com/package/@lobsterkit/vault) and [@lobsterkit/db](https://www.npmjs.com/package/@lobsterkit/db). Link accounts across products at signup with a `linkToken` to get a single Stripe customer and an automatic 15% multi-product discount.

## Links

- Website: https://lobstermail.ai
