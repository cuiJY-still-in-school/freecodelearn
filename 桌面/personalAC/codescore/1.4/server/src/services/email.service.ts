// OTP email sending via Resend API (auth flow only — IMAP polling removed)

function buildOtpHtml(code: string, toEmail: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1A1815;padding:26px 40px;text-align:center;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">PersonalAC</span>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 6px;font-size:11px;color:#71717A;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">登录验证</p>
            <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#18181B;letter-spacing:-0.02em;">您的验证码</h1>
            <p style="margin:0 0 28px;font-size:14px;color:#52525B;line-height:1.75;">
              您正在登录 <strong style="color:#18181B;">PersonalAC</strong>，收件邮箱为
              <strong style="color:#18181B;">${toEmail}</strong>。<br>
              请在登录页面输入以下验证码：
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center" style="background:#FAFAFA;border:1.5px solid #E4E4E7;border-radius:10px;padding:30px 0;">
                  <span style="font-size:44px;font-weight:800;color:#18181B;letter-spacing:16px;font-variant-numeric:tabular-nums;padding-left:16px;">${code}</span>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#FFF7ED;border-left:3px solid #F97316;border-radius:0 6px 6px 0;padding:13px 16px;">
                  <p style="margin:0;font-size:13px;color:#9A3412;line-height:1.65;">
                    此验证码 <strong>10 分钟</strong>内有效，且只能使用一次。<br>
                    请勿将验证码透露给任何人，包括 PersonalAC 工作人员。
                  </p>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#A1A1AA;line-height:1.7;">
              如果您没有尝试登录 PersonalAC，请忽略此邮件。您的账户安全不受影响。
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#FAFAFA;border-top:1px solid #F0F0F0;padding:18px 40px;">
            <p style="margin:0;font-size:11px;color:#A1A1AA;text-align:center;line-height:1.6;">
              PersonalAC · 此邮件由系统自动发出，请勿回复
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function resendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY 未配置')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'PersonalAC <official@jkt100.cn>', to: [to], subject, html }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(`Resend ${res.status}: ${JSON.stringify(err)}`) }
}

export async function sendWeeklyReportEmail(toEmail: string, studentId: string): Promise<void> {
  const { buildWeekReport, renderReportHTML } = await import('./report.service')
  const report = buildWeekReport(studentId)
  const html = renderReportHTML(report)
  await resendEmail(toEmail, `PersonalAC 学情周报 · ${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`, html)
}

export async function sendOtpEmail(toEmail: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY 未配置')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'PersonalAC <official@jkt100.cn>',
      to: [toEmail],
      subject: `PersonalAC 登录验证码：${code}`,
      html: buildOtpHtml(code, toEmail),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`)
  }
}
