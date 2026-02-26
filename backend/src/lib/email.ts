import nodemailer from "nodemailer";
import { env } from "../config/env";

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendEmail(payload: MailInput): Promise<void> {
  if (!smtpConfigured()) {
    console.log("[EMAIL SIMULATION]", {
      from: env.EMAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return;
  }

  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}
