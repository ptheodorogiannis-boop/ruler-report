// The language AI commentary is written in (spec v3 §4.4): one choice shared by the whole-report analysis and the per-block
// controls, defaulting from the workspace locale.
export const AI_LANGUAGES = ['English', 'Greek', 'Portuguese', 'Spanish', 'French', 'German', 'Italian'] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];

/** Greek workspaces write Greek commentary by default; everything else English. */
export function defaultAiLanguage(locale: string): AiLanguage {
  return locale === 'el' ? 'Greek' : 'English';
}
