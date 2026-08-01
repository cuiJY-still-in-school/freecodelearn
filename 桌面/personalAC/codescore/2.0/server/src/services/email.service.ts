// PersonalAC 2.0 — 邮件服务 (Resend API)

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = 'PersonalAC <official@jkt100.cn>'

export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL] No RESEND_API_KEY configured. OTP for ${email}: ${code}`)
    return true // 开发模式下跳过
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `PersonalAC 登录验证码：${code}`,
        html: buildOtpHtml(code),
      }),
    })

    if (!response.ok) {
      console.error('[EMAIL] Resend API error:', await response.text())
      return false
    }
    return true
  } catch (err: any) {
    console.error('[EMAIL] Send failed:', err.message)
    return false
  }
}

function buildOtpHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, sans-serif; background: #faf9f5; padding: 32px;">
  <div style="max-width: 420px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 0.5px solid #e6dfd8; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 400; color: #141413; margin: 0;">PersonalAC</h1>
      <p style="color: #6c6a64; font-size: 14px; margin-top: 4px;">AI 学伴 · 登录验证</p>
    </div>

    <p style="font-size: 16px; color: #3d3d3a; margin-bottom: 20px;">你的登录验证码是：</p>

    <div style="text-align: center; margin: 24px 0;">
      <span style="font-family: 'JetBrains Mono', monospace; font-size: 44px; font-weight: 600; letter-spacing: 16px; color: #141413; background: #f5f0e8; padding: 16px 24px; border-radius: 8px;">${code}</span>
    </div>

    <div style="background: #faf5eb; border: 0.5px solid #d4a017; border-radius: 8px; padding: 12px 16px; margin: 20px 0;">
      <p style="color: #7a5c0d; font-size: 13px; margin: 0;">验证码 10 分钟内有效，仅能使用一次。请勿分享给他人。</p>
    </div>

    <p style="font-size: 13px; color: #8e8b82; text-align: center; margin-top: 24px;">
      如果您没有尝试登录 PersonalAC，请忽略此邮件。
    </p>
  </div>
</body>
</html>`
}
