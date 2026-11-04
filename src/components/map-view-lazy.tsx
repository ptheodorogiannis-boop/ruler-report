'use client';

// Loads the interactive map only on pages that have one, so other reports stay within their size budget.
import dynamic from 'next/dynamic';

export const MapViewLazy = dynamic(() => import('./map-view'), {
  ssr: false,
  loading: () => <div className="map-stage map-loading" aria-busy="true" />,
});
