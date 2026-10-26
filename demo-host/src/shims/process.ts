// Injected as the `process` global in the browser build: the env the app's bundled modules read. The Anthropic key is a
// placeholder that makes the app take its AI path; the demo's fetch bridge answers that call through the viewer's Claude.
export const process = {
  env: { NODE_ENV: 'production', ANTHROPIC_API_KEY: 'demo-bridge', APP_URL: '' } as Record<string, string | undefined>,
  cwd: () => '/',
  platform: 'browser',
};
