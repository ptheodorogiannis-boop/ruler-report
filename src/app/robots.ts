import type { MetadataRoute } from 'next';

/**
 * A private tool: nothing is meant to be indexed, including shared client links (they are unlisted, not public). The
 * exceptions are the public home page, the privacy policy and the terms, which Google's OAuth verification looks for.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/$', '/privacy', '/terms'], disallow: '/' } };
}
