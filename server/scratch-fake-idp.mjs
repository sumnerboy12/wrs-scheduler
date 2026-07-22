import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const PORT = 9099;
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = 'test-client-id';
const TEST_EMAIL = process.env.TEST_EMAIL || 'ssogate-test@example.com';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

let lastCode = null;
let lastNonce = null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER);

  if (url.pathname === '/.well-known/openid-configuration') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'email', 'profile'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      })
    );
    return;
  }

  if (url.pathname === '/jwks') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }

  if (url.pathname === '/authorize') {
    const state = url.searchParams.get('state');
    const nonce = url.searchParams.get('nonce');
    const redirectUri = url.searchParams.get('redirect_uri');
    lastCode = 'test-auth-code';
    lastNonce = nonce;
    const dest = new URL(redirectUri);
    dest.searchParams.set('code', lastCode);
    if (state) dest.searchParams.set('state', state);
    res.writeHead(302, { Location: dest.href });
    res.end();
    return;
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = new URLSearchParams(body);
    if (params.get('code') !== lastCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const idToken = await new SignJWT({
      email: TEST_EMAIL,
      email_verified: true,
      name: 'SSO Gate Test',
      nonce: lastNonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject('test-subject-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        id_token: idToken,
        expires_in: 300,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[fake-idp] listening on ${ISSUER}, test email: ${TEST_EMAIL}`);
});
