/**
 * OAuth/SSO federation ports (design "Authentication & Session").
 *
 * StreetStudio core never hardcodes a specific identity vendor. Each configured
 * OAuth provider (authorization-code flow) and SSO identity provider
 * (assertion-based flow) is modeled behind a narrow port, and the set of
 * configured providers is supplied to {@link AuthService} through a
 * {@link FederatedProviderRegistry}. Concrete vendors (Google, Okta, Azure AD,
 * SAML IdPs, …) are wired in as adapters at the edge — as plugins or app
 * configuration — so the auth core stays vendor-agnostic (Requirements 3.5,
 * 3.6) and the boundary rules of Requirement 22 are respected.
 *
 * A provider's resolve step MUST reject (throw) on any failure or
 * unavailability. {@link AuthService.loginWithOAuth} and
 * {@link AuthService.loginWithSSO} translate every such rejection — and every
 * unconfigured-provider lookup — into the uniform, non-disclosing
 * `AUTHENTICATION_FAILED` error, denying the sign-in and creating no session
 * (Requirement 3.10).
 */

/**
 * The identity resolved from a successful federated authentication.
 *
 * `subject` is the provider's stable identifier for the principal; `email` is
 * the verified email used to resolve or provision the local Member. A provider
 * that cannot supply a verified email is treated as a failed authentication by
 * the caller.
 */
export interface FederatedIdentity {
  /** The provider's stable subject identifier for the principal. */
  readonly subject: string;
  /** The verified email address asserted by the provider. */
  readonly email: string;
}

/**
 * A single configured OAuth provider (authorization-code flow).
 *
 * {@link exchangeCode} exchanges the authorization `code` obtained by the
 * client for the authenticated identity. It MUST reject on any provider failure
 * or unavailability (network error, invalid/expired code, provider downtime).
 */
export interface OAuthProvider {
  /** Provider identifier this adapter serves (e.g. `"google"`). */
  readonly id: string;
  /** Exchange an authorization code for the authenticated identity. */
  exchangeCode(code: string): Promise<FederatedIdentity>;
}

/**
 * A single configured SSO identity provider (assertion-based flow, e.g. SAML or
 * OIDC id_token).
 *
 * {@link verifyAssertion} validates the provider-issued `assertion` and
 * resolves the authenticated identity. It MUST reject on any provider failure
 * or unavailability (invalid signature, expired/replayed assertion, IdP
 * downtime).
 */
export interface SsoProvider {
  /** Identity-provider identifier this adapter serves (e.g. `"okta"`). */
  readonly id: string;
  /** Validate an SSO assertion and resolve the authenticated identity. */
  verifyAssertion(assertion: string): Promise<FederatedIdentity>;
}

/**
 * The set of OAuth/SSO providers configured for the deployment, keyed by
 * provider id. A lookup for a provider that is not configured returns
 * `undefined`; {@link AuthService} treats that as a denied sign-in without
 * disclosing whether the provider is configured (Requirement 3.10).
 */
export interface FederatedProviderRegistry {
  /** The configured OAuth provider with `id`, or `undefined` when none is. */
  oauth(id: string): OAuthProvider | undefined;
  /** The configured SSO provider with `id`, or `undefined` when none is. */
  sso(id: string): SsoProvider | undefined;
}

/** Providers to seed a {@link FederatedProviderRegistry}. */
export interface FederatedProviders {
  /** Configured OAuth providers. Later entries win on duplicate ids. */
  readonly oauth?: readonly OAuthProvider[];
  /** Configured SSO providers. Later entries win on duplicate ids. */
  readonly sso?: readonly SsoProvider[];
}

/**
 * Build an in-memory {@link FederatedProviderRegistry} from explicit provider
 * lists. This is a convenience for wiring configured providers at startup; a
 * deployment may supply any other implementation of the port (e.g. one backed
 * by dynamic plugin discovery) without changing the auth core.
 */
export function federatedProviderRegistry(
  providers: FederatedProviders = {},
): FederatedProviderRegistry {
  const oauthById = new Map<string, OAuthProvider>();
  for (const p of providers.oauth ?? []) {
    oauthById.set(p.id, p);
  }
  const ssoById = new Map<string, SsoProvider>();
  for (const p of providers.sso ?? []) {
    ssoById.set(p.id, p);
  }
  return {
    oauth(id: string): OAuthProvider | undefined {
      return oauthById.get(id);
    },
    sso(id: string): SsoProvider | undefined {
      return ssoById.get(id);
    },
  };
}
