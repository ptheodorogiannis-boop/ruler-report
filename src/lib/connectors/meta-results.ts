// What counts as a "result" for a Meta ad or ad set (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1).
// Meta documents no per-ad results field, so the type comes from the ad set's optimisation: optimization_goal plus its
// promoted_object map to the action_type whose count in `actions` is the result.

/** custom_event_type → the pixel action name (lower case, except CONTENT_VIEW → view_content and INITIATED_CHECKOUT →
 * initiate_checkout, as the insights actions name them). CONTACT, SCHEDULE, SUBMIT_APPLICATION, START_TRIAL and SUBSCRIBE are
 * not yet checked against a live account. */
const PIXEL_EVENTS: Record<string, string> = {
  PURCHASE: 'purchase',
  ADD_TO_CART: 'add_to_cart',
  LEAD: 'lead',
  COMPLETE_REGISTRATION: 'complete_registration',
  INITIATED_CHECKOUT: 'initiate_checkout',
  CONTENT_VIEW: 'view_content',
  ADD_PAYMENT_INFO: 'add_payment_info',
  ADD_TO_WISHLIST: 'add_to_wishlist',
  SEARCH: 'search',
  CONTACT: 'contact',
  SCHEDULE: 'schedule',
  SUBMIT_APPLICATION: 'submit_application',
  START_TRIAL: 'start_trial',
  SUBSCRIBE: 'subscribe',
  OTHER: 'custom',
};
const GOALS: Record<string, string> = {
  LINK_CLICKS: 'link_click',
  LANDING_PAGE_VIEWS: 'landing_page_view',
  LEAD_GENERATION: 'lead',
  CONVERSATIONS: 'onsite_conversion.messaging_conversation_started_7d',
  THRUPLAY: 'video_thruplay_watched',
};

export function promotedObjectAction(optimizationGoal: string | undefined, promoted?: { custom_event_type?: string; custom_conversion_id?: string }): string | null {
  if (promoted?.custom_conversion_id) return `offsite_conversion.custom.${promoted.custom_conversion_id}`;
  if (optimizationGoal === 'OFFSITE_CONVERSIONS' || optimizationGoal === 'VALUE') {
    const ev = PIXEL_EVENTS[promoted?.custom_event_type ?? ''];
    return ev ? `offsite_conversion.fb_pixel_${ev}` : null;
  }
  return GOALS[optimizationGoal ?? ''] ?? null;
}

/** The i18n key of a known result type (dots become underscores): results.offsite_conversion_fb_pixel_purchase */
const keyOf = (type: string) => `results.${type.replace(/\./g, '_')}`;

/** A result type in plain words: a translated label for the common ones, else Meta's name humanised; none → a dash. */
export function resultLabel(actionType: string | null | undefined, t: (key: string) => string): string {
  if (!actionType) return '–';
  const k = keyOf(actionType);
  const s = t(k);
  if (s && s !== k) return s;
  // offsite_conversion.fb_pixel_custom → "Fb pixel custom"
  const text = actionType.replace(/^(offsite|onsite)_conversion\./, '').split(/[._]/).filter(Boolean).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
