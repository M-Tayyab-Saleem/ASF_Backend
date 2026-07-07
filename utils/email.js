const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER = { name: 'AI Security Framework', email: 'tsaleem@abidisolutions.com' };

const sendOTPEmail = async (toEmail, otpCode) => {
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY;

  const htmlContent = `
    <div style="font-family: 'Avenir Next', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8FAFC; border-radius: 12px;">
      <div style="background-color: #FFFFFF; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center;">
        <h1 style="color: #0D1514; font-size: 24px; font-weight: 700; margin-bottom: 8px;">Verify Your Email</h1>
        <p style="color: #334155; font-size: 16px; margin-bottom: 32px; line-height: 1.5;">
          Thank you for registering. Please use the following code to verify your email address.
        </p>
        <div style="background-color: #E6F7F5; border: 1px solid #00B097; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
          <span style="font-size: 32px; font-weight: 700; color: #007A68; letter-spacing: 4px;">${otpCode}</span>
        </div>
        <p style="color: #64748B; font-size: 14px; margin-bottom: 0;">
          This code will expire in 10 minutes. If you did not request this, please ignore this email.
        </p>
      </div>
    </div>
  `;

  const payload = {
    sender: SENDER,
    to: [{ email: toEmail }],
    subject: 'Your Verification Code',
    htmlContent
  };

  try {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error('Brevo API Error:', await response.text());
      return false;
    }
    const data = await response.json();
    console.log('OTP email sent. Message ID:', data.messageId);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
};

const sendInviteEmail = async (toEmail, fullName, token) => {
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY;
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const inviteLink = `${frontendUrl}/accept-invite/${token}`;

  const htmlContent = `
    <div style="font-family: 'Avenir Next', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8FAFC; border-radius: 12px;">
      <div style="background-color: #FFFFFF; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; background-color: #00B097; border-radius: 50%; width: 56px; height: 56px; font-size: 24px; color: white; margin-bottom: 16px;">🔐</div>
          <h1 style="color: #0D1514; font-size: 24px; font-weight: 700; margin: 0 0 8px;">You've been invited!</h1>
          <p style="color: #334155; font-size: 16px; margin: 0; line-height: 1.5;">
            Hi <strong>${fullName}</strong>, an administrator has invited you to join the <strong>AI Security Framework</strong>.
          </p>
        </div>
        <div style="background-color: #F0FDF9; border: 1px solid #00B097; border-radius: 8px; padding: 24px; margin-bottom: 32px; text-align: center;">
          <p style="color: #334155; font-size: 14px; margin: 0 0 20px;">Click the button below to set your password and activate your account:</p>
          <a href="${inviteLink}"
             style="display: inline-block; background-color: #00B097; color: #ffffff; text-decoration: none;
                    padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Activate My Account
          </a>
        </div>
        <p style="color: #64748B; font-size: 13px; text-align: center; margin: 0;">
          This link expires in <strong>72 hours</strong>. If you did not expect this invitation, you can safely ignore this email.
        </p>
        <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 12px; word-break: break-all;">
          Or copy this link: ${inviteLink}
        </p>
      </div>
    </div>
  `;

  const payload = {
    sender: SENDER,
    to: [{ email: toEmail }],
    subject: "You've been invited to AI Security Framework",
    htmlContent
  };

  try {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error('Brevo API Error (invite):', await response.text());
      return false;
    }
    const data = await response.json();
    console.log('Invite email sent. Message ID:', data.messageId);
    return true;
  } catch (error) {
    console.error('Error sending invite email:', error);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendInviteEmail,
};
