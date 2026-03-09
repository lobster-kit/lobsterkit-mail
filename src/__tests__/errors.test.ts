import { describe, it, expect } from 'vitest';
import {
  LobsterMailError,
  AuthenticationError,
  InsufficientTierError,
  NotFoundError,
  RateLimitError,
  AddressCollisionError,
} from '../errors.js';

describe('Error Classes', () => {
  it('LobsterMailError has correct properties', () => {
    const err = new LobsterMailError('Something failed', 'server_error', 500, 'req_123');
    expect(err.message).toBe('Something failed');
    expect(err.code).toBe('server_error');
    expect(err.statusCode).toBe(500);
    expect(err.requestId).toBe('req_123');
    expect(err.name).toBe('LobsterMailError');
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthenticationError defaults to 401', () => {
    const err = new AuthenticationError('Bad token', 'req_456');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('authentication_error');
    expect(err.name).toBe('AuthenticationError');
    expect(err).toBeInstanceOf(LobsterMailError);
  });

  it('InsufficientTierError defaults to 403', () => {
    const err = new InsufficientTierError('Need tier 1');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('insufficient_tier');
    expect(err.name).toBe('InsufficientTierError');
  });

  it('NotFoundError defaults to 404', () => {
    const err = new NotFoundError('Inbox not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('not_found');
  });

  it('RateLimitError defaults to 429', () => {
    const err = new RateLimitError('Too many requests');
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('rate_limited');
  });

  it('AddressCollisionError defaults to 409', () => {
    const err = new AddressCollisionError('Address already taken', 'req_789');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('address_collision');
    expect(err.name).toBe('AddressCollisionError');
    expect(err.requestId).toBe('req_789');
    expect(err).toBeInstanceOf(LobsterMailError);
  });
});
