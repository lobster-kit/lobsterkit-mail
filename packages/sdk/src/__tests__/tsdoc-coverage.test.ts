import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * This test verifies that all exported classes and their public methods/getters
 * have JSDoc/TSDoc comments. It checks for the presence of a `/** ... *​/`
 * comment immediately before each declaration.
 *
 * We use an explicit list of expected public members rather than regex-based
 * discovery, since regex parsing of TypeScript is inherently fragile.
 */

const SDK_SRC = resolve(__dirname, '..');

function hasJSDocBefore(content: string, pattern: RegExp): boolean {
  const match = content.match(pattern);
  if (!match || match.index === undefined) return false;

  // Look at the text before the match for a closing JSDoc comment
  const before = content.substring(0, match.index);
  // The JSDoc comment should end right before the declaration (allowing whitespace)
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(before);
}

describe('SDK TSDoc Coverage', () => {
  describe('LobsterMail class (client.ts)', () => {
    const content = readFileSync(resolve(SDK_SRC, 'client.ts'), 'utf-8');

    it('class LobsterMail has TSDoc', () => {
      expect(hasJSDocBefore(content, /export\s+class\s+LobsterMail/)).toBe(true);
    });

    const methods = [
      { name: 'create', pattern: /static\s+async\s+create\(/ },
      { name: 'token', pattern: /get\s+token\(\)/ },
      { name: 'getAccount', pattern: /async\s+getAccount\(\)/ },
      { name: 'createInbox', pattern: /async\s+createInbox\(/ },
      { name: 'createSmartInbox', pattern: /async\s+createSmartInbox\(/ },
      { name: 'getInbox', pattern: /async\s+getInbox\(/ },
      { name: 'listInboxes', pattern: /async\s+listInboxes\(\)/ },
      { name: 'deleteInbox', pattern: /async\s+deleteInbox\(/ },
      { name: 'createWebhook', pattern: /async\s+createWebhook\(/ },
      { name: 'listWebhooks', pattern: /async\s+listWebhooks\(\)/ },
      { name: 'deleteWebhook', pattern: /async\s+deleteWebhook\(/ },
      { name: 'connect', pattern: /async\s+connect\(options\?/ },
    ];

    for (const { name, pattern } of methods) {
      it(`LobsterMail.${name} has TSDoc`, () => {
        expect(hasJSDocBefore(content, pattern)).toBe(true);
      });
    }
  });

  describe('RealtimeConnection class (realtime.ts)', () => {
    const content = readFileSync(resolve(SDK_SRC, 'realtime.ts'), 'utf-8');

    it('class RealtimeConnection has TSDoc', () => {
      expect(hasJSDocBefore(content, /export\s+class\s+RealtimeConnection/)).toBe(true);
    });

    const methods = [
      { name: 'connect', pattern: /async\s+connect\(\):\s*Promise<void>/ },
      { name: 'subscribe', pattern: /subscribe\(inboxId:\s*string/ },
      { name: 'onEmail', pattern: /onEmail\(handler/ },
      { name: 'onError', pattern: /onError\(handler/ },
      { name: 'onConnect', pattern: /onConnect\(handler/ },
      { name: 'onDisconnect', pattern: /onDisconnect\(handler/ },
      { name: 'close', pattern: /close\(\):\s*void/ },
      { name: 'connected', pattern: /get\s+connected\(\)/ },
    ];

    for (const { name, pattern } of methods) {
      it(`RealtimeConnection.${name} has TSDoc`, () => {
        expect(hasJSDocBefore(content, pattern)).toBe(true);
      });
    }
  });

  describe('Inbox class (inbox.ts)', () => {
    const content = readFileSync(resolve(SDK_SRC, 'inbox.ts'), 'utf-8');

    it('class Inbox has TSDoc', () => {
      expect(hasJSDocBefore(content, /export\s+class\s+Inbox/)).toBe(true);
    });

    const methods = [
      { name: 'receive', pattern: /async\s+receive\(/ },
      { name: 'getEmail', pattern: /async\s+getEmail\(/ },
      { name: 'waitForEmail', pattern: /async\s+waitForEmail\(/ },
      { name: 'send', pattern: /async\s+send\(/ },
    ];

    for (const { name, pattern } of methods) {
      it(`Inbox.${name} has TSDoc`, () => {
        expect(hasJSDocBefore(content, pattern)).toBe(true);
      });
    }
  });

  describe('Email class (email.ts)', () => {
    const content = readFileSync(resolve(SDK_SRC, 'email.ts'), 'utf-8');

    it('class Email has TSDoc', () => {
      expect(hasJSDocBefore(content, /export\s+class\s+Email/)).toBe(true);
    });

    const members = [
      { name: 'body', pattern: /get\s+body\(\)/ },
      { name: 'isInjectionRisk', pattern: /get\s+isInjectionRisk\(\)/ },
      { name: 'safeBodyForLLM', pattern: /^\s+safeBodyForLLM\(\):\s*string/m },
      { name: 'fetchFullBody', pattern: /async\s+fetchFullBody\(\)/ },
    ];

    for (const { name, pattern } of members) {
      it(`Email.${name} has TSDoc`, () => {
        expect(hasJSDocBefore(content, pattern)).toBe(true);
      });
    }
  });

  describe('Error classes (errors.ts)', () => {
    const content = readFileSync(resolve(SDK_SRC, 'errors.ts'), 'utf-8');

    const errorClasses = [
      'LobsterMailError',
      'AuthenticationError',
      'InsufficientTierError',
      'NotFoundError',
      'RateLimitError',
      'AddressCollisionError',
    ];

    for (const className of errorClasses) {
      it(`${className} has TSDoc`, () => {
        const pattern = new RegExp(`export\\s+class\\s+${className}`);
        expect(hasJSDocBefore(content, pattern)).toBe(true);
      });
    }
  });
});
