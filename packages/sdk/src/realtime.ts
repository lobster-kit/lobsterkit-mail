import { Email } from './email.js';
import type { EmailData } from './email.js';
import type { HttpClient } from './http.js';

export interface RealtimeOptions {
  /** Auto-reconnect on unexpected disconnect. Default: true */
  autoReconnect?: boolean;
  /** Max reconnection attempts before giving up. Default: 10 */
  maxReconnectAttempts?: number;
  /** Base delay for reconnect backoff in ms. Default: 1000 */
  reconnectDelay?: number;
}

export type EmailEventHandler = (email: Email) => void;
export type ErrorHandler = (error: Error) => void;
export type ConnectionHandler = () => void;

type PendingSubscription = { inboxId: string };

/**
 * Manages a WebSocket connection for real-time email notifications.
 *
 * Subscribe to inbox events and receive pushed Email instances
 * instead of polling with `waitForEmail()`.
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
export class RealtimeConnection {
  private _ws: WebSocket | null = null;
  private _wsUrl: string;
  private _token: string;
  private _http: HttpClient;
  private _options: Required<RealtimeOptions>;

  private _subscriptions: Map<string, Set<EmailEventHandler>> = new Map();
  private _globalHandlers: Set<EmailEventHandler> = new Set();
  private _errorHandlers: Set<ErrorHandler> = new Set();
  private _connectHandlers: Set<ConnectionHandler> = new Set();
  private _disconnectHandlers: Set<ConnectionHandler> = new Set();

  private _pendingSubscriptions: PendingSubscription[] = [];
  private _reconnectAttempt = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _closed = false;
  private _authenticated = false;
  private _requestCounter = 0;

  constructor(wsUrl: string, token: string, http: HttpClient, options?: RealtimeOptions) {
    this._wsUrl = wsUrl;
    this._token = token;
    this._http = http;
    this._options = {
      autoReconnect: options?.autoReconnect ?? true,
      maxReconnectAttempts: options?.maxReconnectAttempts ?? 10,
      reconnectDelay: options?.reconnectDelay ?? 1000,
    };
  }

  /** Open the WebSocket connection. Resolves when authenticated. */
  async connect(): Promise<void> {
    if (this._closed) {
      throw new Error('Connection has been permanently closed. Create a new RealtimeConnection.');
    }

    const WS = await resolveWebSocket();
    const url = `${this._wsUrl}/v1/ws?token=${encodeURIComponent(this._token)}`;

    return new Promise<void>((resolve, reject) => {
      const ws = new WS(url);
      this._ws = ws as unknown as WebSocket;

      ws.onopen = () => {
        // Wait for authenticated message before resolving
      };

      ws.onmessage = (evt: MessageEvent) => {
        this._handleMessage(evt, resolve);
      };

      ws.onerror = (evt: Event) => {
        const error = new Error('WebSocket error');
        this._errorHandlers.forEach((h) => h(error));
        reject(error);
      };

      ws.onclose = (evt: CloseEvent) => {
        this._authenticated = false;
        this._disconnectHandlers.forEach((h) => h());

        if (!this._closed && this._options.autoReconnect) {
          this._scheduleReconnect();
        }
      };
    });
  }

  /**
   * Subscribe to email events for a specific inbox.
   * Returns an unsubscribe function.
   */
  subscribe(inboxId: string, handler: EmailEventHandler): () => void {
    if (!this._subscriptions.has(inboxId)) {
      this._subscriptions.set(inboxId, new Set());
    }
    this._subscriptions.get(inboxId)!.add(handler);

    // Send subscribe message if connected, otherwise queue
    if (this._authenticated && this._ws?.readyState === WebSocket.OPEN) {
      this._sendSubscribe([inboxId]);
    } else {
      this._pendingSubscriptions.push({ inboxId });
    }

    return () => {
      const handlers = this._subscriptions.get(inboxId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this._subscriptions.delete(inboxId);
          // Send unsubscribe if connected
          if (this._authenticated && this._ws?.readyState === WebSocket.OPEN) {
            this._sendUnsubscribe([inboxId]);
          }
        }
      }
    };
  }

  /** Listen to email events from all subscribed inboxes. */
  onEmail(handler: EmailEventHandler): () => void {
    this._globalHandlers.add(handler);
    return () => {
      this._globalHandlers.delete(handler);
    };
  }

  /** Listen for connection errors. */
  onError(handler: ErrorHandler): () => void {
    this._errorHandlers.add(handler);
    return () => {
      this._errorHandlers.delete(handler);
    };
  }

  /** Listen for successful connection events. */
  onConnect(handler: ConnectionHandler): () => void {
    this._connectHandlers.add(handler);
    return () => {
      this._connectHandlers.delete(handler);
    };
  }

  /** Listen for disconnection events. */
  onDisconnect(handler: ConnectionHandler): () => void {
    this._disconnectHandlers.add(handler);
    return () => {
      this._disconnectHandlers.delete(handler);
    };
  }

  /** Close the connection permanently (no auto-reconnect). */
  close(): void {
    this._closed = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._ws) {
      this._ws.close(1000, 'Client closed');
      this._ws = null;
    }

    this._authenticated = false;
  }

  /** Whether the connection is currently open and authenticated. */
  get connected(): boolean {
    return this._authenticated && this._ws?.readyState === WebSocket.OPEN;
  }

  // --- Private ---

  private _handleMessage(evt: MessageEvent, connectResolve?: (value: void) => void): void {
    let msg: any;
    try {
      const raw = typeof evt.data === 'string' ? evt.data : evt.data.toString();
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'authenticated':
        this._authenticated = true;
        this._reconnectAttempt = 0;
        this._connectHandlers.forEach((h) => h());
        this._flushPendingSubscriptions();
        connectResolve?.();
        break;

      case 'event':
        if (msg.event_type === 'email.received' && msg.data) {
          const email = new Email(msg.data as EmailData, this._http);
          const inboxId = msg.inbox_id;

          // Fire inbox-specific handlers
          const handlers = this._subscriptions.get(inboxId);
          if (handlers) {
            handlers.forEach((h) => h(email));
          }

          // Fire global handlers
          this._globalHandlers.forEach((h) => h(email));
        }
        break;

      case 'pong':
        // Server responded to our ping — connection is alive
        break;

      case 'ping':
        // Server heartbeat — respond with pong
        this._sendRaw({ type: 'pong' });
        break;

      case 'error':
        this._errorHandlers.forEach((h) =>
          h(new Error(`[${msg.code}] ${msg.message}`)),
        );
        break;
    }
  }

  private _flushPendingSubscriptions(): void {
    // Collect all inbox IDs that need subscribing
    const allInboxIds = new Set<string>();

    // Re-subscribe to all active subscriptions (for reconnect)
    for (const inboxId of this._subscriptions.keys()) {
      allInboxIds.add(inboxId);
    }

    // Add any pending subscriptions queued before connect
    for (const pending of this._pendingSubscriptions) {
      allInboxIds.add(pending.inboxId);
    }
    this._pendingSubscriptions = [];

    if (allInboxIds.size > 0) {
      this._sendSubscribe([...allInboxIds]);
    }
  }

  private _sendSubscribe(inboxIds: string[]): void {
    this._sendRaw({
      type: 'subscribe',
      id: `req_${++this._requestCounter}`,
      inbox_ids: inboxIds,
    });
  }

  private _sendUnsubscribe(inboxIds: string[]): void {
    this._sendRaw({
      type: 'unsubscribe',
      id: `req_${++this._requestCounter}`,
      inbox_ids: inboxIds,
    });
  }

  private _sendRaw(msg: any): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  private _scheduleReconnect(): void {
    if (this._closed) return;
    if (this._reconnectAttempt >= this._options.maxReconnectAttempts) {
      this._errorHandlers.forEach((h) =>
        h(new Error(`Failed to reconnect after ${this._options.maxReconnectAttempts} attempts`)),
      );
      return;
    }

    const delay = Math.min(
      this._options.reconnectDelay * Math.pow(2, this._reconnectAttempt),
      30_000,
    );
    this._reconnectAttempt++;

    this._reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        this._errorHandlers.forEach((h) => h(err));
      });
    }, delay);
  }
}

/**
 * Resolve a WebSocket constructor.
 * Uses globalThis.WebSocket (Node 21+, browsers).
 * Falls back to `ws` package for Node 18-20.
 */
async function resolveWebSocket(): Promise<typeof WebSocket> {
  if (typeof globalThis.WebSocket !== 'undefined') {
    return globalThis.WebSocket;
  }

  try {
    const ws = await import('ws');
    return ws.default as unknown as typeof WebSocket;
  } catch {
    throw new Error(
      'WebSocket not available. On Node 18-20, install the "ws" package: npm install ws',
    );
  }
}
