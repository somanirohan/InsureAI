"""
Email service for InsureAI.
Handles sending password reset verification links, security notices, and verification emails.
Supports both SMTP and a development console simulator for rapid local testing.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.email")


def _render_password_reset_html(to_email: str, reset_url: str, user_name: Optional[str] = None) -> str:
    """Generate modern, responsive HTML email template for password reset."""
    display_name = user_name or "Valued Member"
    expire_mins = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your InsurAI Password</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #062327;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
    }}
    .email-container {{
      max-width: 560px;
      margin: 40px auto;
      background: #07262b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }}
    .header {{
      padding: 32px 32px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(210, 245, 123, 0.08) 0%, transparent 100%);
    }}
    .logo-badge {{
      display: inline-block;
      padding: 8px 16px;
      background: #d2f57b;
      color: #062327;
      font-weight: 800;
      font-size: 14px;
      border-radius: 12px;
      letter-spacing: -0.3px;
    }}
    .content {{
      padding: 32px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 16px;
      color: #ffffff;
      letter-spacing: -0.5px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #a2cbcf;
      margin: 0 0 20px;
    }}
    .button-container {{
      text-align: center;
      margin: 32px 0;
    }}
    .reset-button {{
      display: inline-block;
      background-color: #d2f57b;
      color: #062327 !important;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 9999px;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(210, 245, 123, 0.35);
    }}
    .security-notice {{
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px;
      margin: 24px 0 0;
      font-size: 13px;
      color: #8dafb3;
      line-height: 1.5;
    }}
    .security-notice strong {{
      color: #d2f57b;
    }}
    .fallback-url {{
      margin-top: 24px;
      font-size: 12px;
      color: #6a9599;
      word-break: break-all;
    }}
    .fallback-url a {{
      color: #d2f57b;
      text-decoration: underline;
    }}
    .footer {{
      padding: 24px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #558187;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <span class="logo-badge">InsurAI</span>
      <p style="margin: 8px 0 0; font-size: 12px; color: #a2cbcf;">Policy Intelligence & Claim Readiness</p>
    </div>
    <div class="content">
      <h1>Password Reset Verification</h1>
      <p>Hello {display_name},</p>
      <p>
        We received a request to reset the password for your InsurAI account associated with 
        <strong>{to_email}</strong>.
      </p>
      <p>
        Click the secure button below to choose your new password. This verification link is time-sensitive 
        and will expire in <strong>{expire_mins} minutes</strong>.
      </p>

      <div class="button-container">
        <a href="{reset_url}" class="reset-button" target="_blank">Reset Password</a>
      </div>

      <div class="security-notice">
        <strong>Security Notice:</strong> InsurAI passwords require a minimum of 8 characters, an uppercase letter, a lowercase letter, a number, and a special character (!@#$%^&*). If you did not request this password reset, please disregard this email. Your password will remain unchanged.
      </div>

      <div class="fallback-url">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="{reset_url}">{reset_url}</a>
      </div>
    </div>
    <div class="footer">
      &copy; 2026 InsurAI Intelligence Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
"""


def _send_via_smtp_sync(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Synchronous SMTP sender meant to be executed in a thread pool."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    # For Gmail, sender address MUST match the authenticated user or Google rejects delivery
    if settings.SMTP_HOST and "gmail" in settings.SMTP_HOST.lower():
        from_email = settings.SMTP_USER
    else:
        from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "noreply@insurai.com"
    msg["From"] = f"InsurAI Security <{from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT or 465)

    clean_pwd = settings.SMTP_PASSWORD.replace(" ", "").strip() if settings.SMTP_PASSWORD else None

    # For Gmail or port 465, direct SSL is the most reliable (immune to ISP STARTTLS drop/timeout)
    if port == 465 or (host and "gmail" in host.lower()):
        try:
            with smtplib.SMTP_SSL(host, 465, timeout=15) as server:
                if settings.SMTP_USER and clean_pwd:
                    server.login(settings.SMTP_USER, clean_pwd)
                server.send_message(msg)
                return
        except Exception as ssl_err:
            logger.warning("SMTP_SSL port 465 failed: %s, trying port 587 fallback...", ssl_err)

    # Standard port 587 with STARTTLS
    with smtplib.SMTP(host, 587, timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        if settings.SMTP_USER and clean_pwd:
            server.login(settings.SMTP_USER, clean_pwd)
        server.send_message(msg)


async def send_password_reset_email(
    to_email: str,
    reset_url: str,
    user_name: Optional[str] = None,
) -> dict[str, Any]:
    """
    Send password reset email with verification link.
    If SMTP_HOST is configured, sends actual email via SMTP.
    Otherwise, logs the link clearly in the console for instant development testing.
    """
    subject = "Reset Your InsurAI Password"
    expire_mins = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    display_name = user_name or "Valued Member"

    plain_text = (
        f"Hello {display_name},\n\n"
        f"We received a request to reset your InsurAI password.\n\n"
        f"To reset your password, visit the following verification link:\n"
        f"{reset_url}\n\n"
        f"This verification link will expire in {expire_mins} minutes.\n\n"
        f"If you did not make this request, you can safely ignore this email.\n\n"
        f"InsurAI Security Team\n"
    )

    html_body = _render_password_reset_html(to_email, reset_url, user_name)

    if settings.SMTP_HOST:
        try:
            logger.info("Sending password reset email to %s via SMTP host %s", to_email, settings.SMTP_HOST)
            await asyncio.to_thread(_send_via_smtp_sync, to_email, subject, html_body, plain_text)
            logger.info("Password reset email sent successfully to %s", to_email)
            return {"sent": True, "provider": "smtp", "reset_url": reset_url}
        except Exception as exc:
            logger.error("Failed to send email via SMTP to %s: %s", to_email, exc)
            # Fall back to logging link so user is never locked out during development/configuration issues
            _log_dev_reset_link(to_email, reset_url, error=str(exc))
            return {"sent": True, "provider": "console_fallback", "reset_url": reset_url, "error": str(exc)}
    else:
        # Development / Simulation mode
        _log_dev_reset_link(to_email, reset_url)
        return {"sent": True, "provider": "console_simulated", "reset_url": reset_url}


def _log_dev_reset_link(to_email: str, reset_url: str, error: Optional[str] = None) -> None:
    """Print an eye-catching development simulation box to server console."""
    banner = "=" * 76
    logger.info(
        "\n%s\n"
        " 🔑 [INSURAI EMAIL SIMULATOR] Password Reset Verification Link\n"
        "%s\n"
        " Recipient : %s\n"
        " Action    : Password Reset Requested\n"
        " Link      : %s\n"
        "%s\n"
        " Note: To deliver live emails via inbox, configure SMTP_HOST, SMTP_USER,\n"
        " and SMTP_PASSWORD in server/.env.\n"
        "%s",
        banner,
        banner,
        to_email,
        reset_url,
        f" (SMTP Notice: {error})" if error else "",
        banner,
    )


def _render_welcome_html(to_email: str, user_name: Optional[str] = None) -> str:
    """Generate modern, responsive HTML email template for new account registration."""
    display_name = user_name or "Valued Member"
    client_base = settings.CLIENT_URL.rstrip("/")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to InsurAI</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #062327;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
    }}
    .email-container {{
      max-width: 560px;
      margin: 40px auto;
      background: #07262b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }}
    .header {{
      padding: 32px 32px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: linear-gradient(180deg, rgba(210, 245, 123, 0.08) 0%, transparent 100%);
    }}
    .logo-badge {{
      display: inline-block;
      padding: 8px 16px;
      background: #d2f57b;
      color: #062327;
      font-weight: 800;
      font-size: 14px;
      border-radius: 12px;
      letter-spacing: -0.3px;
    }}
    .content {{
      padding: 32px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 16px;
      color: #ffffff;
      letter-spacing: -0.5px;
    }}
    p {{
      font-size: 15px;
      line-height: 1.6;
      color: #a2cbcf;
      margin: 0 0 20px;
    }}
    .button-container {{
      text-align: center;
      margin: 32px 0;
    }}
    .dashboard-button {{
      display: inline-block;
      background-color: #d2f57b;
      color: #062327 !important;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 9999px;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(210, 245, 123, 0.35);
    }}
    .feature-card {{
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 12px;
    }}
    .feature-title {{
      font-size: 14px;
      font-weight: 700;
      color: #d2f57b;
      margin-bottom: 4px;
    }}
    .feature-desc {{
      font-size: 13px;
      color: #a2cbcf;
      margin: 0;
    }}
    .footer {{
      padding: 20px 32px;
      background: #04181b;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #6e9ea3;
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <span class="logo-badge">InsurAI</span>
      <p style="margin: 8px 0 0; font-size: 12px; color: #a2cbcf;">Policy Intelligence & Claim Readiness</p>
    </div>
    <div class="content">
      <h1>Welcome to InsurAI, {display_name}!</h1>
      <p>
        Your InsurAI account has been successfully created with <strong>{to_email}</strong>. 
        You now have access to cutting-edge AI policy intelligence, instant claim feasibility analysis, 
        and deep insurance policy cross-comparisons.
      </p>

      <div class="feature-card">
        <div class="feature-title">📄 Upload & Decode Policies</div>
        <div class="feature-desc">Upload your PDF policy schedule to automatically extract sum insured, copays, waiting periods, and hidden clauses.</div>
      </div>

      <div class="feature-card">
        <div class="feature-title">⚡ Instant Claim Feasibility</div>
        <div class="feature-desc">Simulate medical claims against actual policy wordings to know coverage and copays before hospital admission.</div>
      </div>

      <div class="button-container">
        <a href="{client_base}" class="dashboard-button" target="_blank">Access Your Dashboard</a>
      </div>
    </div>
    <div class="footer">
      &copy; 2026 InsurAI Intelligence Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
"""


async def send_welcome_email(
    to_email: str,
    user_name: Optional[str] = None,
) -> dict[str, Any]:
    """
    Send welcome email to newly registered user.
    Uses SMTP when configured, or logs in development console simulator.
    """
    subject = "Welcome to InsurAI — Your AI Health Policy Intelligence Platform"
    display_name = user_name or "Valued Member"
    client_base = settings.CLIENT_URL.rstrip("/")

    plain_text = (
        f"Hello {display_name},\n\n"
        f"Welcome to InsurAI! Your account ({to_email}) has been successfully created.\n\n"
        f"Access your dashboard to analyze policy documents and run instant claim simulations:\n"
        f"{client_base}\n\n"
        f"The InsurAI Team\n"
    )

    html_body = _render_welcome_html(to_email, user_name)

    if settings.SMTP_HOST:
        try:
            logger.info("Sending welcome email to %s via SMTP host %s", to_email, settings.SMTP_HOST)
            await asyncio.to_thread(_send_via_smtp_sync, to_email, subject, html_body, plain_text)
            logger.info("Welcome email sent successfully to %s", to_email)
            return {"sent": True, "provider": "smtp"}
        except Exception as exc:
            logger.error("Failed to send welcome email via SMTP to %s: %s", to_email, exc)
            return {"sent": False, "provider": "smtp_failed", "error": str(exc)}
    else:
        logger.info("[INSURAI EMAIL SIMULATOR] Welcome email dispatched to: %s", to_email)
        return {"sent": True, "provider": "console_simulated"}
