/**
 * @streetstudio/ai
 *
 * AI capability router. Routes transcription/summarization/etc. to the enabled
 * AI_Provider plugin, or rejects cleanly with `AI_UNAVAILABLE` when none is
 * enabled. Contains no vendor implementation — vendors live in plugins.
 */
export const DOMAIN =
  "AI capability router: routes AI requests to enabled provider plugins, or fails cleanly." as const;

export {
  AI_CAPABILITIES,
  AI_REJECT_BUDGET_MS,
  AI_REQUEST_TIMEOUT_MS,
  StreetAiRouter,
  AiProviderRegistry,
} from "./ai-router.js";
export type {
  AiCapability,
  AiRequest,
  AiResult,
  AiProviderHandler,
  AiProviderResolver,
  AiRouter,
  AiRouterOptions,
} from "./ai-router.js";
