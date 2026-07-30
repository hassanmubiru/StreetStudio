/**
 * Content Security Policy (CSP) Implementation
 *
 * Generates CSP meta tags, manages nonce-based inline script handling,
 * and configures violation reporting endpoints.
 *
 * Requirements: 13.9
 */

export type CspDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'connect-src'
  | 'media-src'
  | 'object-src'
  | 'frame-src'
  | 'worker-src'
  | 'child-src'
  | 'form-action'
  | 'frame-ancestors'
  | 'base-uri'
  | 'report-uri'
  | 'report-to';

export interface CspConfig {
  /** CSP directives and their allowed sources */
  directives: Partial<Record<CspDirective, string[]>>;
  /** Whether to use report-only mode (does not enforce, only reports) */
  reportOnly?: boolean;
  /** Violation reporting endpoint URL */
  reportUri?: string;
  /** Report-To group name for Reporting API v1 */
  reportToGroup?: string;
  /** Whether to auto-generate nonces for inline scripts */
  useNonces?: boolean;
}

export interface CspViolationReport {
  documentUri: string;
  referrer: string;
  violatedDirective: string;
  effectiveDirective: string;
  originalPolicy: string;
  blockedUri: string;
  statusCode: number;
  timestamp: string;
}

export interface CspViolationHandler {
  (report: CspViolationReport): void;
}

const DEFAULT_DIRECTIVES: Partial<Record<CspDirective, string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'", 'https:'],
  'connect-src': ["'self'"],
  'media-src': ["'self'", 'https:'],
  'object-src': ["'none'"],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/**
 * Generate a cryptographically random nonce for inline script/style usage.
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Content Security Policy manager.
 * Generates meta tags, manages nonces, and handles violation reports.
 */
export class ContentSecurityPolicy {
  private config: CspConfig;
  private currentNonce: string | null = null;
  private violationHandlers: CspViolationHandler[] = [];
  private metaElement: HTMLMetaElement | null = null;

  constructor(config?: Partial<CspConfig>) {
    this.config = {
      directives: { ...DEFAULT_DIRECTIVES, ...config?.directives },
      reportOnly: config?.reportOnly ?? false,
      reportUri: config?.reportUri,
      reportToGroup: config?.reportToGroup,
      useNonces: config?.useNonces ?? true,
    };

    if (this.config.useNonces) {
      this.currentNonce = generateNonce();
    }
  }

  /**
   * Get the current nonce value for use in inline scripts/styles.
   */
  public getNonce(): string | null {
    return this.currentNonce;
  }

  /**
   * Regenerate the nonce (call on navigation or periodic refresh).
   */
  public rotateNonce(): string {
    this.currentNonce = generateNonce();
    this.applyPolicy();
    return this.currentNonce;
  }

  /**
   * Build the full CSP policy string from configuration.
   */
  public buildPolicyString(): string {
    const parts: string[] = [];

    for (const [directive, sources] of Object.entries(this.config.directives)) {
      if (!sources || sources.length === 0) continue;

      let directiveSources = [...sources];

      // Add nonce to script-src and style-src if nonces are enabled
      if (this.currentNonce && (directive === 'script-src' || directive === 'style-src')) {
        directiveSources.push(`'nonce-${this.currentNonce}'`);
      }

      parts.push(`${directive} ${directiveSources.join(' ')}`);
    }

    // Add report-uri if configured
    if (this.config.reportUri) {
      parts.push(`report-uri ${this.config.reportUri}`);
    }

    // Add report-to if configured
    if (this.config.reportToGroup) {
      parts.push(`report-to ${this.config.reportToGroup}`);
    }

    return parts.join('; ');
  }

  /**
   * Generate and inject a CSP meta tag into the document head.
   */
  public applyPolicy(): HTMLMetaElement {
    // Remove existing CSP meta tag if present
    if (this.metaElement && this.metaElement.parentNode) {
      this.metaElement.parentNode.removeChild(this.metaElement);
    }

    const meta = document.createElement('meta');
    const httpEquiv = this.config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    meta.setAttribute('http-equiv', httpEquiv);
    meta.setAttribute('content', this.buildPolicyString());

    document.head.appendChild(meta);
    this.metaElement = meta;

    return meta;
  }

  /**
   * Remove the CSP meta tag from the document.
   */
  public removePolicy(): void {
    if (this.metaElement && this.metaElement.parentNode) {
      this.metaElement.parentNode.removeChild(this.metaElement);
      this.metaElement = null;
    }
  }

  /**
   * Register a handler for CSP violation reports.
   */
  public onViolation(handler: CspViolationHandler): () => void {
    this.violationHandlers.push(handler);
    return () => {
      this.violationHandlers = this.violationHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Start listening for CSP violation events on the document.
   */
  public startViolationListening(): () => void {
    const listener = (event: SecurityPolicyViolationEvent) => {
      const report: CspViolationReport = {
        documentUri: event.documentURI,
        referrer: event.referrer,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        blockedUri: event.blockedURI,
        statusCode: event.statusCode,
        timestamp: new Date().toISOString(),
      };

      this.violationHandlers.forEach(handler => handler(report));

      // Send violation report to server if configured
      if (this.config.reportUri) {
        this.sendViolationReport(report);
      }
    };

    document.addEventListener('securitypolicyviolation', listener);

    return () => {
      document.removeEventListener('securitypolicyviolation', listener);
    };
  }

  /**
   * Update a specific CSP directive.
   */
  public setDirective(directive: CspDirective, sources: string[]): void {
    this.config.directives[directive] = sources;
  }

  /**
   * Add a source to an existing directive.
   */
  public addSource(directive: CspDirective, source: string): void {
    if (!this.config.directives[directive]) {
      this.config.directives[directive] = [];
    }
    if (!this.config.directives[directive]!.includes(source)) {
      this.config.directives[directive]!.push(source);
    }
  }

  /**
   * Remove a source from a directive.
   */
  public removeSource(directive: CspDirective, source: string): void {
    const sources = this.config.directives[directive];
    if (sources) {
      this.config.directives[directive] = sources.filter(s => s !== source);
    }
  }

  /**
   * Get current configuration.
   */
  public getConfig(): Readonly<CspConfig> {
    return { ...this.config };
  }

  /**
   * Destroy the CSP instance and clean up.
   */
  public destroy(): void {
    this.removePolicy();
    this.violationHandlers = [];
    this.currentNonce = null;
  }

  private sendViolationReport(report: CspViolationReport): void {
    if (!this.config.reportUri) return;

    try {
      // Use navigator.sendBeacon for reliable delivery
      const payload = JSON.stringify({ 'csp-report': report });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.config.reportUri, payload);
      } else {
        fetch(this.config.reportUri, {
          method: 'POST',
          headers: { 'Content-Type': 'application/csp-report' },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Silently fail - violation reporting is best-effort
        });
      }
    } catch {
      // Silently fail
    }
  }
}
