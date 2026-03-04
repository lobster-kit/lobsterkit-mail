import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressCollisionError, AuthenticationError } from '../errors.js';

// Shared mock http client — returned by every HttpClient constructor
const mockHttp = {
  setToken: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
};

// Mock the storage module to avoid filesystem operations
vi.mock('../storage.js', () => ({
  resolveToken: vi.fn().mockResolvedValue('lm_sk_test_mock-token'),
  saveToken: vi.fn().mockResolvedValue(undefined),
}));

// Mock the http module to control API responses
vi.mock('../http.js', () => {
  return {
    HttpClient: class MockHttpClient {
      constructor() {
        return mockHttp;
      }
    },
  };
});

// Import after mocks are set up
import { LobsterMail } from '../client.js';

const INBOX_DATA = {
  id: 'ibx_test123',
  address: 'test@lobstermail.ai',
  localPart: 'test',
  domain: 'lobstermail.ai',
  displayName: null,
  isActive: true,
  emailCount: 0,
  createdAt: new Date().toISOString(),
  lastEmailAt: null,
};

describe('createSmartInbox', () => {
  let lm: LobsterMail;

  beforeEach(async () => {
    vi.clearAllMocks();
    lm = await LobsterMail.create({ token: 'lm_sk_test_mock-token' });
  });

  it('returns inbox on first preferred name success', async () => {
    const expected = { ...INBOX_DATA, localPart: 'billing-bot', address: 'billing-bot@lobstermail.ai' };
    mockHttp.post.mockResolvedValueOnce(expected);

    const inbox = await lm.createSmartInbox({ preferred: ['billing-bot'] });
    expect(inbox.address).toBe('billing-bot@lobstermail.ai');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/inboxes', { localPart: 'billing-bot' });
  });

  it('tries next preferred on collision', async () => {
    mockHttp.post
      .mockRejectedValueOnce(new AddressCollisionError('Address taken'))
      .mockResolvedValueOnce({ ...INBOX_DATA, localPart: 'billing', address: 'billing@lobstermail.ai' });

    const inbox = await lm.createSmartInbox({ preferred: ['billing-bot', 'billing'] });
    expect(inbox.address).toBe('billing@lobstermail.ai');
    expect(mockHttp.post).toHaveBeenCalledTimes(2);
  });

  it('falls through from preferred to name variations on collision', async () => {
    mockHttp.post
      .mockRejectedValueOnce(new AddressCollisionError('Address taken')) // preferred: mia
      .mockResolvedValueOnce({ ...INBOX_DATA, localPart: 'mia-chen', address: 'mia-chen@lobstermail.ai' });

    const inbox = await lm.createSmartInbox({
      preferred: ['mia'],
      name: 'Mia Chen',
    });
    expect(inbox.address).toBe('mia-chen@lobstermail.ai');
    expect(mockHttp.post).toHaveBeenCalledTimes(2);
    // Second call should be the first name variation (mia-chen)
    expect(mockHttp.post).toHaveBeenNthCalledWith(2, '/v1/inboxes', { localPart: 'mia-chen' });
  });

  it('falls through to random on all collisions', async () => {
    // All variations rejected with collision
    mockHttp.post.mockImplementation((_path: string, body: any) => {
      if (body.localPart) {
        return Promise.reject(new AddressCollisionError('Address taken'));
      }
      // No localPart = random fallback
      return Promise.resolve({ ...INBOX_DATA, localPart: 'lobster-7f3k', address: 'lobster-7f3k@lobstermail.ai' });
    });

    const inbox = await lm.createSmartInbox({
      preferred: ['sarah-shield'],
      name: 'Sarah Shield',
    });
    expect(inbox.address).toBe('lobster-7f3k@lobstermail.ai');
    // Should have called for each preferred + each variation + 1 random fallback
    const calls = mockHttp.post.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toEqual({}); // no localPart = random
  });

  it('propagates non-collision errors immediately', async () => {
    mockHttp.post.mockRejectedValueOnce(new AuthenticationError('Bad token'));

    await expect(lm.createSmartInbox({ preferred: ['billing-bot', 'billing'] }))
      .rejects.toThrow(AuthenticationError);
    // Should NOT try the second preferred name
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('passes displayName to all attempts', async () => {
    mockHttp.post
      .mockRejectedValueOnce(new AddressCollisionError('Address taken'))
      .mockResolvedValueOnce({ ...INBOX_DATA, localPart: 'mia1', address: 'mia1@lobstermail.ai', displayName: 'Mia' });

    await lm.createSmartInbox({
      preferred: ['mia'],
      name: 'Mia',
      displayName: 'Mia',
    });

    // First call is preferred "mia" with displayName
    expect(mockHttp.post).toHaveBeenNthCalledWith(1, '/v1/inboxes', { localPart: 'mia', displayName: 'Mia' });
    // Second call is the next variation (mia1, since "mia" from name is deduped, and numbered fallbacks start)
    const secondCall = mockHttp.post.mock.calls[1];
    expect(secondCall[1]).toHaveProperty('displayName', 'Mia');
    expect(secondCall[1]).toHaveProperty('localPart', 'mia1');
  });

  it('works with no options (same as createInbox)', async () => {
    mockHttp.post.mockResolvedValueOnce(INBOX_DATA);

    await lm.createSmartInbox();
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/inboxes', {});
  });

  it('works with only name', async () => {
    const expected = { ...INBOX_DATA, localPart: 'sarah-shield', address: 'sarah-shield@lobstermail.ai' };
    mockHttp.post.mockResolvedValueOnce(expected);

    const inbox = await lm.createSmartInbox({ name: 'Sarah Shield' });
    expect(inbox.address).toBe('sarah-shield@lobstermail.ai');
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/inboxes', { localPart: 'sarah-shield' });
  });

  it('works with only preferred', async () => {
    const expected = { ...INBOX_DATA, localPart: 'alerts', address: 'alerts@lobstermail.ai' };
    mockHttp.post.mockResolvedValueOnce(expected);

    const inbox = await lm.createSmartInbox({ preferred: ['alerts'] });
    expect(inbox.address).toBe('alerts@lobstermail.ai');
  });

  it('sanitizes and validates preferred names', async () => {
    // "ab" is too short (< 3), should be skipped; "valid-one" should be tried
    const expected = { ...INBOX_DATA, localPart: 'valid-one', address: 'valid-one@lobstermail.ai' };
    mockHttp.post.mockResolvedValueOnce(expected);

    const inbox = await lm.createSmartInbox({ preferred: ['ab', 'valid-one'] });
    expect(inbox.address).toBe('valid-one@lobstermail.ai');
    // Should only have called once (skipped "ab")
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/inboxes', { localPart: 'valid-one' });
  });

  it('skips reserved preferred names', async () => {
    // "admin" is reserved, should be skipped
    const expected = { ...INBOX_DATA, localPart: 'my-bot', address: 'my-bot@lobstermail.ai' };
    mockHttp.post.mockResolvedValueOnce(expected);

    const inbox = await lm.createSmartInbox({ preferred: ['admin', 'my-bot'] });
    expect(inbox.address).toBe('my-bot@lobstermail.ai');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post).toHaveBeenCalledWith('/v1/inboxes', { localPart: 'my-bot' });
  });

  it('deduplicates across preferred and name variations', async () => {
    // If preferred contains 'sarah-shield' and name is 'Sarah Shield',
    // 'sarah-shield' should only be tried once — next is s-shield (no dot variations)
    mockHttp.post
      .mockRejectedValueOnce(new AddressCollisionError('Address taken')) // sarah-shield (preferred)
      .mockResolvedValueOnce({ ...INBOX_DATA, localPart: 's-shield', address: 's-shield@lobstermail.ai' });

    const inbox = await lm.createSmartInbox({
      preferred: ['sarah-shield'],
      name: 'Sarah Shield',
    });
    expect(inbox.address).toBe('s-shield@lobstermail.ai');
    // Should have called for sarah-shield (preferred) then s-shield (first non-duplicate variation)
    expect(mockHttp.post).toHaveBeenCalledTimes(2);
    expect(mockHttp.post).toHaveBeenNthCalledWith(2, '/v1/inboxes', { localPart: 's-shield' });
  });
});
