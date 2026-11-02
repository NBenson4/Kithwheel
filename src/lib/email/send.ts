// Server-only email transport. Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
//
// Compose subject/html/text in @/lib/email/templates, then:
//   await sendEmail({ to: user.email, ...welcomeEmail({ name: user.name }) });
//
// Import it only from server code (route handlers, auth callbacks). Never expose a
// generic "send any email" API route.
//
// Local development: when RESEND_API_KEY is not set and NODE_ENV is not
// production, the email is printed to the server console instead of being sent,
// so sign-up verification and password reset links can be followed without an
// email provider. In production a missing key is an error.
//
// End-to-end tests: with no RESEND_API_KEY, set EMAIL_CAPTURE_FILE and each email
// is appended to that file as one JSON line instead of being sent, so Playwright
// can read reset links. Never set it on a real deployment.

import 'server-only';
import { appendFile } from 'node:fs/promises';
import { env } from '@/lib/env';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 30_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional Reply-To address (defaults to EMAIL_REPLY_TO when set). */
  replyTo?: string;
}

export interface SendEmailResult {
  /** Provider message id. `dev-console` when the email was only logged locally. */
  id: string;
}

/** Plain-text fallback derived from the HTML body when no text version is supplied. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sendEmail(
  input: SendEmailInput,
  options?: { signal?: AbortSignal },
): Promise<SendEmailResult> {
  const text = input.text ?? htmlToText(input.html);
  const replyTo = input.replyTo ?? env.EMAIL_REPLY_TO;

  if (!env.RESEND_API_KEY) {
    // Explicit test capture works under `next start` too (NODE_ENV=production),
    // but only when EMAIL_CAPTURE_FILE is deliberately set and no key exists.
    const captureFile = process.env.EMAIL_CAPTURE_FILE;
    if (captureFile) {
      const entry = { to: input.to, subject: input.subject, body: text, html: input.html };
      await appendFile(captureFile, `${JSON.stringify(entry)}\n`);
      return { id: 'captured' };
    }
    if (env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is not set; cannot send email in production');
    }
    // biome-ignore lint/suspicious/noConsole: local-development email preview.
    console.info(
      `\n[email:dev] To: ${input.to}\n[email:dev] Subject: ${input.subject}\n[email:dev] ${text}\n`,
    );
    return { id: 'dev-console' };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    signal: options?.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(SEND_TIMEOUT_MS)])
      : AbortSignal.timeout(SEND_TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`email send failed: ${res.status} ${detail}`.trim());
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error('email send failed: provider returned no message id');
  return { id: json.id };
}

const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;

/**
 * Sends many emails with Resend's batch API (100 per request), so an announcement to a
 * whole co-op doesn't hit the per-second rate limit. Returns how many were accepted.
 */
export async function sendEmailBatch(inputs: SendEmailInput[]): Promise<number> {
  if (!inputs.length) return 0;
  if (!env.RESEND_API_KEY) {
    for (const input of inputs) await sendEmail(input);
    return inputs.length;
  }
  let sent = 0;
  for (let start = 0; start < inputs.length; start += BATCH_SIZE) {
    const chunk = inputs.slice(start, start + BATCH_SIZE);
    const res = await fetch(RESEND_BATCH_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(
        chunk.map((input) => {
          const replyTo = input.replyTo ?? env.EMAIL_REPLY_TO;
          return {
            from: env.EMAIL_FROM,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text ?? htmlToText(input.html),
            ...(replyTo ? { reply_to: replyTo } : {}),
          };
        }),
      ),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`batch email send failed: ${res.status} ${detail}`.trim());
    }
    sent += chunk.length;
  }
  return sent;
}
