import nodemailer from 'nodemailer';

// Lazily built so a fresh process picks up .env changes without extra
// wiring, and so an unconfigured server doesn't throw at startup — only
// once someone actually tries to send.
let transporter = null;

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isMailConfigured()) {
    throw new Error(
      'Email is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASS (see server/.env.example)'
    );
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  const address = process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = process.env.SMTP_FROM_NAME ? { name: process.env.SMTP_FROM_NAME, address } : address;
  const replyTo = process.env.SMTP_REPLY_TO || undefined;
  await getTransporter().sendMail({ from, to, subject, text, html, replyTo });
}
