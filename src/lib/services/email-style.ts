// The look of every email the app sends: mail clients cannot read the app's CSS variables, so these mirror the tokens in
// globals.css (ink, ink-3, hairline on white, up, down). One ink pill for the action, like .btn-primary.
export const MAIL = {
  font: 'Manrope,Segoe UI,Arial,sans-serif',
  ink: '#0e0e0e',
  muted: '#575756',
  line: '#d8d8d6',
  up: '#166534',
  down: '#a80100',
  onInk: '#ffffff',
} as const;

/** The opening of an email body: the app face, a readable measure, ink text. */
export const mailWrap = (width: number) => `<div style="font-family:${MAIL.font};max-width:${width}px;margin:auto;color:${MAIL.ink}">`;

/** An email heading: large and regular weight, like the page titles. */
export const mailTitle = (text: string) => `<h2 style="margin:0 0 8px;font-size:22px;font-weight:500">${text}</h2>`;

/** The one action of an email: an ink pill. `href` and `label` must already be escaped. */
export const mailButton = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${MAIL.ink};color:${MAIL.onInk};padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:500">${label}</a>`;
