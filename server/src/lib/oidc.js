import * as client from 'openid-client';

// Lazily discovered and cached, same reasoning as mailer.js's transporter —
// an unconfigured server shouldn't fail at startup, only once someone
// actually tries to use SSO.
let configPromise = null;

export function isOidcConfigured() {
  return Boolean(
    process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.OIDC_REDIRECT_URI
  );
}

function getConfig() {
  if (!isOidcConfigured()) {
    throw new Error('OIDC is not configured — set OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI');
  }
  if (!configPromise) {
    const issuer = new URL(process.env.OIDC_ISSUER_URL);
    // Only relaxed for a plain-http issuer (local dev/test against a
    // non-TLS provider) — a real https:// issuer never needs this, so
    // production setups keep the library's default HTTPS-only behaviour.
    const options = issuer.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined;
    configPromise = client.discovery(issuer, process.env.OIDC_CLIENT_ID, process.env.OIDC_CLIENT_SECRET, undefined, options);
  }
  return configPromise;
}

// Builds the URL to send the browser to, plus the PKCE/state/nonce values
// the caller must stash (in the session) to verify the callback with.
export async function buildAuthorizationUrl() {
  const config = await getConfig();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: process.env.OIDC_REDIRECT_URI,
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Otherwise providers with an active seamless-SSO session (e.g. Entra ID
    // on an Azure AD-joined machine) can silently sign the user back in with
    // whatever account is already cached, with no visible prompt at all —
    // this forces the account chooser so the user always picks explicitly.
    prompt: 'select_account',
  });

  return { url: url.href, state, nonce, codeVerifier };
}

// Exchanges the authorization code for tokens and returns the verified ID
// token claims (email, name, sub, ...) — state/nonce/PKCE are all checked
// here, so a forged or replayed callback throws rather than returning claims.
export async function handleCallback(currentUrl, { state, nonce, codeVerifier }) {
  const config = await getConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
  });
  return tokens.claims();
}
