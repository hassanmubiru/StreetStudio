/**
 * Router Styles Loader
 *
 * Injects the router transition CSS as an inline <style> element on import.
 * Previously this `fetch()`-ed `/src/styles/router-transitions.css`, which only
 * exists on the Vite dev server (404 in production). The transition CSS now
 * lives in `../styles/router-transitions.ts` and is injected inline (no fetch,
 * no CSP `connect-src` issue).
 */
import { ensureRouterTransitionStyles } from '../styles/router-transitions';

ensureRouterTransitionStyles();
