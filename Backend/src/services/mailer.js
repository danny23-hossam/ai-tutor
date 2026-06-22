// src/services/mailer.js
// Resend integration for Papyrus Study
// Required env vars on Render:
//   RESEND_API_KEY — The re_... key from your Resend dashboard
//   FRONTEND_URL   — https://papyrusai.me

const { Resend } = require('resend');

// P2: Warn loudly at startup if API key is missing.
if (!process.env.RESEND_API_KEY) {
    console.warn('[mailer] ⚠️  RESEND_API_KEY not set — verification emails will NOT be sent.');
}

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// The professional sender address verified via Namecheap
const SENDER_EMAIL = 'Papyrus <noreply@papyrusai.me>';

// P1: Escape HTML entities in user-provided strings before embedding in HTML templates.
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
/**
 * Send an account verification email.
 * @param {string} toEmail  - Recipient email address
 * @param {string} toName   - Recipient's full name
 * @param {string} token    - The raw verification token
 */
async function sendVerificationEmail(toEmail, toName, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://papyrusai.me';
    const verifyUrl   = `${frontendUrl}/verify-email?token=${token}`;
    const safeName    = escapeHtml(toName);

    try {
        const { data, error } = await resend.emails.send({
            from: SENDER_EMAIL,
            to: toEmail,
            subject: 'Verify your Papyrus account',
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:36px 40px;text-align:center;">
              <span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">📖 Papyrus</span>
              <p style="margin:8px 0 0;color:#ff6900;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Study Smarter</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;">Welcome, ${safeName}! 👋</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">You're one step away from starting your learning journey. Click the button below to verify your email address.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ff6900;border-radius:10px;">
                    <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">✅ Verify My Email</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#999;">This link expires in 24 hours.</p>
              <p style="margin:0;font-size:12px;color:#bbb;word-break:break-all;">Or copy this link: ${verifyUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;">© ${new Date().getFullYear()} Papyrus Study · papyrusai.me</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
        });

        if (error) throw error;
        console.log('[mailer] ✅ Verification email sent. ID:', data.id);
    } catch (err) {
        console.error('[mailer] ❌ Resend Error (Verification):', err.message);
    }
}

/**
 * Send a password reset email.
 * @param {string} toEmail - Recipient email address
 * @param {string} toName  - Recipient's full name
 * @param {string} token   - The raw reset token
 */
async function sendPasswordResetEmail(toEmail, toName, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://papyrusai.me';
    const resetUrl    = `${frontendUrl}/reset-password?token=${token}`;
    const safeName    = escapeHtml(toName);

    try {
        const { data, error } = await resend.emails.send({
            from: SENDER_EMAIL,
            to: toEmail,
            subject: 'Reset your Papyrus password',
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:36px 40px;text-align:center;">
              <span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">📖 Papyrus</span>
              <p style="margin:8px 0 0;color:#ff6900;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Study Smarter</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1a1a2e;">Reset your password 🔐</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">Hi ${safeName}, we received a request to reset your password. Click the button below to choose a new one.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ff6900;border-radius:10px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">🔑 Reset My Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#999;">This link expires in 1 hour.</p>
              <p style="margin:0;font-size:12px;color:#bbb;word-break:break-all;">Or copy this link: ${resetUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;">© ${new Date().getFullYear()} Papyrus Study · papyrusai.me</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
        });

        if (error) throw error;
        console.log('[mailer] ✅ Password reset email sent. ID:', data.id);
    } catch (err) {
        console.error('[mailer] ❌ Resend Error (Reset):', err.message);
    }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };