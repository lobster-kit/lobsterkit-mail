import { createHmac, timingSafeEqual } from "node:crypto";
import { buildSafeBodyForLLM } from "../safety.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboundEmailPayload {
  event: string;
  webhookId: string;
  timestamp: string;
  email: {
    id: string;
    from: string;
    to: string[];
    subject: string;
    body: { text?: string; html?: string };
    receivedAt: string;
    headers?: Record<string, string>;
    security?: {
      injectionRiskScore: number;
      flags: string[];
      spf: string | null;
      dkim: string | null;
      dmarc: string | null;
    };
  };
}

export interface ParsedInboundEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  textBody: string;
  receivedAt: string;
  injectionRiskScore: number;
  securityFlags: string[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseInboundEmail(
  payload: InboundEmailPayload,
): ParsedInboundEmail {
  const { email } = payload;
  return {
    id: email.id,
    from: email.from,
    to: email.to,
    subject: email.subject,
    textBody: email.body?.text ?? "",
    receivedAt: email.receivedAt,
    injectionRiskScore: email.security?.injectionRiskScore ?? 0,
    securityFlags: email.security?.flags ?? [],
  };
}

// ---------------------------------------------------------------------------
// LLM-safe formatting (reuses existing SDK safety module)
// ---------------------------------------------------------------------------

export function formatEmailForLLM(email: ParsedInboundEmail): string {
  return buildSafeBodyForLLM({
    from: email.from,
    subject: email.subject,
    receivedAt: email.receivedAt,
    injectionRiskScore: email.injectionRiskScore,
    flags: email.securityFlags,
    bodyText: email.textBody,
  });
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify HMAC-SHA256 signature from LobsterMail webhook.
 *
 * - No secret configured → skip verification (return true)
 * - Secret configured but no signature on request → reject
 * - Uses timing-safe comparison to prevent timing attacks
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}
