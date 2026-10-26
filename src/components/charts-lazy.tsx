'use client';

// Recharts travels only with pages that render a chart (docs/DESIGN.md › Pass 5): the chart module is split off and
// fetched when a chart widget is on the page. The split has to be declared in a client module: a dynamic import
// written in a server component is collected into the page's client entry and ships with it anyway. Charts are still
// server-rendered (the chart box is in the HTML), so nothing shifts while the module arrives.
import dynamic from 'next/dynamic';

const loading = () => <div className="chart-loading" aria-hidden="true" />;

export const TimeChart = dynamic(() => import('./charts').then((m) => m.TimeChart), { loading });
export const CategoryChart = dynamic(() => import('./charts').then((m) => m.CategoryChart), { loading });
