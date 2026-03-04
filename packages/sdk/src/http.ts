import { LobsterMailError, AuthenticationError, InsufficientTierError, NotFoundError, RateLimitError, AddressCollisionError } from './errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  token?: string;
}

export class HttpClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
  }

  setToken(token: string) {
    this.token = token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async request<T>(method: string, path: string, body?: any, opts?: { signal?: AbortSignal }): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts?.signal,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const message = errorBody.message ?? `HTTP ${res.status}`;
      const code = errorBody.error ?? 'unknown_error';
      const requestId = errorBody.requestId;

      switch (res.status) {
        case 401:
          throw new AuthenticationError(message, requestId);
        case 403:
          throw new InsufficientTierError(message, requestId);
        case 404:
          throw new NotFoundError(message, requestId);
        case 409:
          if (code === 'address_collision') {
            throw new AddressCollisionError(message, requestId);
          }
          throw new LobsterMailError(message, code, 409, requestId);
        case 429:
          throw new RateLimitError(message, requestId);
        default:
          throw new LobsterMailError(message, code, res.status, requestId);
      }
    }

    return res.json();
  }

  /**
   * Make a request that may return 204 No Content.
   * Returns null on 204, otherwise the parsed JSON body.
   */
  async requestMaybeEmpty<T>(method: string, path: string, opts?: { signal?: AbortSignal }): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      signal: opts?.signal,
    });

    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const message = errorBody.message ?? `HTTP ${res.status}`;
      const code = errorBody.error ?? 'unknown_error';
      const requestId = errorBody.requestId;

      switch (res.status) {
        case 401:
          throw new AuthenticationError(message, requestId);
        case 404:
          throw new NotFoundError(message, requestId);
        case 429:
          throw new RateLimitError(message, requestId);
        default:
          throw new LobsterMailError(message, code, res.status, requestId);
      }
    }

    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: any): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
