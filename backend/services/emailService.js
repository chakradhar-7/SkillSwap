const nodemailer = require('nodemailer');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || 'SkillSwap <no-reply@skillswap.local>';

const isConfigured = () => !!process.env.SMTP_HOST;

let transporter;
const getTransporter = () => {
  if (transporter) return transporter;
  if (isConfigured()) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    // No SMTP configured (local development): build the message but only log it
    console.warn('SMTP is not configured - emails will be printed to the console instead of sent.');
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Simple, email-client-friendly layout. Every value passed in is escaped.
const renderEmail = ({ heading, paragraphs, buttonText, buttonUrl, footer }) => {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(p)}</p>`).join('');
  const button = buttonUrl
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(buttonUrl)}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block;">${escapeHtml(buttonText)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Or open this link: ${escapeHtml(buttonUrl)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 20px;font-size:22px;color:#0f766e;">${escapeHtml(heading)}</h1>
      ${body}${button}
      ${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">${escapeHtml(footer)}</p>` : ''}
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">SkillSwap - peer learning exchange</p>
  </div></body></html>`;
};

const renderText = ({ heading, paragraphs, buttonText, buttonUrl, footer }) =>
  [heading, '', ...paragraphs, ...(buttonUrl ? ['', `${buttonText}: ${buttonUrl}`] : []), ...(footer ? ['', footer] : [])].join('\n');

// Sends an email; never throws. Returns true when the message was handed off.
const sendEmail = async ({ to, subject, content }) => {
  if (!to) return false;
  try {
    await getTransporter().sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      text: renderText(content),
      html: renderEmail(content),
    });
    if (!isConfigured()) {
      console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${renderText(content)}\n`);
    }
    return true;
  } catch (err) {
    console.error(`Failed to send email "${subject}" to ${to}:`, err.message);
    return false;
  }
};

const sendVerificationEmail = (user, token) =>
  sendEmail({
    to: user.email,
    subject: 'Verify your SkillSwap email',
    content: {
      heading: `Welcome to SkillSwap, ${user.username}!`,
      paragraphs: ['Please confirm your email address so we can send you session reminders and account notices.'],
      buttonText: 'Verify email',
      buttonUrl: `${FRONTEND_URL}/verify-email?token=${token}`,
      footer: 'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    },
  });

const sendPasswordResetEmail = (user, token) =>
  sendEmail({
    to: user.email,
    subject: 'Reset your SkillSwap password',
    content: {
      heading: 'Reset your password',
      paragraphs: [`Hi ${user.username}, we received a request to reset your SkillSwap password.`],
      buttonText: 'Choose a new password',
      buttonUrl: `${FRONTEND_URL}/reset-password?token=${token}`,
      footer: 'This link expires in 1 hour and can be used once. If you did not request a reset, you can ignore this email - your password will not change.',
    },
  });

const sendSessionReminderEmail = ({ to, username, heading, message }) =>
  sendEmail({
    to,
    subject: heading,
    content: {
      heading,
      paragraphs: [`Hi ${username},`, message],
      buttonText: 'Open your dashboard',
      buttonUrl: `${FRONTEND_URL}/dashboard`,
    },
  });

module.exports = {
  isConfigured,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSessionReminderEmail,
};
