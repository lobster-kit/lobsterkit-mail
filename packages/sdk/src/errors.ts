/** Base error class for all LobsterMail API errors. */
export class LobsterMailError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly requestId?: string;

  constructor(message: string, code: string, statusCode?: number, requestId?: string) {
    super(message);
    this.name = 'LobsterMailError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

/** Thrown when the API token is missing, invalid, or expired (HTTP 401). */
export class AuthenticationError extends LobsterMailError {
  constructor(message: string, requestId?: string) {
    super(message, 'authentication_error', 401, requestId);
    this.name = 'AuthenticationError';
  }
}

/** Thrown when the account tier is too low for the requested operation (HTTP 403). */
export class InsufficientTierError extends LobsterMailError {
  constructor(message: string, requestId?: string) {
    super(message, 'insufficient_tier', 403, requestId);
    this.name = 'InsufficientTierError';
  }
}

/** Thrown when the requested resource does not exist (HTTP 404). */
export class NotFoundError extends LobsterMailError {
  constructor(message: string, requestId?: string) {
    super(message, 'not_found', 404, requestId);
    this.name = 'NotFoundError';
  }
}

/** Thrown when the request exceeds rate limits (HTTP 429). */
export class RateLimitError extends LobsterMailError {
  constructor(message: string, requestId?: string) {
    super(message, 'rate_limited', 429, requestId);
    this.name = 'RateLimitError';
  }
}

/** Thrown when the requested inbox address is already taken (HTTP 409). */
export class AddressCollisionError extends LobsterMailError {
  constructor(message: string, requestId?: string) {
    super(message, 'address_collision', 409, requestId);
    this.name = 'AddressCollisionError';
  }
}
