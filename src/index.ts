/**
 * LobsterMail - Email infrastructure for autonomous AI agents.
 *
 * Your agent creates its own email. Instantly. No human needed.
 *
 * @example
 * ```typescript
 * import { LobsterMail } from '@lobsterkit/lobstermail';
 *
 * const lm = await LobsterMail.create();
 * const inbox = await lm.createInbox();
 * const code = await inbox.waitForEmail({
 *   filter: { from: 'noreply@service.com' },
 *   timeout: 60000,
 * });
 * console.log(code?.safeBodyForLLM());
 * ```
 *
 * @see https://lobstermail.ai
 */

export { LobsterMail } from './client.js';
export type { LobsterMailConfig, AccountInfo, SmartInboxOptions } from './client.js';

export { Inbox } from './inbox.js';
export type { InboxData, ReceiveOptions, ReceiveResult, WaitForEmailOptions, SendOptions } from './inbox.js';

export { Domain } from './domain.js';
export type { DomainData, DomainStatus, DnsRecord, DnsRecordType } from './domain.js';

export { Email } from './email.js';
export type { EmailData, EmailSecurity, AttachmentData } from './email.js';

export {
  LobsterMailError,
  AuthenticationError,
  InsufficientTierError,
  NotFoundError,
  RateLimitError,
  AddressCollisionError,
} from './errors.js';

export { buildSafeBodyForLLM } from './safety.js';
export type { SafeBodyOptions } from './safety.js';

export { generateVariations, sanitizeLocalPart, isValidLocalPart } from './naming.js';
export type { VariationInput } from './naming.js';

export { RealtimeConnection } from './realtime.js';
export type {
  RealtimeOptions,
  EmailEventHandler,
  ErrorHandler,
  ConnectionHandler,
} from './realtime.js';

export const VERSION = '0.0.1';
