// `src/lib/services/webhooks.ts` in the demo: nothing is delivered (out of scope per the spec).
export async function emitEvent(..._args: unknown[]): Promise<void> {}
export async function deliverWebhook(..._args: unknown[]): Promise<void> {}
