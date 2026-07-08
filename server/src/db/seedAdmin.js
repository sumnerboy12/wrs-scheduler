import crypto from 'node:crypto';
import db from './index.js';
import { hashPassword } from '../lib/auth.js';

const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  db.prepare(
    `INSERT INTO users (username, password_hash, is_admin, must_change_password) VALUES (?, ?, 1, 1)`
  ).run('admin', hashPassword(tempPassword));

  console.log('='.repeat(60));
  console.log('Created initial admin login:');
  console.log('  Username: admin');
  console.log(`  Password: ${tempPassword}`);
  console.log("You'll be asked to set a new password on first login.");
  console.log('='.repeat(60));
}
