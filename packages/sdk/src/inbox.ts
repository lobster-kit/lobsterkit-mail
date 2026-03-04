import { Email } from './email.js';
import type { EmailData } from './email.js';
import type { HttpClient } from './http.js';

export interface InboxData {
  id: string;
  address: string;
  displayName: string | null;
  domain: string;
  isActive: boolean;
  emailCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReceiveOptions {
  limit?: number;
  since?: string;
  direction?: 'inbound' | 'outbound';
}

export interface WaitForEmailOptions {
  filter?: {
    from?: string;
    subject?: string | RegExp;
  };
  timeout?: number; // ms, default 60000
  pollInterval?: number; // ms, default 2000
  since?: string;
  /**
   * Use server-side long-polling for near-instant delivery.
   * The server holds the request open and returns immediately when an email arrives.
   * Falls back to regular polling if the server doesn't support it.
   * Default: true
   */
  longPoll?: boolean;
}

export interface SendOptions {
  to: string[];
  cc?: string[];
  subject: string;
  body: { text: string; html?: string };
  /** Attachments to include. Each `content` must be base64-encoded. Max 10 attachments. */
  attachments?: Array<{
    filename: string;
    contentType: string;
    content: string; // base64-encoded
  }>;
}

/**
 * Represents an email inbox. Provides methods to receive, send,
 * and wait for emails.
 *
 * @example
 * ```typescript
 * const inbox = await lm.createInbox();
 * const emails = await inbox.receive();
 * const email = await inbox.waitForEmail({ filter: { from: 'noreply@service.com' } });
 * ```
 */
export class Inbox {
  /** Unique inbox identifier (e.g. `ibx_...`). */
  readonly id: string;
  /** Full email address (e.g. `lobster-xxxx@lobstermail.ai`). */
  readonly address: string;
  /** Optional display name for the inbox. */
  readonly displayName: string | null;
  /** Domain portion of the address. */
  readonly domain: string;
  /** Whether the inbox is active (not deleted). */
  readonly isActive: boolean;
  /** Number of emails received. */
  readonly emailCount: number;
  /** Expiration timestamp for Tier 0 inboxes, null for paid tiers. */
  readonly expiresAt: string | null;
  /** When the inbox was created. */
  readonly createdAt: string;

  private _http: HttpClient;

  constructor(data: InboxData, http: HttpClient) {
    this.id = data.id;
    this.address = data.address;
    this.displayName = data.displayName;
    this.domain = data.domain;
    this.isActive = data.isActive;
    this.emailCount = data.emailCount;
    this.expiresAt = data.expiresAt;
    this.createdAt = data.createdAt;
    this._http = http;
  }

  /**
   * Poll for emails in this inbox.
   *
   * @param opts - Filtering and pagination options
   * @param opts.limit - Max number of emails to return (default: 20)
   * @param opts.since - Only return emails after this ISO 8601 timestamp
   * @param opts.direction - Filter by `'inbound'` or `'outbound'`
   * @returns Array of email instances (newest first)
   *
   * @example
   * ```typescript
   * const recent = await inbox.receive({ since: '2026-02-17T00:00:00Z', limit: 10 });
   * ```
   */
  async receive(opts?: ReceiveOptions): Promise<Email[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', opts.limit.toString());
    if (opts?.since) params.set('since', opts.since);
    if (opts?.direction) params.set('direction', opts.direction);

    const qs = params.toString();
    const path = `/v1/inboxes/${this.id}/emails${qs ? `?${qs}` : ''}`;

    const res = await this._http.get<{ data: EmailData[] }>(path);
    return res.data.map((d) => new Email(d, this._http));
  }

  /**
   * Get a single email by ID with full body.
   *
   * @param emailId - The email ID (e.g. `eml_...`)
   * @returns Email instance with body populated
   * @throws {@link NotFoundError} if the email does not exist in this inbox
   */
  async getEmail(emailId: string): Promise<Email> {
    const data = await this._http.get<EmailData>(
      `/v1/inboxes/${this.id}/emails/${emailId}`,
    );
    return new Email(data, this._http);
  }

  /**
   * Wait for an email matching the given filter.
   *
   * By default, uses **server-side long-polling** for near-instant delivery:
   * the server holds the connection open and returns within ~200ms of the email
   * arriving. Falls back to client-side polling with exponential backoff if
   * the server doesn't support long-polling (e.g. older API versions).
   *
   * @param opts - Filter and timing options
   * @param opts.filter - Match by sender (`from`) or subject (string or RegExp)
   * @param opts.timeout - Max wait time in ms (default: 60000)
   * @param opts.pollInterval - Base polling interval in ms (default: 2000, only used in fallback mode)
   * @param opts.since - Only consider emails after this timestamp
   * @param opts.longPoll - Use server-side long-polling (default: true)
   * @returns The matching email with full body loaded, or null if timeout is reached
   *
   * @example
   * ```typescript
   * const email = await inbox.waitForEmail({
   *   filter: { from: 'noreply@service.com', subject: /verification/i },
   *   timeout: 30000,
   * });
   * ```
   */
  async waitForEmail(opts?: WaitForEmailOptions): Promise<Email | null> {
    const timeout = opts?.timeout ?? 60_000;
    const useLongPoll = opts?.longPoll !== false;
    const startTime = Date.now();
    const since = opts?.since ?? new Date(startTime - 1000).toISOString();

    if (useLongPoll) {
      const result = await this._waitLongPoll(opts, timeout, startTime, since);
      if (result !== undefined) return result;
      // If _waitLongPoll returns undefined, the server doesn't support it — fall through to classic polling
    }

    return this._waitClassicPoll(opts, timeout, startTime, since);
  }

  /**
   * Long-poll mode: server holds request open, returns instantly when email arrives.
   * Each request blocks for up to 25s server-side.
   * Returns Email | null on success, or undefined if server doesn't support long-poll.
   */
  private async _waitLongPoll(
    opts: WaitForEmailOptions | undefined,
    timeout: number,
    startTime: number,
    since: string,
  ): Promise<Email | null | undefined> {
    const POLL_WINDOW = 25; // seconds — matches server MAX_POLL_TIMEOUT

    while (Date.now() - startTime < timeout) {
      const remaining = timeout - (Date.now() - startTime);
      const serverTimeout = Math.min(POLL_WINDOW, Math.ceil(remaining / 1000));

      if (serverTimeout <= 0) break;

      // Build query string with server-side filters
      const params = new URLSearchParams();
      params.set('timeout', serverTimeout.toString());
      params.set('since', since);

      // Pass simple string filters to the server for server-side matching
      if (opts?.filter?.from) {
        params.set('from', opts.filter.from);
      }
      if (opts?.filter?.subject && typeof opts.filter.subject === 'string') {
        params.set('subject', opts.filter.subject);
      }

      const path = `/v1/inboxes/${this.id}/emails/poll?${params.toString()}`;

      // Use AbortSignal to enforce client-side timeout (server timeout + 5s buffer)
      const controller = new AbortController();
      const abortTimeout = setTimeout(
        () => controller.abort(),
        (serverTimeout + 5) * 1000,
      );

      try {
        const result = await this._http.requestMaybeEmpty<{
          data: EmailData[];
          source: string;
        }>('GET', path, { signal: controller.signal });

        clearTimeout(abortTimeout);

        if (result && result.data && result.data.length > 0) {
          // Server returned emails — apply client-side RegExp filter if needed
          for (const emailData of result.data) {
            const email = new Email(emailData, this._http);
            if (matchesFilter(email, opts?.filter)) {
              await email.fetchFullBody();
              return email;
            }
          }
          // Server-side filter matched but client-side RegExp didn't — continue polling
        }

        // 204 or no match — loop and try again
      } catch (err: any) {
        clearTimeout(abortTimeout);

        // If the server returned 404, it doesn't support the poll endpoint
        if (err?.statusCode === 404 || err?.name === 'NotFoundError') {
          return undefined; // Signal to fall back to classic polling
        }

        // AbortError means our client timeout fired — just retry
        if (err?.name === 'AbortError') {
          continue;
        }

        // Other errors (auth, rate limit) — propagate
        throw err;
      }
    }

    return null; // Timeout reached
  }

  /**
   * Classic polling mode: exponential backoff (2s, 3s, 4.5s... capped at 10s).
   * Used as fallback when server doesn't support long-polling.
   */
  private async _waitClassicPoll(
    opts: WaitForEmailOptions | undefined,
    timeout: number,
    startTime: number,
    since: string,
  ): Promise<Email | null> {
    const basePollInterval = opts?.pollInterval ?? 2_000;
    let attempt = 0;

    while (Date.now() - startTime < timeout) {
      const emails = await this.receive({ since });

      for (const email of emails) {
        if (matchesFilter(email, opts?.filter)) {
          await email.fetchFullBody();
          return email;
        }
      }

      attempt++;
      const delay = Math.min(basePollInterval * Math.pow(1.5, attempt - 1), 10_000);
      await sleep(delay);
    }

    return null;
  }

  /**
   * Send an email from this inbox. Requires Tier 1+ (verified account).
   *
   * @param opts - Email send options
   * @param opts.to - Recipient addresses (1-50)
   * @param opts.subject - Email subject line
   * @param opts.body - Email body with required `text` and optional `html`
   * @param opts.cc - CC recipients
   * @returns Object with queued email `id` and `status: 'queued'`
   * @throws {@link InsufficientTierError} if account is Tier 0
   *
   * @example
   * ```typescript
   * const result = await inbox.send({
   *   to: ['user@example.com'],
   *   subject: 'Hello from my agent',
   *   body: { text: 'This is a test email.' },
   * });
   * ```
   */
  async send(opts: SendOptions): Promise<{ id: string; status: string }> {
    return this._http.post('/v1/emails/send', {
      from: this.address,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      body: opts.body,
      attachments: opts.attachments,
    });
  }
}

function matchesFilter(email: Email, filter?: WaitForEmailOptions['filter']): boolean {
  if (!filter) return true;

  if (filter.from && email.from !== filter.from) {
    return false;
  }

  if (filter.subject) {
    if (filter.subject instanceof RegExp) {
      if (!filter.subject.test(email.subject)) return false;
    } else {
      if (!email.subject.includes(filter.subject)) return false;
    }
  }

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
