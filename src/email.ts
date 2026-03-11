import { buildSafeBodyForLLM } from './safety.js';
import type { HttpClient } from './http.js';

export interface EmailSecurity {
  injectionRiskScore: number;
  flags: string[];
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

export interface AttachmentData {
  filename: string;
  contentType: string;
  s3Key: string;
  sizeBytes: number;
  downloadUrl?: string;
}

export interface EmailData {
  id: string;
  inboxId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  cc: string[] | null;
  subject: string;
  preview: string | null;
  body: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  threadId: string | null;
  attachments?: AttachmentData[];
  security: EmailSecurity;
  status: string | null;
  createdAt: string;
  receivedAt: string | null;
}

/**
 * Represents an email message with security metadata and safe content access.
 *
 * The key differentiator: provides injection-safe content formatting
 * for LLM consumption via {@link Email.safeBodyForLLM}.
 *
 * @example
 * ```typescript
 * const email = await inbox.waitForEmail();
 * if (!email.isInjectionRisk) {
 *   const safe = email.safeBodyForLLM();
 *   // Pass `safe` to your LLM
 * }
 * ```
 */
export class Email {
  /** Unique email identifier (e.g. `eml_...`). */
  readonly id: string;
  readonly inboxId: string;
  readonly direction: 'inbound' | 'outbound';
  readonly from: string;
  readonly to: string[];
  readonly cc: string[] | null;
  readonly subject: string;
  readonly preview: string | null;
  /** Whether this email has been read. */
  readonly isRead: boolean;
  readonly hasAttachments: boolean;
  /** Thread ID this email belongs to, if threaded. */
  readonly threadId: string | null;
  /** Attachment metadata. Each entry has filename, contentType, sizeBytes, and s3Key. */
  readonly attachments: AttachmentData[];
  readonly security: EmailSecurity;
  readonly status: string | null;
  readonly createdAt: string;
  readonly receivedAt: string | null;

  private _body: string | null;
  private _http: HttpClient;

  constructor(data: EmailData, http: HttpClient) {
    this.id = data.id;
    this.inboxId = data.inboxId;
    this.direction = data.direction;
    this.from = data.from;
    this.to = data.to;
    this.cc = data.cc;
    this.subject = data.subject;
    this.preview = data.preview;
    this._body = data.body;
    this.isRead = data.isRead;
    this.hasAttachments = data.hasAttachments;
    this.threadId = data.threadId ?? null;
    this.attachments = data.attachments ?? [];
    this.security = data.security;
    this.status = data.status;
    this.createdAt = data.createdAt;
    this.receivedAt = data.receivedAt;
    this._http = http;
  }

  /**
   * Raw email body text. May be null if body hasn't been fetched.
   * Call `fetchFullBody()` to load the body lazily.
   */
  get body(): string | null {
    return this._body;
  }

  /**
   * Whether this email has a high injection risk score (>= 0.5).
   * Check this before passing email content to an LLM.
   */
  get isInjectionRisk(): boolean {
    return this.security.injectionRiskScore >= 0.5;
  }

  /**
   * Format the email body for safe LLM consumption.
   *
   * Wraps the content with clear boundary markers, includes metadata,
   * and strips any injected boundary markers from the body itself.
   *
   * @returns Formatted string safe to include in an LLM prompt
   */
  safeBodyForLLM(): string {
    const bodyText = this._body ?? this.preview ?? '';

    return buildSafeBodyForLLM({
      from: this.from,
      subject: this.subject,
      receivedAt: this.receivedAt ?? this.createdAt,
      injectionRiskScore: this.security.injectionRiskScore,
      flags: this.security.flags,
      bodyText,
    });
  }

  /**
   * Lazy-load the full email body from S3 via the API.
   * After calling this, `this.body` will be populated.
   */
  async fetchFullBody(): Promise<void> {
    if (this._body !== null) return;

    const data = await this._http.get<EmailData>(
      `/v1/inboxes/${this.inboxId}/emails/${this.id}`,
    );
    this._body = data.body;
  }

  /**
   * Get the download URL for a specific attachment by index.
   * Returns the cached downloadUrl if already available, otherwise fetches
   * a presigned URL from the API.
   *
   * @param index - Zero-based attachment index
   * @returns Presigned download URL string
   * @throws if the attachment index is out of bounds
   */
  async getAttachmentUrl(index: number): Promise<string> {
    if (index < 0 || index >= this.attachments.length) {
      throw new Error(`Attachment index ${index} out of bounds (0-${this.attachments.length - 1})`);
    }

    // Use cached downloadUrl if already available (e.g., from GET single email response)
    if (this.attachments[index].downloadUrl) {
      return this.attachments[index].downloadUrl!;
    }

    const data = await this._http.get<{ downloadUrl: string }>(
      `/v1/inboxes/${this.inboxId}/emails/${this.id}/attachments/${index}`,
    );
    // Cache for subsequent calls
    this.attachments[index].downloadUrl = data.downloadUrl;
    return data.downloadUrl;
  }

  /**
   * Download an attachment's content as a Buffer.
   * Fetches the presigned URL and then downloads the file.
   *
   * @param index - Zero-based attachment index
   * @returns Object with filename, contentType, and data Buffer
   */
  async downloadAttachment(index: number): Promise<{
    filename: string;
    contentType: string;
    data: Buffer;
  }> {
    const url = await this.getAttachmentUrl(index);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download attachment: HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    return {
      filename: this.attachments[index].filename,
      contentType: this.attachments[index].contentType,
      data: Buffer.from(arrayBuf),
    };
  }
}
