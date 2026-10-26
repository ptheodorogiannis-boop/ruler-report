/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_DIST_DIR lets a production build/start live next to a running dev server (default .next)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // playwright drives the PDF service (src/lib/services/pdf.ts) and must not be bundled
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'nodemailer', 'playwright', 'playwright-core'],
  poweredByHeader: false,
};
export default nextConfig;
