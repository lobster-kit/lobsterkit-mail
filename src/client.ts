import { HttpClient } from './http.js';
import { resolveToken, saveToken } from './storage.js';
import { Inbox } from './inbox.js';
import type { InboxData } from './inbox.js';
import { Domain } from './domain.js';
import type { DomainData } from './domain.js';
import { AddressCollisionError } from './errors.js';
import { generateVariations, sanitizeLocalPart, isValidLocalPart } from './naming.js';
import { RealtimeConnection } from './realtime.js';
import type { RealtimeOptions } from './realtime.js';

const DEFAULT_BASE_URL = 'https://api.lobstermail.ai';

export interface SmartInboxOptions {
  /** Explicit local parts to try first, in order. Each is sanitized and validated before use. */
  preferred?: string[];
  /** Agent name or identity — the SDK generates variations (e.g. "Sarah Shield" → sarah-shield, sarah-shield-palisade, s-shield, sarah-shield1, ...) */
  name?: string;
  /** Organization or company name — used as a differentiator when the base name is taken. */
  org?: string;
  /** Display name for the inbox. Passed to all creation attempts. */
  displayName?: string;
}

export interface LobsterMailConfig {
  /** API token. If not provided, resolved from env/file or auto-signup. */
  token?: string;
  /** API base URL. Defaults to https://api.lobstermail.ai */
  baseUrl?: string;
  /** Disable auto-signup when no token is found. Default: true (auto-signup enabled). */
  autoSignup?: boolean;
  /** Disable saving token to ~/.lobstermail/token. Default: true (save enabled). */
  persistToken?: boolean;
}

export interface AccountInfo {
  id: string;
  tier: number;
  tierName: string;
  limits: {
    maxInboxes: number | null;
    dailyEmailLimit: number;
    canSend: boolean;
  };
  usage: {
    inboxCount: number;
    totalEmailsReceived: number;
  };
  xVerificationPending: boolean;
  createdAt: string;
  lastActiveAt: string;
}

/**
 * LobsterMail client — the main entry point for the SDK.
 *
 * Handles auto-signup, token management, and provides methods
 * for managing inboxes, webhooks, and account settings.
 *
 * @example
 * ```typescript
 * const lm = await LobsterMail.create();
 * const inbox = await lm.createInbox();
 * const emails = await inbox.receive();
 * ```
 */
export class LobsterMail {
  private _http: HttpClient;
  private _token: string;
  private _realtime: RealtimeConnection | null = null;

  private constructor(http: HttpClient, token: string) {
    this._http = http;
    this._token = token;
  }

  /**
   * Create a LobsterMail client.
   *
   * Token resolution order:
   * 1. config.token (explicit)
   * 2. LOBSTERMAIL_TOKEN env var
   * 3. ~/.lobstermail/token file
   * 4. Auto-signup via POST /v1/signup (unless autoSignup is false)
   *
   * After auto-signup, the token is persisted to ~/.lobstermail/token.
   *
   * @example
   * ```typescript
   * const lm = await LobsterMail.create();
   * const inbox = await lm.createInbox();
   * const emails = await inbox.receive();
   * ```
   */
  static async create(config?: LobsterMailConfig): Promise<LobsterMail> {
    const baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;
    const autoSignup = config?.autoSignup !== false;
    const persistToken = config?.persistToken !== false;

    const http = new HttpClient({ baseUrl });

    // Try to resolve existing token
    let token = await resolveToken(config?.token);

    if (!token) {
      if (!autoSignup) {
        throw new Error(
          'No LobsterMail token found. Provide a token via config, LOBSTERMAIL_TOKEN env var, or ~/.lobstermail/token.',
        );
      }

      // Auto-signup
      const response = await http.post<{ id: string; token: string }>('/v1/signup');
      token = response.token;

      if (persistToken) {
        await saveToken(token);
      }
    }

    http.setToken(token);
    return new LobsterMail(http, token);
  }

  /** The API token in use. */
  get token(): string {
    return this._token;
  }

  /**
   * Get account information including tier, limits, and usage.
   *
   * @returns Account details with current tier, rate limits, and usage stats
   *
   * @example
   * ```typescript
   * const account = await lm.getAccount();
   * console.log(account.tierName); // 'anonymous' | 'free_verified' | 'builder' | 'pro' | 'scale'
   * console.log(account.limits.canSend); // false for Tier 0
   * ```
   */
  async getAccount(): Promise<AccountInfo> {
    return this._http.get<AccountInfo>('/v1/account');
  }

  /**
   * Create a new inbox.
   * By default generates a unique `lobster-xxxx@lobstermail.ai` address.
   * Optionally provide a custom `localPart` and/or `domain` (requires a verified custom domain).
   *
   * @example
   * ```typescript
   * const inbox = await lm.createInbox(); // lobster-7f3k@lobstermail.ai
   * const custom = await lm.createInbox({ localPart: 'billing-bot' }); // billing-bot@lobstermail.ai
   * const onDomain = await lm.createInbox({ localPart: 'agent', domain: 'yourdomain.com' }); // agent@yourdomain.com
   * ```
   */
  async createInbox(opts?: { displayName?: string; localPart?: string; domain?: string }): Promise<Inbox> {
    const data = await this._http.post<InboxData>('/v1/inboxes', opts ?? {});
    return new Inbox(data, this._http);
  }

  /**
   * Create an inbox with an intelligent naming strategy.
   *
   * Tries a series of candidate addresses derived from the agent's identity,
   * absorbing address collisions silently and falling back to a random
   * `lobster-xxxx` address only if every candidate is taken.
   *
   * Dots are cosmetic in LobsterMail (Gmail-style) — `sarah.shield` and
   * `sarahshield` are the same mailbox. The SDK does not generate dot-only
   * variations, since they would collide with the dotless form.
   *
   * Resolution order:
   * 1. Each entry in `preferred[]` (sanitized and validated)
   * 2. Variations generated from `name` + `org` (e.g. sarah-shield, sarah-shield-palisade, s-shield)
   * 3. Numbered fallbacks (e.g. sarah-shield1, sarah-shield2, ...)
   * 4. Server-generated random address (final fallback — never fails on collision)
   *
   * @param opts - Smart naming options
   * @returns The created inbox
   *
   * @example
   * ```typescript
   * // Identity-based: tries sarah-shield, sarah-shield-palisade, s-shield, sarah-shield1..5
   * const inbox = await lm.createSmartInbox({ name: 'Sarah Shield', org: 'Palisade' });
   *
   * // Explicit preferences: tries billing-bot first, then billing, then random
   * const inbox = await lm.createSmartInbox({ preferred: ['billing-bot', 'billing'] });
   *
   * // Combined: tries preferred first, then name-derived variations, then random
   * const inbox = await lm.createSmartInbox({
   *   preferred: ['mia'],
   *   name: 'Mia',
   *   org: 'Acme',
   *   displayName: 'Mia from Acme',
   * });
   * ```
   */
  async createSmartInbox(opts?: SmartInboxOptions): Promise<Inbox> {
    if (!opts) {
      return this.createInbox();
    }

    const { preferred, name, org, displayName } = opts;

    // Build ordered candidate list: preferred first, then name-derived variations
    const candidates: string[] = [];
    const seen = new Set<string>();

    // Add preferred names (sanitized + validated)
    if (preferred) {
      for (const raw of preferred) {
        const sanitized = sanitizeLocalPart(raw);
        if (sanitized && !seen.has(sanitized) && isValidLocalPart(sanitized)) {
          seen.add(sanitized);
          candidates.push(sanitized);
        }
      }
    }

    // Add name-derived variations (already sanitized, validated, and deduplicated)
    const variations = generateVariations({ name, org });
    for (const v of variations) {
      if (!seen.has(v)) {
        seen.add(v);
        candidates.push(v);
      }
    }

    // Try each candidate, absorbing collisions
    for (const localPart of candidates) {
      try {
        const data = await this._http.post<InboxData>('/v1/inboxes', {
          localPart,
          ...(displayName ? { displayName } : {}),
        });
        return new Inbox(data, this._http);
      } catch (err) {
        if (err instanceof AddressCollisionError) {
          // Address taken — try the next candidate
          continue;
        }
        // Any other error (auth, rate limit, tier limit) — propagate immediately
        throw err;
      }
    }

    // All candidates exhausted — fall back to server-generated random address
    return this.createInbox({ displayName });
  }

  /**
   * Get an existing inbox by ID.
   *
   * @param id - The inbox ID (e.g. `ibx_...`)
   * @returns The inbox instance
   * @throws {@link NotFoundError} if the inbox does not exist
   */
  async getInbox(id: string): Promise<Inbox> {
    const data = await this._http.get<InboxData>(`/v1/inboxes/${id}`);
    return new Inbox(data, this._http);
  }

  /**
   * List all active inboxes for this account.
   *
   * @returns Array of inbox instances
   */
  async listInboxes(): Promise<Inbox[]> {
    const res = await this._http.get<{ data: InboxData[] }>('/v1/inboxes');
    return res.data.map((d) => new Inbox(d, this._http));
  }

  /**
   * Soft-delete an inbox. The inbox enters a 7-day grace period before permanent deletion.
   *
   * @param id - The inbox ID to delete
   * @throws {@link NotFoundError} if the inbox does not exist
   */
  async deleteInbox(id: string): Promise<void> {
    await this._http.delete(`/v1/inboxes/${id}`);
  }

  /**
   * Register a webhook to receive real-time email notifications.
   *
   * @param opts - Webhook configuration
   * @param opts.url - HTTPS endpoint URL to receive webhook payloads
   * @param opts.inboxId - Scope to a specific inbox (omit for account-level)
   * @param opts.events - Event types to subscribe to (default: `['email.received']`)
   * @returns The created webhook with its HMAC signing secret
   *
   * @example
   * ```typescript
   * const wh = await lm.createWebhook({ url: 'https://example.com/hook' });
   * console.log(wh.secret); // Store this for signature verification
   * ```
   */
  async createWebhook(opts: {
    url: string;
    inboxId?: string;
    events?: string[];
  }): Promise<{
    id: string;
    url: string;
    secret: string;
    events: string[];
  }> {
    return this._http.post('/v1/webhooks', opts);
  }

  /**
   * List all webhooks for this account.
   *
   * @returns Object containing an array of webhook data
   */
  async listWebhooks(): Promise<{ data: any[] }> {
    return this._http.get('/v1/webhooks');
  }

  /**
   * Delete a webhook.
   *
   * @param id - The webhook ID to delete
   * @throws {@link NotFoundError} if the webhook does not exist
   */
  async deleteWebhook(id: string): Promise<void> {
    await this._http.delete(`/v1/webhooks/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Account verification
  // ---------------------------------------------------------------------------

  /**
   * Start account verification to unlock sending (Tier 1+).
   *
   * @param opts - Verification options
   * @param opts.provider - Verification provider (currently `'x'` for X/Twitter)
   * @param opts.handle - Your handle on the provider (e.g. your X username)
   * @returns Status and optional instructions to complete verification
   *
   * @example
   * ```typescript
   * const result = await lm.verify({ provider: 'x', handle: 'your_x_handle' });
   * ```
   */
  async verify(opts: {
    provider: string;
    handle: string;
  }): Promise<{ status: string; instructions?: string }> {
    return this._http.post(`/v1/verify/${encodeURIComponent(opts.provider)}`, {
      handle: opts.handle,
    });
  }

  // ---------------------------------------------------------------------------
  // Custom domains
  // ---------------------------------------------------------------------------

  /**
   * Register a custom domain for agent email addresses.
   * Requires **Tier 2 (Builder)** or above.
   *
   * The returned {@link Domain} includes `dnsRecords` — an array of DNS records
   * (verification TXT, MX, SPF, DKIM, DMARC) to configure at your DNS provider.
   *
   * @param opts - Domain options
   * @param opts.domain - The domain name to register (e.g. `yourdomain.com`)
   * @returns Domain instance with DNS records to configure
   *
   * @example
   * ```typescript
   * const domain = await lm.addDomain({ domain: 'yourdomain.com' });
   * console.log(domain.dnsRecords); // 5 DNS records to configure
   * ```
   */
  async addDomain(opts: { domain: string }): Promise<Domain> {
    const data = await this._http.post<DomainData>('/v1/domains', opts);
    return new Domain(data, this._http);
  }

  /**
   * Get a custom domain by ID.
   *
   * @param id - The domain ID (e.g. `dom_...`)
   * @throws {@link NotFoundError} if the domain does not exist
   */
  async getDomain(id: string): Promise<Domain> {
    const data = await this._http.get<DomainData>(`/v1/domains/${id}`);
    return new Domain(data, this._http);
  }

  /**
   * List all custom domains for this account.
   */
  async listDomains(): Promise<Domain[]> {
    const res = await this._http.get<{ data: DomainData[] }>('/v1/domains');
    return res.data.map((d) => new Domain(d, this._http));
  }

  /**
   * Trigger re-verification of a custom domain's DNS records.
   *
   * @param id - The domain ID (e.g. `dom_...`)
   * @returns Updated domain with current verification status
   */
  async verifyDomain(id: string): Promise<Domain> {
    const data = await this._http.post<DomainData>(`/v1/domains/${id}/verify`);
    return new Domain(data, this._http);
  }

  /**
   * Delete a custom domain.
   *
   * @param id - The domain ID to delete
   * @throws {@link NotFoundError} if the domain does not exist
   */
  async deleteDomain(id: string): Promise<void> {
    await this._http.delete(`/v1/domains/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Real-time
  // ---------------------------------------------------------------------------

  /**
   * Open a WebSocket connection for real-time email notifications.
   *
   * Returns a {@link RealtimeConnection} that you can subscribe to
   * inbox events on. If a connection is already open and authenticated,
   * the existing one is returned.
   *
   * @param options - Reconnection and heartbeat options
   * @returns A connected RealtimeConnection instance
   *
   * @example
   * ```typescript
   * const lm = await LobsterMail.create();
   * const rt = await lm.connect();
   * const inbox = await lm.createInbox();
   *
   * rt.subscribe(inbox.id, (email) => {
   *   console.log('New email:', email.subject);
   *   console.log(email.safeBodyForLLM());
   * });
   * ```
   */
  async connect(options?: RealtimeOptions): Promise<RealtimeConnection> {
    if (this._realtime?.connected) return this._realtime;

    const wsUrl = this._http.getBaseUrl().replace(/^http/, 'ws');
    this._realtime = new RealtimeConnection(wsUrl, this._token, this._http, options);
    await this._realtime.connect();
    return this._realtime;
  }
}
