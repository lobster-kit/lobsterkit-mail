import type { HttpClient } from './http.js';

export type DnsRecordType = 'TXT' | 'MX' | 'CNAME';

export type DomainStatus = 'pending_verification' | 'verified' | 'failed';

export interface DnsRecord {
  type: DnsRecordType;
  host: string;
  value: string;
  priority?: number;
}

export interface DomainData {
  id: string;
  domain: string;
  status: DomainStatus;
  dnsRecords: DnsRecord[];
  createdAt: string;
}

/**
 * Represents a custom email domain registered with LobsterMail.
 *
 * After calling {@link LobsterMail.addDomain}, configure the DNS records
 * returned in {@link Domain.dnsRecords} at your DNS provider. The records
 * include domain verification, MX, SPF, DKIM, and DMARC entries.
 *
 * @example
 * ```typescript
 * const domain = await lm.addDomain({ domain: 'yourdomain.com' });
 * console.log(domain.status);     // 'pending_verification'
 * console.log(domain.dnsRecords); // 5 DNS records to configure
 * ```
 */
export class Domain {
  /** Unique domain identifier (e.g. `dom_...`). */
  readonly id: string;
  /** The domain name (e.g. `yourdomain.com`). */
  readonly domain: string;
  /** Current verification status. */
  readonly status: DomainStatus;
  /** DNS records to configure at your DNS provider. */
  readonly dnsRecords: DnsRecord[];
  /** When the domain was registered. */
  readonly createdAt: string;

  private _http: HttpClient;

  constructor(data: DomainData, http: HttpClient) {
    this.id = data.id;
    this.domain = data.domain;
    this.status = data.status;
    this.dnsRecords = data.dnsRecords;
    this.createdAt = data.createdAt;
    this._http = http;
  }

  /**
   * Trigger re-verification of DNS records for this domain.
   * Useful after updating DNS configuration.
   *
   * @returns A new Domain instance with the updated status
   */
  async verify(): Promise<Domain> {
    const data = await this._http.post<DomainData>(`/v1/domains/${this.id}/verify`);
    return new Domain(data, this._http);
  }
}
