/**
 * Router transition styles, injected as an inline <style> element.
 *
 * Previously the transition CSS was loaded by `fetch()`-ing the stylesheet
 * (either a dev-only `/src/styles/...` path that 404s in production, or a
 * `new URL(...)` that Vite inlines as a `data:text/css` URL). Fetching a `data:`
 * URL is blocked by the app's Content-Security-Policy (`connect-src`), so the
 * transitions silently failed to load in the production build. Shipping the CSS
 * as a string and injecting it via a <style> element (permitted by
 * `style-src 'unsafe-inline'`) avoids any network fetch and the CSP violation.
 */

/** The router transition/animation stylesheet (mirrors router-transitions.css). */
export const ROUTER_TRANSITIONS_CSS = `
/* Router view container */
[data-router-view] { position: relative; overflow: hidden; }

/* Loading state */
[data-router-view].router-loading { pointer-events: none; }
[data-router-view].router-loading::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, #3b82f6, transparent);
  animation: loading-progress 1.5s ease-in-out infinite; z-index: 1000;
}
@keyframes loading-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

/* Fade transitions */
[data-router-view].router-fade-out { opacity: 0; transition: opacity 150ms ease-out; }
[data-router-view].router-fade-in { opacity: 0; animation: fade-in 150ms ease-out forwards; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

/* Slide transitions */
[data-router-view].router-slide-out { transform: translateX(-20px); opacity: 0; transition: transform 150ms ease-out, opacity 150ms ease-out; }
[data-router-view].router-slide-in { transform: translateX(20px); opacity: 0; animation: slide-in 150ms ease-out forwards; }
@keyframes slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* Accessibility: respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  [data-router-view].router-fade-out, [data-router-view].router-fade-in,
  [data-router-view].router-slide-out, [data-router-view].router-slide-in {
    animation: none; transition: none; transform: none; opacity: 1;
  }
  [data-router-view].router-loading::after { animation: none; }
}

/* High contrast */
@media (prefers-contrast: high) { [data-router-view].router-loading::after { background: currentColor; } }

/* Focus management during transitions */
[data-router-view].router-loading *:focus,
[data-router-view].router-fade-out *:focus,
[data-router-view].router-slide-out *:focus { outline: none; }

/* Error state */
[data-router-view].router-error { background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px; }
[data-router-view].router-error .error-message { color: #dc2626; font-weight: 500; margin-bottom: 8px; }
[data-router-view].router-error .error-actions { display: flex; gap: 8px; margin-top: 12px; }

/* Dark mode */
@media (prefers-color-scheme: dark) {
  [data-router-view].router-error { background-color: #1f1f1f; border-color: #404040; }
  [data-router-view].router-error .error-message { color: #ef4444; }
  [data-router-view].router-loading::after { background: linear-gradient(90deg, transparent, #60a5fa, transparent); }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  [data-router-view].router-fade-out, [data-router-view].router-fade-in,
  [data-router-view].router-slide-out, [data-router-view].router-slide-in {
    transition-duration: 100ms; animation-duration: 100ms;
  }
  [data-router-view].router-slide-out { transform: translateX(-10px); }
}
`;

/** Inject the transition stylesheet once (idempotent, SSR-safe). */
export function ensureRouterTransitionStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("router-transitions-styles")) return;
  const style = document.createElement("style");
  style.id = "router-transitions-styles";
  style.textContent = ROUTER_TRANSITIONS_CSS;
  document.head.appendChild(style);
}
