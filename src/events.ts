/**
 * Valid webhook/realtime event types.
 *
 * Pass these to `createWebhook()` to subscribe, or listen via
 * `RealtimeConnection.onEvent()`.
 */
export const WEBHOOK_EVENTS = {
  EMAIL_RECEIVED: 'email.received',
  EMAIL_SENT: 'email.sent',
  EMAIL_BOUNCED: 'email.bounced',
  EMAIL_QUARANTINED: 'email.quarantined',
  EMAIL_SCAN_COMPLETE: 'email.scan.complete',
  EMAIL_THREAD_NEW: 'email.thread.new',
  EMAIL_THREAD_REPLY: 'email.thread.reply',
  INBOX_CREATED: 'inbox.created',
  INBOX_EXPIRED: 'inbox.expired',
} as const;

/** Valid webhook event type string. */
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];
