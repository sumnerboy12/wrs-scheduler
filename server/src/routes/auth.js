import { Router } from 'express';
import db from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { isOidcConfigured, buildAuthorizationUrl, handleCallback } from '../lib/oidc.js';

const router = Router();

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    must_change_password: !!user.must_change_password,
    sso_only: !!user.sso_only,
  };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid username or password' });
  if (user.sso_only) return res.status(401).json({ error: 'This account can only sign in via SSO — use "Sign in with SSO" below.' });
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'login failed' });
    req.session.userId = user.id;
    res.json(publicUser(user));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!current_password || !verifyPassword(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(new_password),
    user.id
  );
  res.status(204).end();
});

router.get('/oidc/status', (req, res) => {
  res.json({ enabled: isOidcConfigured() });
});

router.get('/oidc/login', async (req, res) => {
  if (!isOidcConfigured()) return res.status(503).json({ error: 'OIDC is not configured' });
  try {
    const { url, state, nonce, codeVerifier } = await buildAuthorizationUrl();
    req.session.oidc = { state, nonce, codeVerifier };
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Failed to start sign-in' });
      res.redirect(url);
    });
  } catch (e) {
    console.error('OIDC login failed:', e);
    res.status(500).json({ error: 'Failed to start sign-in' });
  }
});

// A verified email alone isn't enough to log in — it must match an existing,
// active account's `email` column. SSO is a second door into an account an
// admin already provisioned, not a way to self-provision new accounts.
router.get('/oidc/callback', async (req, res) => {
  const saved = req.session.oidc;
  delete req.session.oidc;
  if (!saved) return res.redirect('/login?error=oidc_expired');

  try {
    // Built from the fixed, registered redirect URI rather than the
    // request's own host/protocol — behind a dev proxy (or any reverse
    // proxy) those don't necessarily match what's actually registered with
    // the provider, and openid-client derives the redirect_uri it sends to
    // the token endpoint from this URL, so it must match exactly.
    const currentUrl = new URL(process.env.OIDC_REDIRECT_URI);
    currentUrl.search = new URL(req.originalUrl, 'http://placeholder').search;
    const claims = await handleCallback(currentUrl, saved);
    // `email` is only populated if the provider's `mail` attribute is set
    // for the user, which isn't always true even for real mailboxes (e.g.
    // Entra ID admin/synced accounts). `preferred_username` is always
    // present for work/school accounts and is virtually always the same
    // as their email address (it's their UPN), so it's a safe fallback.
    const email = claims?.email || claims?.preferred_username;
    if (!email) return res.redirect('/login?error=oidc_no_email');

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());
    if (!user || !user.active) return res.redirect('/login?error=oidc_no_account');

    req.session.regenerate((err) => {
      if (err) return res.redirect('/login?error=oidc_failed');
      req.session.userId = user.id;
      res.redirect('/');
    });
  } catch (e) {
    console.error('OIDC callback failed:', e);
    res.redirect('/login?error=oidc_failed');
  }
});

export default router;
