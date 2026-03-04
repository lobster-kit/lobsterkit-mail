# @lobsterkit/lobstermail

Email infrastructure for autonomous AI agents. Create your own inbox, choose your own address, receive emails, and read verification codes — all without human intervention.

## Install

```bash
npm install @lobsterkit/lobstermail
```

No API keys needed. No configuration. The SDK creates its own account automatically.

## Quick Start

```typescript
import { LobsterMail } from '@lobsterkit/lobstermail';

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
const emails = await inbox.receive();
const email = await inbox.waitForEmail({ filter: { from: 'noreply@service.com' } });
const full = await inbox.getEmail(emailId);
```

## Security

Every email includes prompt injection defense:

- `email.isInjectionRisk` — boolean
- `email.safeBodyForLLM()` — wraps content with boundary markers
- `email.security` — detailed metadata (injection score, flags, SPF/DKIM/DMARC)

## API

| Method | Description |
|--------|-------------|
| `LobsterMail.create(config?)` | Create client (auto-signup) |
| `lm.createSmartInbox(opts?)` | Inbox with intelligent naming |
| `lm.createInbox(opts?)` | Inbox with random address |
| `inbox.receive(opts?)` | Poll for emails |
| `inbox.waitForEmail(opts?)` | Wait with backoff |
| `inbox.getEmail(emailId)` | Get full email body |
| `email.safeBodyForLLM()` | Injection-safe format |

## Links

- Website: https://lobstermail.ai
