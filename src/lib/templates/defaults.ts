import { INTEGRATIONS } from '@/lib/catalog/integrations';
import type { TemplateSection } from '@/lib/engine/types';

const slugs = (cat: string | string[]) => {
  const cats = Array.isArray(cat) ? cat : [cat];
  return INTEGRATIONS.filter((i) => cats.includes(i.category) && i.archetype !== 'custom').map((i) => i.slug);
};
const sec = (id: string, title: string, slugList: string[], keys: string[]): TemplateSection => ({
  id,
  title,
  widgets: slugList.flatMap((slug) => keys.map((key) => ({ slug, key }))),
});
/** A section whose widgets differ per platform family: [[slugs, keys], …] */
const parts = (id: string, title: string, groups: [string[], string[]][]): TemplateSection => ({
  id,
  title,
  widgets: groups.flatMap(([slugList, keys]) => slugList.flatMap((slug) => keys.map((key) => ({ slug, key })))),
});
const CUSTOM = INTEGRATIONS.filter((i) => i.archetype === 'custom').map((i) => i.slug);

const ADS = slugs('ads');
const SOCIAL = slugs('social').filter((s) => s !== 'youtube');
const WEB = slugs('analytics');
const ECOM = slugs('ecommerce');
const CRM = slugs('crm');
const EMAIL = slugs('email').filter((s) => s !== 'greatpages');

export interface PlatformTemplate {
  title: string;
  description: string;
  kind: 'report' | 'dashboard';
  isDefault?: boolean;
  sections: TemplateSection[];
}

export const PLATFORM_TEMPLATES: PlatformTemplate[] = [
  {
    title: 'Default report',
    description: 'One-stop multichannel report: paid media, social, website, search, local, e-commerce, CRM, email and calls.',
    kind: 'report',
    isDefault: true,
    sections: [
      sec('ads', 'Paid media', ADS, ['spend', 'impressions', 'reach', 'link_clicks', 'ctr', 'cpc', 'conversions', 'cost_per_conversion', 'roas', 'spend_by_date', 'campaigns']),
      sec('social', 'Social media', SOCIAL, ['followers', 'follower_growth', 'reach', 'engagements', 'engagement_rate', 'posts', 'followers_by_date', 'top_posts']),
      sec('video', 'YouTube', ['youtube'], ['views', 'watch_time', 'subscribers', 'new_subs', 'views_by_date', 'top_videos']),
      sec('web', 'Website', WEB, ['sessions', 'users', 'engagement_rate', 'conversions', 'revenue', 'sessions_by_date', 'sessions_by_channel', 'top_pages']),
      sec('seo', 'Search visibility', ['search_console'], ['clicks', 'impressions', 'ctr', 'position', 'clicks_impressions_by_date', 'queries']),
      sec('local', 'Local presence', ['google_my_business'], ['views_search', 'views_maps', 'calls', 'direction_requests', 'website_clicks', 'views_by_date']),
      sec('ecom', 'E-commerce', ECOM, ['revenue', 'orders', 'aov', 'new_customers', 'revenue_by_date', 'top_products']),
      sec('crm', 'CRM & leads', CRM, ['leads', 'deals_won', 'won_value', 'win_rate', 'leads_by_date', 'by_source']),
      sec('email', 'Email marketing', EMAIL, ['sent', 'open_rate', 'click_rate', 'revenue', 'subscribers', 'campaigns']),
      sec('calls', 'Call tracking', slugs('calls'), ['calls', 'answered', 'missed', 'qualified', 'answer_rate', 'calls_by_date']),
      sec('custom', 'Custom data', CUSTOM, ['rows', 'rows_by_date']),
    ],
  },
  {
    title: 'Executive summary',
    description: 'A single page of headline KPIs for decision makers.',
    kind: 'report',
    sections: [
      sec('ads', 'Investment & results', ADS, ['spend', 'conversions', 'roas']),
      sec('web', 'Website', WEB, ['sessions', 'conversions', 'revenue']),
      sec('social', 'Audience', SOCIAL, ['followers', 'engagement_rate']),
      sec('ecom', 'Sales', ECOM, ['revenue', 'orders']),
      sec('crm', 'Pipeline', CRM, ['leads', 'won_value']),
    ],
  },
  {
    title: 'Social media report',
    description: 'Organic performance per network: growth, reach, engagement, audience and best content.',
    kind: 'report',
    sections: [
      parts('growth', 'Audience growth', [[SOCIAL, ['followers', 'follower_growth', 'new_followers', 'followers_by_date']], [['youtube'], ['subscribers', 'new_subs', 'subscribers_by_date']]]),
      sec('reach', 'Reach & engagement', SOCIAL, ['reach', 'impressions', 'views', 'engagements', 'engagement_rate', 'likes', 'comments', 'shares', 'saves', 'reach_by_date', 'engagement_by_date']),
      sec('audience', 'Audience', SOCIAL, ['audience_age', 'audience_gender', 'audience_country', 'audience_city', 'followers_online_by_hour']),
      sec('content', 'Content', SOCIAL, ['posts', 'engagement_by_content_type', 'top_posts']),
      sec('video', 'YouTube', ['youtube'], ['views', 'watch_time', 'avg_view_duration', 'views_by_date', 'views_by_traffic_source', 'top_videos']),
    ],
  },
  {
    title: 'Paid media performance',
    description: 'Deep dive for ad accounts: delivery, efficiency, results, funnel, audience and campaign/ad-set/ad tables.',
    kind: 'report',
    sections: [
      sec('kpi', 'Key results', ADS, ['spend', 'impressions', 'reach', 'link_clicks', 'ctr', 'cpc', 'cpm', 'frequency', 'conversions', 'cost_per_conversion', 'conversion_value', 'roas']),
      sec('trend', 'Trends', ADS, ['spend_by_date', 'impressions_reach_by_date', 'clicks_ctr_by_date', 'conversions_by_date']),
      sec('platform', 'By platform', ['facebook_ads'], ['reach_facebook', 'reach_instagram', 'spend_facebook', 'spend_instagram', 'ctr_facebook', 'ctr_instagram']),
      sec('audience', 'Audience', ADS, ['impressions_reach_by_age', 'impressions_reach_by_gender', 'reach_by_device', 'impressions_reach_by_hour']),
      sec('funnel', 'Funnel', ADS, ['funnel']),
      sec('tables', 'Campaigns, ad sets and ads', ADS, ['campaigns', 'adsets', 'ads']),
    ],
  },
  {
    title: 'E-commerce report',
    description: 'Revenue, orders, AOV, funnel and acquisition across store, analytics, ads and email.',
    kind: 'report',
    sections: [
      sec('sales', 'Sales', ECOM, ['revenue', 'orders', 'aov', 'items_sold', 'new_customers', 'returning_customers', 'refunds', 'revenue_by_date', 'top_products', 'coupons']),
      sec('web', 'Store traffic', WEB, ['sessions', 'users', 'conversion_rate', 'transactions', 'revenue', 'abandoned_carts', 'sessions_by_channel', 'funnel', 'products']),
      sec('ads', 'Advertising', ADS, ['spend', 'purchases', 'conversion_value', 'roas', 'cost_per_purchase', 'spend_by_date']),
      sec('email', 'Email', EMAIL, ['sent', 'open_rate', 'click_rate', 'revenue']),
      sec('seo', 'Search', ['search_console'], ['clicks', 'impressions', 'queries']),
    ],
  },
  {
    title: 'Lead generation report',
    description: 'Leads, cost per lead, calls, CRM pipeline and custom lead sheets.',
    kind: 'report',
    sections: [
      sec('ads', 'Lead campaigns', ADS, ['spend', 'leads', 'cost_per_lead', 'ctr', 'cpc', 'leads']),
      sec('calls', 'Calls', slugs('calls'), ['calls', 'answered', 'missed', 'qualified', 'answer_rate', 'calls_by_source', 'calls_by_date']),
      sec('local', 'Google Business Profile actions', ['google_my_business'], ['calls', 'direction_requests', 'website_clicks', 'messages', 'bookings']),
      sec('crm', 'CRM pipeline', CRM, ['leads', 'qualified', 'deals_created', 'deals_won', 'win_rate', 'won_value', 'by_source', 'by_owner', 'funnel']),
      sec('web', 'Website conversions', WEB, ['sessions', 'conversions', 'conversion_rate', 'conversions_by_date', 'source_medium']),
      sec('custom', 'Lead sheets', CUSTOM, ['rows', 'rows_by_date', 'all_by_date']),
    ],
  },
  {
    title: 'SEO & website report',
    description: 'Search Console and analytics together: visibility, traffic, engagement, landing pages.',
    kind: 'report',
    sections: [
      sec('seo', 'Search performance', ['search_console'], ['clicks', 'impressions', 'ctr', 'position', 'clicks_impressions_by_date', 'position_by_date', 'queries', 'pages', 'countries', 'clicks_by_device']),
      sec('web', 'Traffic & engagement', WEB, ['sessions', 'users', 'new_users', 'pageviews', 'engagement_rate', 'avg_session_duration', 'sessions_by_date', 'sessions_by_channel', 'sessions_by_device', 'sessions_by_country']),
      sec('pages', 'Pages', WEB, ['top_pages', 'landing_pages', 'source_medium', 'countries']),
    ],
  },
  {
    title: 'Local business report',
    description: 'Google Business Profile visibility and actions plus reviews.',
    kind: 'report',
    sections: [sec('local', 'Business Profile', ['google_my_business'], ['views_search', 'views_maps', 'calls', 'direction_requests', 'website_clicks', 'messages', 'bookings', 'new_reviews', 'rating', 'views_by_date', 'actions_by_date', 'search_terms'])],
  },
  {
    title: 'Default dashboard',
    description: 'Live view of the headline numbers across every connected channel.',
    kind: 'dashboard',
    isDefault: true,
    sections: [
      sec('ads', 'Paid media', ADS, ['spend', 'impressions', 'link_clicks', 'ctr', 'conversions', 'roas', 'spend_by_date']),
      parts('social', 'Social', [[SOCIAL, ['followers', 'reach', 'engagement_rate', 'views']], [['youtube'], ['subscribers', 'views']]]),
      sec('web', 'Website', WEB, ['sessions', 'users', 'conversions', 'revenue', 'sessions_by_date']),
      sec('seo', 'Search', ['search_console'], ['clicks', 'impressions', 'position']),
      sec('ecom', 'E-commerce', ECOM, ['revenue', 'orders', 'aov', 'revenue_by_date']),
      sec('crm', 'CRM', CRM, ['leads', 'deals_won', 'won_value']),
      sec('calls', 'Calls', slugs('calls'), ['calls', 'qualified', 'calls_by_date']),
      sec('local', 'Local', ['google_my_business'], ['views_search', 'calls', 'direction_requests']),
      sec('custom', 'Custom data', CUSTOM, ['rows', 'rows_by_date']),
    ],
  },
  {
    title: 'Ads live dashboard',
    description: 'Real-time pacing view for paid media accounts.',
    kind: 'dashboard',
    sections: [sec('kpi', 'Today’s picture', ADS, ['spend', 'impressions', 'link_clicks', 'ctr', 'cpc', 'conversions', 'roas', 'spend_by_date', 'clicks_ctr_by_date', 'campaigns'])],
  },
];
