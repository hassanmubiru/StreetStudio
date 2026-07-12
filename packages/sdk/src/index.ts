/**
 * @streetstudio/sdk
 *
 * Public client library providing typed access to every public REST and
 * WebSocket interface, guaranteeing UI/API parity.
 */
import type { Uuid } from "@streetstudio/shared";

export const DOMAIN =
  "Public client library for the StreetStudio REST and WebSocket API." as const;

/** Placeholder client configuration. */
export interface SdkClientOptions {
  readonly baseUrl: string;
  readonly organizationId?: Uuid;
}
