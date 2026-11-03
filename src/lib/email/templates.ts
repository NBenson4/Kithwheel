// Your email templates. Edit, add, or delete freely.
// Each template returns { subject, html, text }; send it via the framework transport:
//   import { sendEmail } from '@/lib/email/send';
//   import { welcomeEmail } from '@/lib/email/templates';
//   await sendEmail({ to: user.email, ...welcomeEmail({ name: user.name }) });
// renderEmail() is a plain inline-styled shell — email clients drop <style>/<link>, so style inline.
// renderEmail() auto-escapes its heading/body/cta/footer, so pass RAW values (don't escapeHtml() them
// first — that double-escapes). escapeHtml() is only for when you hand-build an html string yourself.

/** Subject + rendered bodies — spread into sendEmail({ to, ... }). */
export interface EmailContent {
  subject: string;
  html: string;
  text?: string;
}

export interface RenderEmailOptions {
  heading: string;
  /** Body paragraphs (plain text; escaped for you). */
  body: string[];
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Optional footer line under the divider. */
  footer?: string;
}

/** Escape a value for safe interpolation into an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Wrap content in a minimal, inline-styled email shell. Restyle to match the brand. */
export function renderEmail(options: RenderEmailOptions): { html: string; text: string } {
  const paragraphs = options.body
    .map(
      (line) =>
        `<p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`,
    )
    .join('');
  const button = options.cta
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(options.cta.url)}" style="display:inline-block;padding:10px 20px;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;">${escapeHtml(options.cta.label)}</a></p>`
    : '';
  const footer = options.footer
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;color:#999999;font-size:12px;">${escapeHtml(options.footer)}</div>`
    : '';
  const html = [
    '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;">',
    `<h1 style="margin:0 0 16px;color:#111111;font-size:22px;">${escapeHtml(options.heading)}</h1>`,
    paragraphs,
    button,
    footer,
    '</div>',
  ].join('');
  const text = [
    options.heading,
    '',
    ...options.body,
    ...(options.cta ? ['', `${options.cta.label}: ${options.cta.url}`] : []),
    ...(options.footer ? ['', options.footer] : []),
  ].join('\n');
  return { html, text };
}

// ─── Example templates — edit / add / remove to fit the app ───

/** Welcome email for a new signup. */
export function welcomeEmail(input: { name: string; ctaUrl?: string }): EmailContent {
  const { html, text } = renderEmail({
    heading: `Welcome, ${input.name}!`,
    body: ["Thanks for signing up — we're glad you're here."],
    cta: input.ctaUrl ? { label: 'Get started', url: input.ctaUrl } : undefined,
    footer: 'You received this because you created an account.',
  });
  return { subject: 'Welcome aboard', html, text };
}

/** One-time password reset link. Better Auth supplies the complete callback URL. */
export function passwordResetEmail(input: { url: string }): EmailContent {
  const { html, text } = renderEmail({
    heading: 'Reset your Kithwheel password',
    body: [
      'Use the link below to choose a new password for your coordinator account.',
      'This link expires in one hour and can only be used once. If you did not request a reset, you can ignore this email.',
    ],
    cta: { label: 'Choose a new password', url: input.url },
    footer:
      'Your Kithwheel account is for coordinator access and is separate from any fees families may pay their co-op.',
  });
  return { subject: 'Reset your Kithwheel password', html, text };
}

/** Sent when a co-op's subscription payment fails; Stripe keeps retrying meanwhile. */
export function paymentFailedEmail(input: { coopName: string; url: string }): EmailContent {
  const { html, text } = renderEmail({
    heading: `We couldn't process ${input.coopName}'s Kithwheel payment`,
    body: [
      `The latest payment for ${input.coopName}'s Kithwheel plan didn't go through. We'll try again automatically over the next few days.`,
      'To avoid any interruption, open Billing in your workspace and update the payment method.',
    ],
    cta: { label: 'Update payment method', url: input.url },
    footer: 'You received this because you coordinate this co-op on Kithwheel.',
  });
  return { subject: `Action needed: payment for ${input.coopName}`, html, text };
}

/** Generic notification email. */
export function notificationEmail(input: {
  subject: string;
  title: string;
  lines: string[];
  cta?: { label: string; url: string };
}): EmailContent {
  const { html, text } = renderEmail({ heading: input.title, body: input.lines, cta: input.cta });
  return { subject: input.subject, html, text };
}

// ─── Co-op coordination ───

/** Invitation for another coordinator to share a co-op workspace. */
export function coordinatorInviteEmail(input: {
  coopName: string;
  invitedBy: string;
  url: string;
}): EmailContent {
  const { html, text } = renderEmail({
    heading: `Join ${input.coopName} on Kithwheel`,
    body: [
      `${input.invitedBy} invited you to help coordinate ${input.coopName} on Kithwheel, where the co-op keeps its schedule, registration, announcements, fees and volunteer hours.`,
      'Open the link to accept. If you don’t have a Kithwheel account yet, you can create one with this email address. The invitation expires in 14 days.',
    ],
    cta: { label: 'Accept invitation', url: input.url },
    footer: 'If you weren’t expecting this, you can ignore this email.',
  });
  return { subject: `${input.invitedBy} invited you to coordinate ${input.coopName}`, html, text };
}

/** Sent to a family after they register (or a coordinator adds them). */
export function familyWelcomeEmail(input: {
  coopName: string;
  parentName: string;
  url: string;
  children: string[];
}): EmailContent {
  const { html, text } = renderEmail({
    heading: `You’re registered with ${input.coopName}`,
    body: [
      `Hi ${input.parentName}, thanks for registering ${input.children.join(', ')}.`,
      'Your coordinators will place each child in their grade’s classes and let you know. Once they do, your family page shows every class, materials list and announcement.',
      'Your family page also has fees and volunteer hours. Keep this link private; anyone with it can see your family’s page.',
    ],
    cta: { label: 'Open your family page', url: input.url },
    footer: `You received this because you registered with ${input.coopName} on Kithwheel.`,
  });
  return { subject: `Registration received: ${input.coopName}`, html, text };
}

/** Re-sends a family's private link. */
export function familyLinkEmail(input: {
  coopName: string;
  parentName: string;
  url: string;
}): EmailContent {
  const { html, text } = renderEmail({
    heading: `Your ${input.coopName} family page`,
    body: [
      `Hi ${input.parentName}, here is the link to your family page for ${input.coopName}.`,
      'Keep it private; anyone with the link can see your family’s page.',
    ],
    cta: { label: 'Open your family page', url: input.url },
    footer: `You received this because your family is registered with ${input.coopName} on Kithwheel.`,
  });
  return { subject: `Your ${input.coopName} family page`, html, text };
}

/** A coordinator's announcement to families. */
export function announcementEmail(input: {
  coopName: string;
  title: string;
  body: string;
  audience: string | null;
  url: string;
}): EmailContent {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const { html, text } = renderEmail({
    heading: input.title,
    body: [...(input.audience ? [`For families in ${input.audience}`] : []), ...paragraphs],
    cta: { label: 'Open your family page', url: input.url },
    footer: `Sent by ${input.coopName} through Kithwheel.`,
  });
  return {
    subject: `${input.coopName}: ${input.title}`,
    html: html.replace(/\n/g, '<br>'),
    text,
  };
}
