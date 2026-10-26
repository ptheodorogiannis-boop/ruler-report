// The app's AI code calls https://api.anthropic.com/v1/messages with fetch. In the demo that one call is answered by the
// viewer's Claude through the page's `sample` capability; when that is unavailable the call fails with a readable
// message and the app's own rule-based fallback takes over, exactly as it does without an API key.
export type SampleFn = (input: string, options?: Record<string, unknown>) => Promise<{ text: string }>;

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

const MESSAGES: Record<string, string> = {
  not_granted: 'Claude is not available in this view',
  sampling_disabled: 'Claude is not available in this view',
  capability_disabled: 'Claude is not available in this view',
  capability_removed: 'Claude is not available in this view',
  not_declared: 'Claude is not available in this view',
  rate_limited: 'Claude is busy right now, try again in a minute',
  refused: 'Claude declined this request',
  session_expired: 'Sign in to Claude again to use the AI analysis',
};

const fail = (message: string) => new Response(message, { status: 503, headers: { 'content-type': 'text/plain' } });

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function promptOf(body: any): string {
  const content = (c: any) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p?.text ?? '').join('') : '');
  const user = (body?.messages ?? []).map((m: any) => content(m.content)).join('\n\n');
  return [body?.system ?? '', user].filter(Boolean).join('\n\n');
}

/** Wrap `target.fetch` (globalThis by default) so the Anthropic call goes to `sample`. Other requests pass through. */
export function installAnthropicBridge(getSample: () => Promise<SampleFn | null>, target: { fetch: typeof fetch } = globalThis): void {
  const prev = target.fetch.bind(target);
  target.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!urlOf(input).startsWith(ANTHROPIC)) return prev(input, init);
    try {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const sample = await getSample();
      if (!sample) return fail(MESSAGES.not_granted);
      // block analyses (900 tokens) and Ask (700) are short: the quick tier answers in seconds; the full analysis keeps the default tier (review I3)
      const modelTier = Number(body?.max_tokens ?? 1400) <= 900 ? 'quick' : 'default';
      const { text } = await sample(promptOf(body), { modelTier });
      return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      return fail(MESSAGES[code] ?? 'Claude did not answer');
    }
  }) as typeof fetch;
}
