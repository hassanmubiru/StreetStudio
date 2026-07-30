/**
 * Code Splitting Utilities
 * 
 * Provides dynamic import wrappers, route-based code splitting,
 * and module preloading for optimized bundle delivery.
 * 
 * Requirements: 12.2, 12.5
 */

export interface LazyModuleOptions {
  /** Optional chunk name for build tool to use */
  chunkName?: string;
  /** Timeout in ms before loading is considered failed */
  timeout?: number;
  /** Retry count on failure */
  retries?: number;
  /** Delay between retries in ms */
  retryDelay?: number;
  /** Callback when loading starts */
  onLoadStart?: () => void;
  /** Callback when loading completes */
  onLoadComplete?: (module: any) => void;
  /** Callback on error */
  onLoadError?: (error: Error) => void;
}

export interface LazyModuleResult<T> {
  module: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => Promise<T>;
}

export type ModuleFactory<T> = () => Promise<T>;

/**
 * Cache for loaded modules to avoid duplicate network requests.
 */
const moduleCache = new Map<string, any>();

/**
 * Set of module keys currently being loaded (prevents duplicate concurrent loads).
 */
const pendingLoads = new Map<string, Promise<any>>();

/**
 * Create a lazy-loadable module wrapper with retry logic and timeout support.
 */
export function createLazyModule<T>(
  factory: ModuleFactory<T>,
  options: LazyModuleOptions = {}
): () => Promise<T> {
  const {
    timeout = 30000,
    retries = 2,
    retryDelay = 1000,
    onLoadStart,
    onLoadComplete,
    onLoadError,
  } = options;

  const cacheKey = factory.toString();

  return async (): Promise<T> => {
    // Return from cache if available
    if (moduleCache.has(cacheKey)) {
      return moduleCache.get(cacheKey) as T;
    }

    // Return pending load if one is already in progress
    if (pendingLoads.has(cacheKey)) {
      return pendingLoads.get(cacheKey) as Promise<T>;
    }

    const loadPromise = loadWithRetry<T>(factory, {
      timeout,
      retries,
      retryDelay,
      onLoadStart,
      onLoadComplete,
      onLoadError,
    });

    pendingLoads.set(cacheKey, loadPromise);

    try {
      const result = await loadPromise;
      moduleCache.set(cacheKey, result);
      return result;
    } finally {
      pendingLoads.delete(cacheKey);
    }
  };
}

/**
 * Load a module with retry logic and timeout.
 */
async function loadWithRetry<T>(
  factory: ModuleFactory<T>,
  options: {
    timeout: number;
    retries: number;
    retryDelay: number;
    onLoadStart?: () => void;
    onLoadComplete?: (module: any) => void;
    onLoadError?: (error: Error) => void;
  }
): Promise<T> {
  const { timeout, retries, retryDelay, onLoadStart, onLoadComplete, onLoadError } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt === 0) {
        onLoadStart?.();
      }

      const module = await withTimeout(factory(), timeout);
      onLoadComplete?.(module);
      return module;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < retries) {
        await delay(retryDelay * Math.pow(2, attempt));
      }
    }
  }

  onLoadError?.(lastError!);
  throw new ModuleLoadError(
    `Failed to load module after ${retries + 1} attempts`,
    lastError!
  );
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ModuleLoadError(`Module load timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Delay execution for specified milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Custom error class for module loading failures.
 */
export class ModuleLoadError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ModuleLoadError';
    this.cause = cause;
  }
}

/**
 * Route-based code splitting configuration.
 * Maps route patterns to their dynamic import factories.
 */
export interface RouteSplitConfig {
  path: string;
  factory: ModuleFactory<any>;
  preload?: boolean;
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Manages route-based code splitting with preloading and priority.
 */
export class RouteSplitManager {
  private routes: Map<string, RouteSplitConfig> = new Map();
  private preloadQueue: RouteSplitConfig[] = [];
  private isPreloading = false;

  /**
   * Register a route for code splitting.
   */
  public registerRoute(config: RouteSplitConfig): void {
    this.routes.set(config.path, config);

    if (config.preload) {
      this.preloadQueue.push(config);
    }
  }

  /**
   * Load the module for a given route path.
   */
  public async loadRoute(path: string): Promise<any> {
    const config = this.findRouteConfig(path);
    if (!config) {
      throw new Error(`No route configuration found for path: ${path}`);
    }

    const loader = createLazyModule(config.factory, {
      retries: 2,
      timeout: 30000,
    });

    return loader();
  }

  /**
   * Start preloading registered routes based on priority.
   * Uses requestIdleCallback for non-blocking preloading.
   */
  public startPreloading(): void {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;

    // Sort by priority
    const sorted = [...this.preloadQueue].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (priorityOrder[a.priority || 'medium']) - (priorityOrder[b.priority || 'medium']);
    });

    this.preloadSequentially(sorted);
  }

  /**
   * Preload route by path (e.g., on hover/focus).
   */
  public async preloadRoute(path: string): Promise<void> {
    const config = this.findRouteConfig(path);
    if (!config) return;

    const loader = createLazyModule(config.factory, { retries: 1, timeout: 15000 });
    try {
      await loader();
    } catch {
      // Silently fail preloads
    }
  }

  /**
   * Get all registered route paths.
   */
  public getRegisteredRoutes(): string[] {
    return Array.from(this.routes.keys());
  }

  /**
   * Clear the module cache (useful for testing or forcing re-fetch).
   */
  public clearCache(): void {
    moduleCache.clear();
  }

  private findRouteConfig(path: string): RouteSplitConfig | undefined {
    // Exact match first
    if (this.routes.has(path)) {
      return this.routes.get(path);
    }

    // Pattern match
    for (const [pattern, config] of this.routes) {
      if (this.matchesPattern(pattern, path)) {
        return config;
      }
    }

    return undefined;
  }

  private matchesPattern(pattern: string, path: string): boolean {
    const regexPattern = pattern
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  private async preloadSequentially(configs: RouteSplitConfig[]): Promise<void> {
    for (const config of configs) {
      if (typeof requestIdleCallback !== 'undefined') {
        await new Promise<void>((resolve) => {
          requestIdleCallback(async () => {
            try {
              const loader = createLazyModule(config.factory, { retries: 0, timeout: 10000 });
              await loader();
            } catch {
              // Silently fail preloads
            }
            resolve();
          });
        });
      } else {
        // Fallback for environments without requestIdleCallback
        await delay(100);
        try {
          const loader = createLazyModule(config.factory, { retries: 0, timeout: 10000 });
          await loader();
        } catch {
          // Silently fail preloads
        }
      }
    }

    this.isPreloading = false;
  }
}

/**
 * Clear module cache - primarily for testing.
 */
export function clearModuleCache(): void {
  moduleCache.clear();
  pendingLoads.clear();
}
