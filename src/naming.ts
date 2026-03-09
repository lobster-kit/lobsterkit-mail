/**
 * Name variation generation and validation for smart inbox naming.
 *
 * Pure logic module — no network calls. Generates candidate local parts
 * from an agent's identity (name, org) and validates them against
 * LobsterMail's addressing rules.
 */

// Duplicated from @lobstermail/shared — the SDK is a public npm package
// and must not depend on internal packages. Server-side validation
// remains the source of truth.
const RESERVED_LOCAL_PARTS = new Set([
  'admin', 'postmaster', 'hostmaster', 'webmaster', 'abuse', 'noreply',
  'no-reply', 'mailer-daemon', 'support', 'help', 'info', 'contact',
  'security', 'root', 'www', 'mail', 'email', 'lobster', 'lobstermail',
  'billing', 'sales', 'api', 'dev', 'test', 'null', 'undefined',
]);

const LOCAL_PART_REGEX = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 64;

/**
 * Sanitize a raw string into a valid local part candidate.
 *
 * - Lowercases
 * - Replaces spaces and underscores with hyphens
 * - Strips invalid characters
 * - Collapses consecutive hyphens/dots
 * - Trims leading/trailing hyphens and dots
 * - Truncates to 64 characters
 *
 * @returns Sanitized string (may be empty if input was all invalid chars)
 */
export function sanitizeLocalPart(raw: string): string {
  let result = raw
    .toLowerCase()
    .replace(/[\s_]+/g, '-')        // spaces + underscores → hyphens
    .replace(/[^a-z0-9._-]/g, '')   // strip invalid chars
    .replace(/[-]{2,}/g, '-')       // collapse consecutive hyphens
    .replace(/[.]{2,}/g, '.')       // collapse consecutive dots
    .replace(/^[._-]+/, '')         // trim leading separators
    .replace(/[._-]+$/, '');        // trim trailing separators

  if (result.length > MAX_LENGTH) {
    result = result.slice(0, MAX_LENGTH).replace(/[._-]+$/, '');
  }

  return result;
}

/**
 * Check if a local part is valid for use as an inbox address.
 *
 * Validates against:
 * - Length constraints (3–64 characters)
 * - Character rules (lowercase alphanumeric, dots, hyphens, underscores)
 * - Must start and end with alphanumeric
 * - Reserved words
 */
export function isValidLocalPart(localPart: string): boolean {
  if (localPart.length < MIN_LENGTH || localPart.length > MAX_LENGTH) {
    return false;
  }
  if (!LOCAL_PART_REGEX.test(localPart)) {
    return false;
  }
  if (RESERVED_LOCAL_PARTS.has(localPart)) {
    return false;
  }
  return true;
}

/**
 * Split a name string into parts, handling various formats:
 * - Hyphenated: "sarah-shield" → ["sarah", "shield"]
 * - Dotted: "sarah.shield" → ["sarah", "shield"]
 * - Spaced: "Sarah Shield" → ["sarah", "shield"]
 * - camelCase: "sarahShield" → ["sarah", "shield"]
 *
 * @returns Array of lowercase name parts
 */
export function splitName(name: string): string[] {
  // First handle explicit separators (hyphens, dots, spaces, underscores)
  const normalized = name.trim().toLowerCase();

  if (/[\s._-]/.test(normalized)) {
    return normalized
      .split(/[\s._-]+/)
      .filter((p) => p.length > 0);
  }

  // Try camelCase splitting
  const camelParts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 0);

  if (camelParts.length > 1) {
    return camelParts;
  }

  // Single word
  return [normalized];
}

export interface VariationInput {
  /** Agent name or identity (e.g. "Sarah Shield", "Mia", "billing-bot") */
  name?: string;
  /** Organization or company name (e.g. "Palisade", "acme-corp") */
  org?: string;
}

/** Maximum number of numbered fallback attempts (e.g. sarah-shield1, sarah-shield2, ...) */
const MAX_NUMBERED_FALLBACKS = 5;

/**
 * Generate an ordered list of local part candidates from a name and org.
 *
 * Dots are cosmetic in LobsterMail (Gmail-style dot equivalence), so
 * dot-separated variations are NOT generated — they would collide with
 * the dotless form on the server.
 *
 * Given `name="Sarah Shield"`, `org="Palisade"`, produces (in order):
 * 1. `sarah-shield`            — hyphen-separated
 * 2. `sarah-shield-palisade`   — with org
 * 3. `s-shield`                — initial + last
 * 4. `sarah-shield1`           — numbered fallback
 * 5. `sarah-shield2`           — numbered fallback
 * 6. `sarah-shield3`           — numbered fallback
 * 7. `sarah-shield4`           — numbered fallback
 * 8. `sarah-shield5`           — numbered fallback
 *
 * For single-part names like "Mia":
 * 1. `mia`
 * 2. `mia-palisade`            — with org (if provided)
 * 3. `mia1` ... `mia5`         — numbered fallbacks
 *
 * All results are sanitized, validated, and deduplicated.
 * Invalid or reserved entries are filtered out.
 *
 * @returns Ordered array of valid local part candidates (may be empty)
 */
export function generateVariations(input: VariationInput): string[] {
  const { name, org } = input;

  if (!name || name.trim().length === 0) {
    return [];
  }

  const parts = splitName(name);
  const orgParts = org ? splitName(org) : [];
  const orgSlug = orgParts.length > 0 ? sanitizeLocalPart(orgParts.join('-')) : '';

  const candidates: string[] = [];

  // The base form is used for numbered fallbacks at the end
  let baseForm: string;

  if (parts.length >= 2) {
    // Multi-part name
    const hyphenated = parts.join('-');
    const initial = parts[0]![0];
    const lastName = parts[parts.length - 1]!;
    baseForm = hyphenated;

    candidates.push(hyphenated);                         // sarah-shield

    if (orgSlug) {
      candidates.push(`${hyphenated}-${orgSlug}`);       // sarah-shield-palisade
    }

    if (initial && lastName) {
      candidates.push(`${initial}-${lastName}`);         // s-shield
    }
  } else {
    // Single-part name
    const single = parts[0]!;
    baseForm = single;
    candidates.push(single);                             // mia

    if (orgSlug) {
      candidates.push(`${single}-${orgSlug}`);           // mia-palisade
    }
  }

  // Numbered fallbacks (e.g. sarah-shield1, sarah-shield2, ...)
  for (let i = 1; i <= MAX_NUMBERED_FALLBACKS; i++) {
    candidates.push(`${baseForm}${i}`);
  }

  // Sanitize, validate, and deduplicate
  const seen = new Set<string>();
  const results: string[] = [];

  for (const candidate of candidates) {
    const sanitized = sanitizeLocalPart(candidate);
    if (sanitized && !seen.has(sanitized) && isValidLocalPart(sanitized)) {
      seen.add(sanitized);
      results.push(sanitized);
    }
  }

  return results;
}
