/**
 * OAuth Callback Page
 * 
 * Handles OAuth authentication callbacks from providers.
 * Requirements 1.6: OAuth redirect flow handling
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OAuthCallbackHandler, oauthCallbackHandler } from '../../services/oauth-callback-handler.js';
import { logger } from '../../app/client-logger.js';

@customElement('oauth-callback-page')
export class OAuthCallbackPage extends LitElement {
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

      logger.info('Processing OAuth callback', {
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
      logger.error('OAuth callback processing failed', {
        error: (error as Error).message,
      });

      this.status = 'error';
      this.error = (error as Error).message || 'Authentication callback failed';
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

  private handleTryAgain(): void {
    // Clear any stored state and return to login
    sessionStorage.removeItem('oauth_flow_state');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_return_url');
    window.location.href = '/auth/login';
  }

  render() {
    return html`
      <div class="container">
        ${this.renderIcon()}
        ${this.renderContent()}
        ${this.renderActions()}
        ${this.renderSecurityNotice()}
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
    switch (this.status) {
      case 'processing':
        return html`
          <h1>Completing Sign In...</h1>
          <div class="subtitle">
            Please wait while we verify your ${this.provider || 'OAuth'} authentication.
          </div>
        `;

      case 'success':
        return html`
          <h1>Sign In Successful!</h1>
          <div class="subtitle">
            You have successfully signed in with ${this.provider || 'OAuth'}. 
            Redirecting you to the application...
          </div>
        `;

      case 'error':
        return html`
          <h1>Sign In Failed</h1>
          <div class="subtitle">
            There was a problem completing your ${this.provider || 'OAuth'} sign in.
          </div>
          ${this.error ? html`
            <div class="error-message">
              ${this.error}
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
              Continue to Dashboard
            </button>
          </div>
        `;

      case 'error':
        return html`
          <div class="actions">
            <button 
              class="btn btn-primary"
              @click=${this.handleTryAgain}
            >
              Try Again
            </button>
            <button 
              class="btn btn-secondary"
              @click=${this.handleReturnToLogin}
            >
              Back to Login
            </button>
          </div>
        `;

      default:
        return html``;
    }
  }

  private renderSecurityNotice() {
    if (this.status === 'error' && this.error?.toLowerCase().includes('state')) {
      return html`
        <div class="security-notice">
          <sl-icon name="shield-exclamation" style="vertical-align: text-bottom;"></sl-icon>
          This error may indicate a security issue. For your protection, please start the sign-in process again.
        </div>
      `;
    }
    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'oauth-callback-page': OAuthCallbackPage;
  }
}