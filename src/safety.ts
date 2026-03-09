/**
 * Content safety utilities for LLM agent consumption.
 *
 * These helpers wrap email content with clear boundary markers
 * so LLM agents can distinguish untrusted email data from
 * trusted system instructions.
 */

const UNTRUSTED_START = '--- BEGIN UNTRUSTED EMAIL DATA ---';
const UNTRUSTED_END = '--- END UNTRUSTED EMAIL DATA ---';
const CONTENT_START = '[EMAIL_CONTENT_START]';
const CONTENT_END = '[EMAIL_CONTENT_END]';

export interface SafeBodyOptions {
  from: string;
  subject: string;
  receivedAt: string;
  injectionRiskScore: number;
  flags: string[];
  bodyText: string;
}

/**
 * Format email content for safe LLM consumption.
 *
 * Output format:
 * ```
 * --- BEGIN UNTRUSTED EMAIL DATA ---
 * From: sender@example.com
 * Subject: Your code
 * Date: 2026-02-16T20:30:00Z
 * Injection Risk: low (0.1)
 *
 * [EMAIL_CONTENT_START]
 * Your verification code is 847291.
 * [EMAIL_CONTENT_END]
 * --- END UNTRUSTED EMAIL DATA ---
 * ```
 */
export function buildSafeBodyForLLM(opts: SafeBodyOptions): string {
  const riskLevel = opts.injectionRiskScore >= 0.7 ? 'HIGH'
    : opts.injectionRiskScore >= 0.5 ? 'MEDIUM'
    : 'low';

  // Strip any existing boundary markers from the body (defense in depth)
  let cleanBody = opts.bodyText;
  cleanBody = cleanBody.replace(/\[EMAIL_CONTENT_START\]/gi, '[boundary_stripped]');
  cleanBody = cleanBody.replace(/\[EMAIL_CONTENT_END\]/gi, '[boundary_stripped]');
  cleanBody = cleanBody.replace(/--- BEGIN UNTRUSTED EMAIL DATA ---/gi, '[boundary_stripped]');
  cleanBody = cleanBody.replace(/--- END UNTRUSTED EMAIL DATA ---/gi, '[boundary_stripped]');

  const parts = [
    UNTRUSTED_START,
    `From: ${opts.from}`,
    `Subject: ${opts.subject ?? '(no subject)'}`,
    `Date: ${opts.receivedAt}`,
    `Injection Risk: ${riskLevel} (${opts.injectionRiskScore})`,
  ];

  if (opts.flags.length > 0) {
    parts.push(`Security Flags: ${opts.flags.join(', ')}`);
  }

  parts.push('');
  parts.push(CONTENT_START);
  parts.push(cleanBody);
  parts.push(CONTENT_END);
  parts.push(UNTRUSTED_END);

  return parts.join('\n');
}
