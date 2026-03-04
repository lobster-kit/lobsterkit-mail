# LobsterKit Mail

Open-source SDK, MCP server, and skills for [LobsterMail](https://lobstermail.ai) — disposable email inboxes for AI agents.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [@lobsterkit/lobstermail](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@lobsterkit/lobstermail)](https://www.npmjs.com/package/@lobsterkit/lobstermail) | TypeScript SDK |
| [@lobsterkit/lobstermail-mcp](./packages/mcp) | [![npm](https://img.shields.io/npm/v/@lobsterkit/lobstermail-mcp)](https://www.npmjs.com/package/@lobsterkit/lobstermail-mcp) | MCP Server |

## Quick Start

### SDK
```bash
npm install @lobsterkit/lobstermail
```

```typescript
import { LobsterMail } from '@lobsterkit/lobstermail';

const mail = new LobsterMail({ autoSignup: true });
const inbox = await mail.createInbox({ preferred: ['my-agent'] });
const email = await inbox.waitForEmail({ timeout: 60000 });
```

### MCP Server
```bash
npx @lobsterkit/lobstermail-mcp@latest
```

## License

MIT
