import { SMTP_HOST, SMTP_PORT, SMTP_PASS, SMTP_USER } from './config'
import { logger } from './logger'

export function validateSmtpConfig(): void {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Missing SMTP credentials: SMTP_USER 和 SMTP_PASS 为必填项（用于发送验证码邮件）。\n' +
        '请在 .env 中配置，例如 QQ 邮箱：\n' +
        '  SMTP_HOST=smtp.qq.com\n' +
        '  SMTP_PORT=587\n' +
        '  SMTP_USER=你的邮箱@qq.com\n' +
        '  SMTP_PASS=授权码（非QQ密码，在 QQ 邮箱设置→账户→开启 POP3/SMTP 后生成）\n' +
        '详见 README "SMTP 邮件配置" 章节。'
    )
  }
  logger.info('SMTP config validated', { host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER })
}
