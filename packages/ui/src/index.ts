/**
 * @streetstudio/ui
 *
 * Public entry point for shared UI components used by the web and desktop
 * clients.
 */
export const DOMAIN = "Shared UI components for web and desktop clients." as const;

// Design System
export * from './design-system.js';

// Utilities
export * from './utils.js';

// Components
export * from './components/button.js';
export * from './components/input.js';
export * from './components/modal.js';
export * from './components/toast.js';
