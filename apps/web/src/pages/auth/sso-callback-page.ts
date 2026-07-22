/**
 * SSO Callback Page
 * 
 * Handles SSO authentication callbacks from providers.
 * Requirements 1.7: SSO authentication flow with proper state management
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OAuthCallbackHandler, oauthCallbackHandler } from '../../services/oauth-callback-handler.js';
import { logger } from '../../app/client-logger.js';

@customElement('sso-callback-page')
export class SSOCallbackPage extends LitElement {
  @state()
  private status: 'processing' | 'success' | 'error' = 'processing';

  @state()
  private error?: string;

  @state()
  private provider?: string;

  @state()
  private returnUrl?: string;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      background: var(--sl-color-neutral-50);
      font-family: var(--sl-font-sans);
    }

    .container {
      background: white;
      border-radius: 8px;
      padding: 3rem 2rem;
      box-shadow: var(--sl-shadow-large);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }

    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon.processing {
      background: var(--sl-color-primary-100);
      color: var(--sl-color-primary-600);
      animation: pulse 2s infinite;
    }

    .icon.success {
      background: var(--sl-color-success-100);
      color: var(--sl-color-success-600);
    }

    .icon.error {
      background: var(--sl-color-danger-100);
      color: var(--sl-color-danger-600);
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid currentColor;
      border-top: 2px solid transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.05);
        opacity: 0.8;
      }
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
      color: var(--sl-color-neutral-900);
    }

    .subtitle {
      color: var(--sl-color-neutral-600);
      margin: 0 0 2rem;
      font-size: 0.875rem;
    }

    .provider-info {
      background: var(--sl-color-primary-50);
      border: 1px solid var(--sl-color-primary-200);
      border-radius: 6px;
      padding: 1rem;
      margin: 1rem 0;
      font-size: 0.875rem;
      color: var(--sl-color-primary-800);
    }

    .error-message {
      background: var(--sl-color-danger-50);
      border: 1px solid var(--sl-color-danger-200);
      border-radius: 6px;
      padding: 1rem;
      margin: 1.5rem 0;
      color: var(--sl-color-danger-800);
      font-size: 0.875rem;
      text-align: left;
    }

    .actions {
      margin-top: 2rem;
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-primary {
      background: var(--sl-color-primary-600);
      color: white;
    }

    .btn-primary:hover {
      background: var(--sl-color-primary-700);
    }

    .btn-secondary {
      background: var(--sl-color-neutral-100);
      color: var(--sl-color-neutral-700);
      border: 1px solid var(--sl-color-neutral-300);
    }

    .btn-secondary:hover {
      background: var(--sl-color-neutral-200);
    }

    .security-notice {
      background: var(--sl-color-warning-50);
      border: 1px solid var(--sl-color-warning-200);
      border-radius: 6px;
      padding: 0.75rem;
      margin-top: 1.5rem;
      font-size: 0.75rem;
      color: var(--sl-color-warning-800);
    }

    .contact-info {
      background: var(--sl-color-neutral-100);
      border-radius: 6px;
      padding: 0.75rem;
      margin-top: 1rem;
      font-size: 0.75rem;
      color: var(--sl-color-neutral-600);
    }

    @media (max-width: 640px) {
      :host {
        padding: 1rem;
      }

      .container {
        padding: 2rem 1.5rem;
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `;

  async connectedCallback() {
    super.connectedCallback();
    await this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    try {
      // Parse callback parameters
      const params = OAuthCallbackHandler.parseCallbackParams();
      
      if (!params.code && !params.error) {
        throw new Error('Missing authorization code or error parameter');
      }

      logger.info('Processing SSO callback', {
        hasCode: !!params.code,
        hasError: !!params.error,
        provider: params.provider,
      });

      // Handle the callback
      const result = await oauthCallbackHandler.handleCallback(params);

      if (result.success) {
        this.status = 'success';
        this.provider = result.provider;
        this.returnUrl = result.returnUrl;

        // Auto-redirect after success
        setTimeout(() => {
          OAuthCallbackHandler.handleSuccessRedirect(result.returnUrl);
        }, 2000);

      } else {
        this.status = 'error';
        this.error = result.error;
        this.provider = result.provider;
      }

    } catch (error) {
      logger.error('SSO callback processing failed', {
        error: (error as Error).message,
      });

      this.status = 'error';
      this.error = (error as Error).message || 'SSO authentication callback failed';
    }
  }

  private handleReturnToDashboard(): void {
    window.location.href = '/dashboard';
  }

  private handleReturnToLogin(): void {
    // Store error for login page display
    if (this.error) {
      OAuthCallbackHandler.handleErrorDisplay(this.error, this.provider);
    } else {
      window.location.href = '/auth/login';
    }
  }

  private handleContactAdmin(): void {
    // Open contact form or email
    window.location.href = 'mailto:support@streetstudio.app?subject=SSO Authentication Issue&body=I encountered an issue with SSO authentication using ' + (this.provider || 'unknown provider') + '. Error: ' + (this.error || 'unknown error');
  }

  private getProviderDisplayName(): string {
    if (!this.provider) {
      return 'SSO Provider';
    }

    switch (this.provider.toLowerCase()) {
      case 'azure-ad':
        return 'Microsoft Azure AD';
      case 'okta':
        return 'Okta';
      case 'google-workspace':
        return 'Google Workspace';
      default:
        return this.provider.charAt(0).toUpperCase() + this.provider.slice(1);
    }
  }

  render() {
    return html`
      <div class="container">
        ${this.renderIcon()}
        ${this.renderContent()}
        ${this.renderActions()}
        ${this.renderAdditionalInfo()}
      </div>
    `;
  }

  private renderIcon() {
    return html`
      <div class="icon ${this.status}">
        ${this.status === 'processing' 
          ? html`<div class="spinner"></div>`
          : this.status === 'success'
          ? html`<sl-icon name="check-circle" style="font-size: 2rem;"></sl-icon>`
          : html`<sl-icon name="x-circle" style="font-size: 2rem;"></sl-icon>`
        }
      </div>
    `;
  }

  private renderContent() {
    const providerName = this.getProviderDisplayName();

    switch (this.status) {
      case 'processing':
        return html`
          <h1>Completing SSO Sign In...</h1>
          <div class="subtitle">
            Please wait while we verify your ${providerName} authentication.
          </div>
          <div class="provider-info">
            <sl-icon name="shield-check" style="vertical-align: text-bottom;"></sl-icon>
            Securely authenticating with your organization's identity provider.
          </div>
        `;

      case 'success':
        return html`
          <h1>SSO Sign In Successful!</h1>
          <div class="subtitle">
            You have successfully signed in with ${providerName}. 
            Redirecting you to the application...
          </div>
          <div class="provider-info">
            <sl-icon name="building" style="vertical-align: text-bottom;"></sl-icon>
            Authenticated via your organization's ${providerName} system.
          </div>
        `;

      case 'error':
        return html`
          <h1>SSO Sign In Failed</h1>
          <div class="subtitle">
            There was a problem completing your ${providerName} authentication.
          </div>
          ${this.error ? html`
            <div class="error-message">
              <strong>Error:</strong> ${this.error}
            </div>
          ` : ''}
        `;

      default:
        return html``;
    }
  }

  private renderActions() {
    switch (this.status) {
      case 'success':
        return html`
          <div class="actions">
            <button 
              class="btn btn-primary"
              @click=${this.handleReturnToDashboard}
            >
              <sl-icon name="arrow-right" style="font-size: 0.875rem;"></sl-icon>
              Continue to Dashboard
            </button>
          </div>
        `;

      case 'error':
        const isConfigError = this.error?.includes('configuration') || this.error?.includes('administrator');
        
        return html`
          <div class="actions">
            <button 
              class="btn btn-primary"
              @click=${this.handleReturnToLogin}
            >
              <sl-icon name="arrow-left" style="font-size: 0.875rem;"></sl-icon>
              Back to Login
            </button>
            ${isConfigError ? html`
              <button 
                class="btn btn-secondary"
                @click=${this.handleContactAdmin}
              >
                <sl-icon name="envelope" style="font-size: 0.875rem;"></sl-icon>
                Contact Administrator
              </button>
            ` : ''}
          </div>
        `;

      default:
        return html``;
    }
  }

  private renderAdditionalInfo() {
    if (this.status === 'error') {
      const isSecurityError = this.error?.toLowerCase().includes('state') || 
                             this.error?.toLowerCase().includes('security');
      const isConfigError = this.error?.includes('configuration') || 
                           this.error?.includes('administrator');

      if (isSecurityError) {
        return html`
          <div class="security-notice">
            <sl-icon name="shield-exclamation" style="vertical-align: text-bottom;"></sl-icon>
            <strong>Security Notice:</strong> This error may indicate a security issue. 
            For your protection, please start the sign-in process again from your organization's portal.
          </div>
        `;
      }

      if (isConfigError) {
        return html`
          <div class="contact-info">
            <sl-icon name="info-circle" style="vertical-align: text-bottom;"></sl-icon>
            <strong>Need Help?</strong> This appears to be a configuration issue. 
            Please contact your IT administrator or organization support team for assistance.
          </div>
        `;
      }

      // General troubleshooting info
      return html`
        <div class="contact-info">
          <sl-icon name="question-circle" style="vertical-align: text-bottom;"></sl-icon>
          <strong>Troubleshooting:</strong> Try refreshing the page or clearing your browser cache. 
          If the problem persists, contact your administrator.
        </div>
      `;
    }

    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sso-callback-page': SSOCallbackPage;
  }
}