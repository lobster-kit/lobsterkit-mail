import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock WebSocket ---

type WsEventHandler = (...args: any[]) => void;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: WsEventHandler | null = null;
  onmessage: WsEventHandler | null = null;
  onclose: WsEventHandler | null = null;
  onerror: WsEventHandler | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Auto-fire onopen async (like a real WS)
    setTimeout(() => {
      this.onopen?.({} as Event);
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' } as CloseEvent);
  }

  // Test helper: simulate receiving a server message
  _receive(msg: any) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this.onmessage?.({ data } as MessageEvent);
  }
}

// Track all created MockWebSocket instances
let mockWsInstances: MockWebSocket[] = [];
const OriginalMockWebSocket = MockWebSocket;

// Mock globalThis.WebSocket
vi.stubGlobal('WebSocket', class extends OriginalMockWebSocket {
  constructor(url: string) {
    super(url);
    mockWsInstances.push(this);
  }
});

// Also set OPEN on globalThis.WebSocket for readyState checks
(globalThis as any).WebSocket.OPEN = MockWebSocket.OPEN;

import { RealtimeConnection } from '../realtime.js';
import type { RealtimeOptions } from '../realtime.js';
import { HttpClient } from '../http.js';

function createConnection(opts?: RealtimeOptions): RealtimeConnection {
  const http = new HttpClient({ baseUrl: 'http://localhost:4801' });
  return new RealtimeConnection(
    'ws://localhost:4801',
    'lm_sk_test_mock',
    http,
    opts,
  );
}

function getLastWs(): MockWebSocket {
  return mockWsInstances[mockWsInstances.length - 1];
}

/** Connect and authenticate in one step */
async function connectAndAuth(opts?: RealtimeOptions): Promise<{ conn: RealtimeConnection; ws: MockWebSocket }> {
  const conn = createConnection(opts);
  const connectPromise = conn.connect();

  // Wait for the mock WS to be created
  await vi.waitFor(() => expect(mockWsInstances.length).toBeGreaterThan(0));

  const ws = getLastWs();

  // Simulate the server sending authenticated after onopen fires
  await vi.waitFor(() => expect(ws.onmessage).not.toBeNull());
  ws._receive({ type: 'authenticated', account_id: 'acct_test123' });

  await connectPromise;
  return { conn, ws };
}

describe('RealtimeConnection', () => {
  beforeEach(() => {
    mockWsInstances = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Close any open connections
    for (const ws of mockWsInstances) {
      if (ws.readyState === MockWebSocket.OPEN) {
        ws.readyState = MockWebSocket.CLOSED;
      }
    }
  });

  describe('URL derivation', () => {
    it('constructs correct WebSocket URL with token', async () => {
      const conn = createConnection();
      const connectPromise = conn.connect();

      await vi.waitFor(() => expect(mockWsInstances.length).toBe(1));
      const ws = getLastWs();

      expect(ws.url).toBe('ws://localhost:4801/v1/ws?token=lm_sk_test_mock');

      ws._receive({ type: 'authenticated', account_id: 'acct_test' });
      await connectPromise;
    });
  });

  describe('connect()', () => {
    it('resolves after receiving authenticated message', async () => {
      const { conn } = await connectAndAuth();
      expect(conn.connected).toBe(true);
    });

    it('rejects on WebSocket error', async () => {
      const conn = createConnection();
      const connectPromise = conn.connect();

      await vi.waitFor(() => expect(mockWsInstances.length).toBe(1));
      const ws = getLastWs();

      ws.onerror?.({} as Event);

      await expect(connectPromise).rejects.toThrow('WebSocket error');
    });

    it('throws if connection has been permanently closed', async () => {
      const { conn } = await connectAndAuth();
      conn.close();

      await expect(conn.connect()).rejects.toThrow('permanently closed');
    });
  });

  describe('subscribe()', () => {
    it('sends subscribe message when connected', async () => {
      const { conn, ws } = await connectAndAuth();

      conn.subscribe('ibx_test1', () => {});

      expect(ws.sent.length).toBe(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg.type).toBe('subscribe');
      expect(msg.inbox_ids).toEqual(['ibx_test1']);
    });

    it('queues subscription before connection is authenticated', async () => {
      const conn = createConnection();
      const connectPromise = conn.connect();

      // Subscribe before auth completes
      const handler = vi.fn();
      conn.subscribe('ibx_queued', handler);

      await vi.waitFor(() => expect(mockWsInstances.length).toBe(1));
      const ws = getLastWs();

      // No message sent yet — still waiting for auth
      expect(ws.sent.length).toBe(0);

      // Authenticate
      ws._receive({ type: 'authenticated', account_id: 'acct_test' });
      await connectPromise;

      // Now the queued subscription should be flushed
      expect(ws.sent.length).toBe(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg.type).toBe('subscribe');
      expect(msg.inbox_ids).toContain('ibx_queued');
    });

    it('returns an unsubscribe function', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler = vi.fn();
      const unsubscribe = conn.subscribe('ibx_test2', handler);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();

      // Should send unsubscribe message
      const unsubMsg = ws.sent.find((s) => {
        const m = JSON.parse(s);
        return m.type === 'unsubscribe';
      });
      expect(unsubMsg).toBeDefined();
      const parsed = JSON.parse(unsubMsg!);
      expect(parsed.inbox_ids).toEqual(['ibx_test2']);
    });

    it('does not send unsubscribe if other handlers remain', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = conn.subscribe('ibx_shared', handler1);
      conn.subscribe('ibx_shared', handler2);

      // Clear sent messages from subscribe
      ws.sent = [];

      unsub1();

      // Should NOT send unsubscribe since handler2 is still listening
      const unsubMsgs = ws.sent.filter((s) => JSON.parse(s).type === 'unsubscribe');
      expect(unsubMsgs.length).toBe(0);
    });
  });

  describe('event handling', () => {
    it('fires inbox-specific handler on email.received', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler = vi.fn();
      conn.subscribe('ibx_evt1', handler);

      ws._receive({
        type: 'event',
        event_type: 'email.received',
        inbox_id: 'ibx_evt1',
        timestamp: new Date().toISOString(),
        data: {
          id: 'eml_test1',
          inboxId: 'ibx_evt1',
          direction: 'inbound',
          from: 'sender@test.com',
          to: ['inbox@lobstermail.ai'],
          cc: null,
          subject: 'Test Email',
          preview: 'Hello',
          body: null,
          hasAttachments: false,
          security: { injectionRiskScore: 0, flags: [], spf: null, dkim: null, dmarc: null },
          status: null,
          createdAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
        },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const email = handler.mock.calls[0][0];
      expect(email.id).toBe('eml_test1');
      expect(email.subject).toBe('Test Email');
      expect(email.from).toBe('sender@test.com');
    });

    it('fires global onEmail handler', async () => {
      const { conn, ws } = await connectAndAuth();

      const globalHandler = vi.fn();
      conn.onEmail(globalHandler);
      conn.subscribe('ibx_evt2', () => {});

      ws._receive({
        type: 'event',
        event_type: 'email.received',
        inbox_id: 'ibx_evt2',
        timestamp: new Date().toISOString(),
        data: {
          id: 'eml_test2',
          inboxId: 'ibx_evt2',
          direction: 'inbound',
          from: 'global@test.com',
          to: ['inbox@lobstermail.ai'],
          cc: null,
          subject: 'Global Handler Test',
          preview: null,
          body: null,
          hasAttachments: false,
          security: { injectionRiskScore: 0, flags: [], spf: null, dkim: null, dmarc: null },
          status: null,
          createdAt: new Date().toISOString(),
          receivedAt: null,
        },
      });

      expect(globalHandler).toHaveBeenCalledTimes(1);
      expect(globalHandler.mock.calls[0][0].subject).toBe('Global Handler Test');
    });

    it('fires both inbox-specific and global handlers', async () => {
      const { conn, ws } = await connectAndAuth();

      const inboxHandler = vi.fn();
      const globalHandler = vi.fn();
      conn.subscribe('ibx_both', inboxHandler);
      conn.onEmail(globalHandler);

      ws._receive({
        type: 'event',
        event_type: 'email.received',
        inbox_id: 'ibx_both',
        timestamp: new Date().toISOString(),
        data: {
          id: 'eml_both',
          inboxId: 'ibx_both',
          direction: 'inbound',
          from: 'both@test.com',
          to: ['inbox@lobstermail.ai'],
          cc: null,
          subject: 'Both Handlers',
          preview: null,
          body: null,
          hasAttachments: false,
          security: { injectionRiskScore: 0, flags: [], spf: null, dkim: null, dmarc: null },
          status: null,
          createdAt: new Date().toISOString(),
          receivedAt: null,
        },
      });

      expect(inboxHandler).toHaveBeenCalledTimes(1);
      expect(globalHandler).toHaveBeenCalledTimes(1);
    });

    it('removes global handler when unsubscribe function is called', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler = vi.fn();
      const unsub = conn.onEmail(handler);
      conn.subscribe('ibx_unsub_global', () => {});

      unsub();

      ws._receive({
        type: 'event',
        event_type: 'email.received',
        inbox_id: 'ibx_unsub_global',
        timestamp: new Date().toISOString(),
        data: {
          id: 'eml_unsub',
          inboxId: 'ibx_unsub_global',
          direction: 'inbound',
          from: 'x@test.com',
          to: ['y@lobstermail.ai'],
          cc: null,
          subject: 'After Unsub',
          preview: null,
          body: null,
          hasAttachments: false,
          security: { injectionRiskScore: 0, flags: [], spf: null, dkim: null, dmarc: null },
          status: null,
          createdAt: new Date().toISOString(),
          receivedAt: null,
        },
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('fires onError handler on server error messages', async () => {
      const { conn, ws } = await connectAndAuth();

      const errorHandler = vi.fn();
      conn.onError(errorHandler);

      ws._receive({ type: 'error', code: 'invalid_inbox', message: 'Inbox not found' });

      expect(errorHandler).toHaveBeenCalledTimes(1);
      const err = errorHandler.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('invalid_inbox');
    });

    it('removes error handler via returned function', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler = vi.fn();
      const unsub = conn.onError(handler);
      unsub();

      ws._receive({ type: 'error', code: 'test', message: 'nope' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle handlers', () => {
    it('fires onConnect handler after authentication', async () => {
      const conn = createConnection();
      const connectHandler = vi.fn();
      conn.onConnect(connectHandler);

      const connectPromise = conn.connect();
      await vi.waitFor(() => expect(mockWsInstances.length).toBe(1));
      const ws = getLastWs();

      ws._receive({ type: 'authenticated', account_id: 'acct_test' });
      await connectPromise;

      expect(connectHandler).toHaveBeenCalledTimes(1);
    });

    it('fires onDisconnect handler on close', async () => {
      const { conn, ws } = await connectAndAuth();

      const disconnectHandler = vi.fn();
      conn.onDisconnect(disconnectHandler);

      ws.close(1000, 'normal');

      expect(disconnectHandler).toHaveBeenCalledTimes(1);
    });

    it('removes lifecycle handlers via returned functions', async () => {
      const { conn, ws } = await connectAndAuth();

      const handler = vi.fn();
      const unsub = conn.onDisconnect(handler);
      unsub();

      ws.close(1000, 'normal');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('closes the WebSocket and marks as disconnected', async () => {
      const { conn, ws } = await connectAndAuth();
      expect(conn.connected).toBe(true);

      conn.close();

      expect(conn.connected).toBe(false);
    });

    it('prevents auto-reconnect after close()', async () => {
      const { conn, ws } = await connectAndAuth({ autoReconnect: true });
      conn.close();

      // Advance timers — should NOT create a new WebSocket
      const countBefore = mockWsInstances.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockWsInstances.length).toBe(countBefore);
    });
  });

  describe('auto-reconnect', () => {
    it('reconnects on unexpected close with backoff', async () => {
      const { conn, ws } = await connectAndAuth({
        autoReconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 3,
      });

      // Simulate unexpected close
      ws.onclose?.({ code: 1006, reason: 'abnormal' } as CloseEvent);

      // Wait for first reconnect attempt (100ms delay)
      await vi.advanceTimersByTimeAsync(150);

      // A new WebSocket should have been created
      expect(mockWsInstances.length).toBe(2);
    });

    it('does not reconnect when autoReconnect is false', async () => {
      const { conn, ws } = await connectAndAuth({
        autoReconnect: false,
      });

      ws.onclose?.({ code: 1006, reason: 'abnormal' } as CloseEvent);

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockWsInstances.length).toBe(1);
    });

    it('gives up after maxReconnectAttempts', async () => {
      const errorHandler = vi.fn();
      const { conn, ws } = await connectAndAuth({
        autoReconnect: true,
        reconnectDelay: 50,
        maxReconnectAttempts: 2,
      });
      conn.onError(errorHandler);

      // First close
      ws.onclose?.({ code: 1006, reason: 'abnormal' } as CloseEvent);
      await vi.advanceTimersByTimeAsync(60);
      // Attempt 1: new WS created but fails
      const ws2 = getLastWs();
      ws2.onerror?.({} as Event);
      ws2.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      await vi.advanceTimersByTimeAsync(120);
      // Attempt 2: new WS created but fails
      const ws3 = getLastWs();
      ws3.onerror?.({} as Event);
      ws3.onclose?.({ code: 1006, reason: '' } as CloseEvent);

      await vi.advanceTimersByTimeAsync(500);
      // No more attempts — should fire error handler
      expect(errorHandler).toHaveBeenCalled();
      const lastError = errorHandler.mock.calls.find(
        (c) => c[0].message.includes('Failed to reconnect'),
      );
      expect(lastError).toBeDefined();
    });
  });

  describe('connected property', () => {
    it('returns false before connect', () => {
      const conn = createConnection();
      expect(conn.connected).toBe(false);
    });

    it('returns true after auth', async () => {
      const { conn } = await connectAndAuth();
      expect(conn.connected).toBe(true);
    });

    it('returns false after close', async () => {
      const { conn } = await connectAndAuth();
      conn.close();
      expect(conn.connected).toBe(false);
    });
  });

  describe('ping/pong handling', () => {
    it('responds to server ping with pong', async () => {
      const { conn, ws } = await connectAndAuth();

      // Clear any messages from subscribe calls
      ws.sent = [];

      ws._receive({ type: 'ping' });

      expect(ws.sent.length).toBe(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg.type).toBe('pong');
    });
  });
});
