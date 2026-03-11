import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { Domain } from '../domain.js';
import type { DomainData, DnsRecord } from '../domain.js';

const DNS_RECORDS: DnsRecord[] = [
  { type: 'TXT', host: '_lobstermail.example.com', value: 'lobstermail-verify=dom_abc123' },
  { type: 'MX', host: 'example.com', value: 'mx.lobstermail.ai', priority: 10 },
  { type: 'TXT', host: 'example.com', value: 'v=spf1 include:spf.lobstermail.ai ~all' },
  { type: 'CNAME', host: 'lobstermail._domainkey.example.com', value: 'dkim.lobstermail.ai' },
  { type: 'TXT', host: '_dmarc.example.com', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com' },
];

const DOMAIN_DATA: DomainData = {
  id: 'dom_abc123',
  domain: 'example.com',
  status: 'pending_verification',
  dnsRecords: DNS_RECORDS,
  createdAt: '2026-02-17T12:00:00Z',
};

describe('Domain class', () => {
  it('exposes all properties', () => {
    const domain = new Domain(DOMAIN_DATA, mockHttp as any);

    expect(domain.id).toBe('dom_abc123');
    expect(domain.domain).toBe('example.com');
    expect(domain.status).toBe('pending_verification');
    expect(domain.dnsRecords).toHaveLength(5);
    expect(domain.createdAt).toBe('2026-02-17T12:00:00Z');
  });

  it('dnsRecords includes all 5 record types', () => {
    const domain = new Domain(DOMAIN_DATA, mockHttp as any);
    const types = domain.dnsRecords.map((r) => `${r.type}:${r.host}`);

    expect(types).toContain('TXT:_lobstermail.example.com'); // verification
    expect(types).toContain('MX:example.com'); // inbound
    expect(types).toContain('TXT:example.com'); // SPF
    expect(types).toContain('CNAME:lobstermail._domainkey.example.com'); // DKIM
    expect(types).toContain('TXT:_dmarc.example.com'); // DMARC
  });

  it('DKIM record is a CNAME pointing to dkim.lobstermail.ai', () => {
    const domain = new Domain(DOMAIN_DATA, mockHttp as any);
    const dkim = domain.dnsRecords.find((r) => r.type === 'CNAME');

    expect(dkim).toBeDefined();
    expect(dkim!.host).toBe('lobstermail._domainkey.example.com');
    expect(dkim!.value).toBe('dkim.lobstermail.ai');
  });

  it('MX record includes priority', () => {
    const domain = new Domain(DOMAIN_DATA, mockHttp as any);
    const mx = domain.dnsRecords.find((r) => r.type === 'MX');

    expect(mx).toBeDefined();
    expect(mx!.priority).toBe(10);
  });

  it('verify() calls POST /v1/domains/{id}/verify', async () => {
    const verified = { ...DOMAIN_DATA, status: 'verified' as const };
    mockHttp.post.mockResolvedValueOnce(verified);

    const domain = new Domain(DOMAIN_DATA, mockHttp as any);
    const result = await domain.verify();

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/domains/dom_abc123/verify');
    expect(result.status).toBe('verified');
    expect(result).toBeInstanceOf(Domain);
  });
});

describe('LobsterMail domain methods', () => {
  let lm: LobsterMail;

  beforeEach(async () => {
    vi.clearAllMocks();
    lm = await LobsterMail.create({ token: 'lm_sk_test_mock-token' });
  });

  it('addDomain calls POST /v1/domains', async () => {
    mockHttp.post.mockResolvedValueOnce(DOMAIN_DATA);

    const domain = await lm.addDomain({ domain: 'example.com' });

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/domains', { domain: 'example.com' });
    expect(domain).toBeInstanceOf(Domain);
    expect(domain.id).toBe('dom_abc123');
    expect(domain.dnsRecords).toHaveLength(5);
  });

  it('getDomain calls GET /v1/domains/{id}', async () => {
    mockHttp.get.mockResolvedValueOnce(DOMAIN_DATA);

    const domain = await lm.getDomain('dom_abc123');

    expect(mockHttp.get).toHaveBeenCalledWith('/v1/domains/dom_abc123');
    expect(domain).toBeInstanceOf(Domain);
  });

  it('listDomains calls GET /v1/domains', async () => {
    mockHttp.get.mockResolvedValueOnce({ data: [DOMAIN_DATA] });

    const domains = await lm.listDomains();

    expect(mockHttp.get).toHaveBeenCalledWith('/v1/domains');
    expect(domains).toHaveLength(1);
    expect(domains[0]).toBeInstanceOf(Domain);
  });

  it('verifyDomain calls POST /v1/domains/{id}/verify', async () => {
    const verified = { ...DOMAIN_DATA, status: 'verified' as const };
    mockHttp.post.mockResolvedValueOnce(verified);

    const domain = await lm.verifyDomain('dom_abc123');

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/domains/dom_abc123/verify');
    expect(domain.status).toBe('verified');
  });

  it('deleteDomain calls DELETE /v1/domains/{id}', async () => {
    mockHttp.delete.mockResolvedValueOnce(undefined);

    await lm.deleteDomain('dom_abc123');

    expect(mockHttp.delete).toHaveBeenCalledWith('/v1/domains/dom_abc123');
  });
});

describe('LobsterMail.verify', () => {
  let lm: LobsterMail;

  beforeEach(async () => {
    vi.clearAllMocks();
    lm = await LobsterMail.create({ token: 'lm_sk_test_mock-token' });
  });

  it('calls POST /v1/verify/{provider}', async () => {
    mockHttp.post.mockResolvedValueOnce({ status: 'pending', instructions: 'Post a tweet' });

    const result = await lm.verify({ provider: 'x', handle: 'myhandle' });

    expect(mockHttp.post).toHaveBeenCalledWith('/v1/verify/x', { handle: 'myhandle' });
    expect(result.status).toBe('pending');
    expect(result.instructions).toBe('Post a tweet');
  });
});
