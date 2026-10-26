import type { MetadataRoute } from 'next';

/** A private tool: nothing is meant to be indexed, including shared client links (they are unlisted, not public). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
