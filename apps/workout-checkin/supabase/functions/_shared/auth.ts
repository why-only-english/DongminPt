import { DASHBOARD_SESSION_TTL_DAYS } from './env.ts';
import { requiredEnv } from './env.ts';
import { hmacSha256Hex, randomToken, sha256Hex } from './crypto.ts';

export async function accessCodeHash(slug: string, accessCode: string): Promise<string> {
  const pepper = requiredEnv('DASHBOARD_ACCESS_CODE_PEPPER');
  return hmacSha256Hex(`${slug}:${accessCode}`, pepper);
}

export async function createSessionToken(): Promise<{ token: string; tokenHash: string; expiresAt: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + DASHBOARD_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { token, tokenHash, expiresAt };
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}
