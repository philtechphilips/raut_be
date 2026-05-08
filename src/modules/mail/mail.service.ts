import { Injectable, Logger } from '@nestjs/common';

function layoutHtml(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;background:#1A1A1A;font-family:Inter,system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1A1A1A;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#242424;border:1px solid #3A3A3A;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#CFFE26;">Rauts</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;color:rgba(255,255,255,0.65);font-size:15px;line-height:1.55;">
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;border-top:1px solid #3A3A3A;">
              <p style="margin:16px 0 0 0;font-size:11px;color:rgba(255,255,255,0.28);line-height:1.5;">
                If you did not request this, you can ignore this email. This link expires automatically.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private get frontendUrl(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  async sendVerificationEmail(to: string, token: string): Promise<boolean> {
    const url = `${this.frontendUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const inner = `
      <p style="margin:0 0 16px 0;">Thanks for signing up. Confirm your email address to start using Rauts.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${url}" style="display:inline-block;background:#CFFE26;color:#000000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Verify email address</a>
      </p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:rgba(207,254,38,0.7);">${url}</span></p>
    `;
    return this.send(to, 'Verify your Rauts email', layoutHtml('Verify your email', inner));
  }

  async sendGithubScanCompleteEmail(
    to: string,
    detail: {
      repoFullName: string;
      collectionName: string;
      endpointCount: number;
      branch: string;
    },
  ): Promise<boolean> {
    const dash = `${this.frontendUrl}/dashboard`;
    const inner = `
      <p style="margin:0 0 16px 0;">Your GitHub import for <strong style="color:rgba(255,255,255,0.92);">${this.escapeHtml(detail.repoFullName)}</strong> finished successfully.</p>
      <p style="margin:0 0 16px 0;">
        Collection <strong style="color:rgba(255,255,255,0.92);">${this.escapeHtml(detail.collectionName)}</strong> now includes
        <strong style="color:rgba(255,255,255,0.92);">${detail.endpointCount}</strong> endpoints (branch <span style="font-family:monospace;color:rgba(207,254,38,0.85);">${this.escapeHtml(detail.branch)}</span>).
      </p>
      <p style="margin:0 0 20px 0;">
        <a href="${dash}" style="display:inline-block;background:#CFFE26;color:#000000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Open dashboard</a>
      </p>
    `;
    return this.send(to, 'Your GitHub documentation import is ready', layoutHtml('Import complete', inner));
  }

  async sendGithubScanFailedEmail(
    to: string,
    detail: { repoFullName: string; error: string },
  ): Promise<boolean> {
    const dash = `${this.frontendUrl}/dashboard`;
    const inner = `
      <p style="margin:0 0 16px 0;">We could not finish the GitHub import for <strong style="color:rgba(255,255,255,0.92);">${this.escapeHtml(detail.repoFullName)}</strong>.</p>
      <p style="margin:0 0 20px 0;padding:14px 16px;background:#2A2222;border:1px solid #4A3030;border-radius:12px;font-size:13px;color:rgba(255,220,220,0.9);">${this.escapeHtml(detail.error)}</p>
      <p style="margin:0 0 20px 0;">
        <a href="${dash}" style="display:inline-block;background:#CFFE26;color:#000000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Back to dashboard</a>
      </p>
    `;
    return this.send(to, 'GitHub documentation import failed', layoutHtml('Import failed', inner));
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
    const url = `${this.frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const inner = `
      <p style="margin:0 0 16px 0;">We received a request to reset your password. Use the button below to choose a new one.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${url}" style="display:inline-block;background:#CFFE26;color:#000000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Reset password</a>
      </p>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);">Or paste this URL into your browser:<br/><span style="word-break:break-all;color:rgba(207,254,38,0.7);">${url}</span></p>
    `;
    return this.send(to, 'Reset your Rauts password', layoutHtml('Reset your password', inner));
  }

  /** @returns true if sent via Resend, false if skipped (no API key, dev log only) */
  private async send(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'Rauts <onboarding@resend.dev>';
    const replyTo = process.env.EMAIL_REPLY_TO;

    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY is not set; email not sent to ${to}. Subject: ${subject}`,
      );
      return false;
    }

    const body: Record<string, unknown> = {
      from,
      to: [to],
      subject,
      html,
    };
    if (replyTo) body.reply_to = replyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Resend API error ${res.status}: ${text}`);
      throw new Error(`Failed to send email: ${res.status}`);
    }

    return true;
  }
}
