// Unguessable tokens for private links (family pages, the co-op share link, invites).
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of a token, for tokens that are emailed once and never shown again. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Rejects obviously malformed tokens before they reach the database. */
export function plausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,100}$/.test(token);
}
