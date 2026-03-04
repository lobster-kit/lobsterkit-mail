import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const TOKEN_DIR = join(homedir(), '.lobstermail');
const TOKEN_FILE = join(TOKEN_DIR, 'token');

/**
 * Resolve a LobsterMail API token from multiple sources:
 * 1. Explicit token passed as argument
 * 2. LOBSTERMAIL_TOKEN environment variable
 * 3. ~/.lobstermail/token file
 *
 * Returns null if no token is found.
 */
export async function resolveToken(explicitToken?: string): Promise<string | null> {
  // 1. Explicit token
  if (explicitToken) return explicitToken;

  // 2. Environment variable
  const envToken = process.env.LOBSTERMAIL_TOKEN;
  if (envToken) return envToken;

  // 3. File storage
  try {
    const token = await fs.readFile(TOKEN_FILE, 'utf-8');
    return token.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Save a token to ~/.lobstermail/token with restricted permissions (0600).
 */
export async function saveToken(token: string): Promise<void> {
  await fs.mkdir(TOKEN_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(TOKEN_FILE, token, { mode: 0o600 });
}

/**
 * Delete the stored token file.
 */
export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // File may not exist
  }
}
