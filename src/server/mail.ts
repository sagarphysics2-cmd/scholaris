import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Mail transport. "console" logs messages (development); "smtp" sends via nodemailer.
 * The transporter is created lazily so builds never need SMTP credentials.
 */
let transporterPromise: Promise<{ sendMail(m: object): Promise<unknown> }> | undefined;

async function transporter() {
  transporterPromise ??= (async () => {
    const nodemailer = await import("nodemailer");
    const e = env();
    return nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
  })();
  return transporterPromise;
}

export async function sendMail(mail: Mail) {
  const e = env();
  if (e.MAIL_DRIVER === "console" || e.NODE_ENV === "test") {
    if (e.NODE_ENV !== "test") {
      console.info(`\n📧 [mail:console] To: ${mail.to}\n   Subject: ${mail.subject}\n   ${mail.text.replace(/\n/g, "\n   ")}\n`);
    }
    return;
  }
  const t = await transporter();
  await t.sendMail({ from: e.MAIL_FROM, ...mail });
}
