import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY
const resendFromEmail = process.env.RESEND_FROM_EMAIL

const resend = resendApiKey
  ? new Resend(resendApiKey)
  : null

export async function sendAccountLockoutEmail({
  email,
  resetUrl,
}) {
  if (!resend || !resendFromEmail) {
    console.error(
      'Security email configuration is missing.'
    )

    return {
      success: false,
      error: 'Email service is not configured.',
    }
  }

  try {
    const result = await resend.emails.send({
      from: resendFromEmail,
      to: email,
      subject: 'Security alert for your Digital Dining account',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Security alert</h2>

          <p>
            Your Digital Dining account has been temporarily
            restricted because of multiple unsuccessful login attempts.
          </p>

          <p>
            If this was you, you can reset your password using
            the link below.
          </p>

          <p>
            <a
              href="${resetUrl}"
              style="
                display: inline-block;
                padding: 12px 18px;
                background: #f97316;
                color: white;
                text-decoration: none;
                border-radius: 6px;
              "
            >
              Reset Password
            </a>
          </p>

          <p>
            If you did not attempt to sign in, reset your password
            and contact Digital Dining support.
          </p>

          <p>
            Regards,<br />
            Digital Dining Security Team
          </p>
        </div>
      `,
    })

    if (result?.error) {
      console.error('Resend email error:', {
        message: result.error.message,
        name: result.error.name,
      })

      return {
        success: false,
        error: 'Email provider returned an error.',
      }
    }

    return {
      success: true,
    }
  } catch (error) {
    console.error('Security email exception:', {
      message: error?.message,
      name: error?.name,
    })

    return {
      success: false,
      error: 'Unable to send security email.',
    }
  }
}