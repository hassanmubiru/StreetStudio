/**
 * @streetstudio/recording
 *
 * Public entry point for Recorder capture and the chunked/resumable upload
 * client. Consumed by the web and desktop clients.
 */
export const DOMAIN =
  "Recorder capture and chunked/resumable upload client logic." as const;

/** Sources a recording may capture. */
export interface CaptureSources {
  readonly screen: boolean;
  readonly camera?: boolean;
  readonly microphone?: boolean;
  readonly systemAudio?: boolean;
}
