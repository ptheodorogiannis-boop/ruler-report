// The 24-icon set shared by infographic tiles and block headers (spec v3 §4.3). Browser-safe, no React.
export const ICON_NAMES = ['trending-up', 'users', 'euro', 'target', 'phone', 'mail', 'cart', 'eye', 'mouse-pointer', 'heart', 'message-circle', 'calendar', 'map-pin', 'star', 'award', 'zap', 'bar-chart', 'pie-chart', 'activity', 'globe', 'megaphone', 'briefcase', 'clock', 'flag'] as const;
export type IconName = (typeof ICON_NAMES)[number];
export const isIconName = (s: unknown): s is IconName => typeof s === 'string' && (ICON_NAMES as readonly string[]).includes(s);
