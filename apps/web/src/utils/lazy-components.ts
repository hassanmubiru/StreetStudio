/**
 * Lazy Loading Components
 * 
 * Provides lazy loading wrappers for heavy components like the editor and player.
 * Uses dynamic imports with loading state management and error handling.
 * 
 * Requirements: 12.2, 12.5
 */

import { createLazyModule, ModuleLoadError, type LazyModuleOptions } from './code-splitting.js';

export type ComponentState = 'idle' | 'loading' | 'loaded' | 'error';

export interface LazyComponentConfig {
  /** Factory function returning a dynamic import */
  factory: () => Promise<any>;
  /** The element to render into */
  container: HTMLElement;
  /** Fallback content shown while loading */
  fallback?: HTMLElement | (() => HTMLElement);
  /** Error content shown on failure */
  errorFallback?: (error: Error, retry: () => void) => HTMLElement;
  /** Options for the underlying lazy module loader */
  loadOptions?: LazyModuleOptions;
  /** Mount function called once module is loaded */
  mount?: (module: any, container: HTMLElement) => void;
}

export interface LazyComponentInstance {
  /** Current state of the component */
  state: ComponentState;
  /** Load the component */
  load: () => Promise<void>;
  /** Retry loading after error */
  retry: () => Promise<void>;
  /** Destroy and clean up */
  destroy: () => void;
}

/**
 * Create a lazy-loaded component with loading and error states.
 */
export function createLazyComponent(config: LazyComponentConfig): LazyComponentInstance {
  const { factory, container, fallback, errorFallback, loadOptions, mount } = config;
  let state: ComponentState = 'idle';
  let loadedModule: any = null;

  const loader = createLazyModule(factory, {
    ...loadOptions,
    onLoadStart: () => {
      state = 'loading';
      showFallback();
      loadOptions?.onLoadStart?.();
    },
    onLoadComplete: (module) => {
      state = 'loaded';
      loadedModule = module;
      loadOptions?.onLoadComplete?.(module);
    },
    onLoadError: (error) => {
      state = 'error';
      loadOptions?.onLoadError?.(error);
    },
  });

  function showFallback(): void {
    container.innerHTML = '';
    container.setAttribute('aria-busy', 'true');
    container.setAttribute('role', 'progressbar');

    if (fallback) {
      const fallbackEl = typeof fallback === 'function' ? fallback() : fallback.cloneNode(true) as HTMLElement;
      container.appendChild(fallbackEl);
    }
  }

  function showError(error: Error): void {
    container.innerHTML = '';
    container.removeAttribute('aria-busy');
    container.removeAttribute('role');

    if (errorFallback) {
      const errorEl = errorFallback(error, () => instance.retry());
      container.appendChild(errorEl);
    } else {
      const defaultError = document.createElement('div');
      defaultError.className = 'lazy-component-error';
      defaultError.setAttribute('role', 'alert');
      defaultError.innerHTML = `
        <p>Failed to load component</p>
        <button class="retry-button" aria-label="Retry loading">Retry</button>
      `;
      const retryBtn = defaultError.querySelector('.retry-button');
      retryBtn?.addEventListener('click', () => instance.retry());
      container.appendChild(defaultError);
    }
  }

  function mountModule(module: any): void {
    container.innerHTML = '';
    container.removeAttribute('aria-busy');
    container.removeAttribute('role');

    if (mount) {
      mount(module, container);
    }
  }

  const instance: LazyComponentInstance = {
    get state() { return state; },
    set state(s: ComponentState) { state = s; },

    async load(): Promise<void> {
      if (state === 'loaded' && loadedModule) {
        mountModule(loadedModule);
        return;
      }

      try {
        state = 'loading';
        showFallback();
        const module = await loader();
        state = 'loaded';
        loadedModule = module;
        mountModule(module);
      } catch (error) {
        state = 'error';
        showError(error instanceof Error ? error : new Error(String(error)));
      }
    },

    async retry(): Promise<void> {
      state = 'idle';
      loadedModule = null;
      await instance.load();
    },

    destroy(): void {
      state = 'idle';
      loadedModule = null;
      container.innerHTML = '';
      container.removeAttribute('aria-busy');
      container.removeAttribute('role');
    },
  };

  return instance;
}

/**
 * Pre-configured lazy loaders for heavy application components.
 */
export const LazyEditor = (container: HTMLElement, mount?: (mod: any, el: HTMLElement) => void) =>
  createLazyComponent({
    factory: () => import('../components/timeline/timeline-editor.js'),
    container,
    fallback: () => createEditorSkeleton(),
    mount,
    loadOptions: { retries: 2, timeout: 30000 },
  });

export const LazyVideoPlayer = (container: HTMLElement, mount?: (mod: any, el: HTMLElement) => void) =>
  createLazyComponent({
    factory: () => import('../components/media/video-player.js'),
    container,
    fallback: () => createPlayerSkeleton(),
    mount,
    loadOptions: { retries: 2, timeout: 20000 },
  });

export const LazyCollaborativeEditing = (container: HTMLElement, mount?: (mod: any, el: HTMLElement) => void) =>
  createLazyComponent({
    factory: () => import('../components/timeline/collaborative-editing.js'),
    container,
    fallback: () => createGenericSkeleton('Loading collaboration tools...'),
    mount,
    loadOptions: { retries: 2, timeout: 20000 },
  });

/**
 * Create a skeleton element for the editor.
 */
function createEditorSkeleton(): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-editor';
  skeleton.setAttribute('aria-label', 'Loading editor...');
  skeleton.innerHTML = `
    <div class="skeleton-timeline" aria-hidden="true">
      <div class="skeleton-pulse skeleton-track"></div>
      <div class="skeleton-pulse skeleton-track"></div>
      <div class="skeleton-pulse skeleton-controls"></div>
    </div>
  `;
  return skeleton;
}

/**
 * Create a skeleton element for the video player.
 */
function createPlayerSkeleton(): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-player';
  skeleton.setAttribute('aria-label', 'Loading video player...');
  skeleton.innerHTML = `
    <div class="skeleton-video-area" aria-hidden="true">
      <div class="skeleton-pulse skeleton-video"></div>
      <div class="skeleton-pulse skeleton-player-controls"></div>
    </div>
  `;
  return skeleton;
}

/**
 * Create a generic skeleton with a message.
 */
function createGenericSkeleton(message: string): HTMLElement {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-generic';
  skeleton.setAttribute('aria-label', message);
  skeleton.innerHTML = `
    <div class="skeleton-pulse skeleton-block" aria-hidden="true"></div>
    <div class="skeleton-pulse skeleton-block skeleton-block--short" aria-hidden="true"></div>
  `;
  return skeleton;
}
