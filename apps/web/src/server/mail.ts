import { prisma } from "@straume/db";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; contentType: string; storageKey: string }[];
};

export interface MailProvider {
  readonly name: string;
  send(mail: OutboundMail): Promise<{ id: string }>;
}

class LogMailProvider implements MailProvider {
  readonly name = "log";
  async send(mail: OutboundMail): Promise<{ id: string }> {
    const row = await prisma.mailLog.create({
      data: {
        toAddress: mail.to,
        subject: mail.subject,
        body: mail.text,
        provider: this.name,
        meta: { attachments: mail.attachments ?? [] },
      },
    });
    console.log(`[e-post/log] til ${mail.to}: ${mail.subject}`);
    return { id: row.id };
  }
}

export function mailProvider(): MailProvider {
  const name = process.env.MAIL_PROVIDER ?? "log";
  if (name !== "log") {
    throw new Error(`Ukjent e-postleverandør «${name}». Fase 1 støtter «log».`);
  }
  return new LogMailProvider();
}
