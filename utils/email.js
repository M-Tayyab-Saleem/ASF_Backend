const sendOTPEmail = async (toEmail, otpCode) => {
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY;
  const url = 'https://api.brevo.com/v3/smtp/email';

  const htmlContent = `
    <div style="font-family: 'Avenir Next', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #F8FAFC; border-radius: 12px;">
      <div style="background-color: #FFFFFF; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); text-align: center;">
        <h1 style="color: #0D1514; font-size: 24px; font-weight: 700; margin-bottom: 8px;">Verify Your Email</h1>
        <p style="color: #334155; font-size: 16px; margin-bottom: 32px; line-height: 1.5;">
          Thank you for registering. Please use the following code to verify your email address and complete your registration.
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
    sender: { name: 'App Security Framework', email: 'tsaleem@abidisolutions.com' },
    to: [{ email: toEmail }],
    subject: 'Your Verification Code',
    htmlContent: htmlContent
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Brevo API Error:', errorText);
      return false;
    }
    
    const data = await response.json();
    console.log('Message sent via API successfully. Message ID:', data.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email via Brevo API:', error);
    return false;
  }
};

module.exports = {
  sendOTPEmail,
};
