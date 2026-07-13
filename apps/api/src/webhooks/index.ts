/**
 * Webhooks for the API_Service (Requirement 19).
 *
 * Groups the outbound-webhook building blocks:
 *
 *  - {@link WebhookService}: register/delete subscriptions with HTTPS-only,
 *    ≤2048-character URL validation and supported-event-type checking (R19.1,
 *    R19.2), and deletion that stops further delivery (R19.7).
 *  - {@link WebhookDeliveryWorker}: signed delivery within 30s, a 10s
 *    per-attempt response timeout, and up to 5 bounded retries with
 *    non-decreasing exponential backoff, recording failed deliveries once
 *    exhausted (R19.3, R19.4, R19.5, R19.6).
 *  - {@link signPayload} / {@link verifySignature}: HMAC-SHA256 payload signing
 *    and verification so receivers can authenticate deliveries (R19.4).
 *
 * The network and time are behind injectable seams
 * ({@link WebhookDeliveryClient}, {@link Sleeper}, {@link Clock},
 * {@link WebhookStore}, {@link WebhookAuthorizer}) so the whole path is testable
 * without a real network, and `repositoryWebhookStore` adapts the seam to
 * `@streetstudio/database` for composition-root wiring.
 */
export {
  DEFAULT_SUPPORTED_EVENT_TYPES,
  MAX_WEBHOOK_URL_LENGTH,
  WebhookService,
  isValidWebhookUrl,
  repositoryWebhookStore,
  toWebhookDto,
} from "./webhook-service.js";
export type {
  WebhookAuthorizer,
  WebhookServiceDeps,
  WebhookStore,
} from "./webhook-service.js";

export {
  DEFAULT_BASE_BACKOFF_MS,
  MAX_RETRIES,
  RESPONSE_TIMEOUT_MS,
  WebhookDeliveryWorker,
  realSleeper,
} from "./delivery.js";
export type {
  DeliveryRecorder,
  PlatformEvent,
  Sleeper,
  WebhookDeliveryClient,
  WebhookDeliveryOutcome,
  WebhookDeliveryRequest,
  WebhookDeliveryResponse,
  WebhookDeliveryWorkerDeps,
} from "./delivery.js";

export { SIGNATURE_HEADER, signPayload, verifySignature } from "./signature.js";
