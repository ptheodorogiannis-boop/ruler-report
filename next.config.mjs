// On Vercel without APP_URL, links in e-mails, the API docs and client links use the project's production address
// (VERCEL_PROJECT_PRODUCTION_URL is set at build and run time, without the protocol). A preview uses its stable branch
// address instead (VERCEL_BRANCH_URL, e.g. ruler-report-git-v4-<scope>.vercel.app), so the Google / Meta sign-in comes
// back to the preview that started it rather than to production. An explicit APP_URL always wins.
const vercelUrl =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL ? process.env.VERCEL_BRANCH_URL : process.env.VERCEL_PROJECT_PRODUCTION_URL;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: !process.env.APP_URL && vercelUrl ? { APP_URL: `https://${vercelUrl}` } : {},
  // NEXT_DIST_DIR lets a production build/start live next to a running dev server (default .next)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // playwright drives the PDF service (src/lib/services/pdf.ts) and must not be bundled
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'nodemailer', 'playwright', 'playwright-core', '@sparticuz/chromium'],
  // the serverless Chromium (src/lib/services/pdf.ts) is loaded at run time, so its packed binary is traced in by hand
  outputFileTracingIncludes: {
    '/api/pdf/[token]': ['./node_modules/@sparticuz/chromium/**'],
    '/api/cron/tick': ['./node_modules/@sparticuz/chromium/**'],
  },
  poweredByHeader: false,
};
export default nextConfig;
