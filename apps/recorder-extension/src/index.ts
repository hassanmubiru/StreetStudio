/**
 * @streetstudio/recorder-extension
 *
 * Browser recorder extension entry point: start a capture from the browser
 * toolbar and upload through the public SDK. Composes `@streetstudio/recorder`
 * (capture + chunked/resumable upload client) and `@streetstudio/sdk`.
 */
export const DOMAIN =
  "Browser recorder extension: capture and upload from the browser toolbar." as const;
