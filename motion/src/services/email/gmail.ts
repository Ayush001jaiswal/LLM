import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

export interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
}

/**
 * Clean app password (strips whitespace if user copied "abcd efgh ijkl mnop")
 */
export function cleanAppPassword(pass: string): string {
  return pass.replace(/\s+/g, "").trim();
}

/**
 * Tests whether the provided Gmail email and 16-character App Password are valid.
 */
export async function testGmailCredentials(
  email: string,
  rawPassword: string
): Promise<{ success: boolean; error?: string }> {
  const pass = cleanAppPassword(rawPassword);
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: email.trim(),
        pass,
      },
    });

    await transporter.verify();
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message || "Failed to verify Gmail credentials";
    if (msg.includes("Invalid second-factor") || msg.includes("BadCredentials") || msg.includes("535-5.7.8")) {
      return {
        success: false,
        error: "Invalid Gmail address or App Password. Ensure 2-Step Verification is ON and generate an App Password at https://myaccount.google.com/apppasswords",
      };
    }
    return { success: false, error: msg };
  }
}

/**
 * Sends an email using Gmail SMTP.
 */
export async function sendGmail(
  email: string,
  rawPassword: string,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const pass = cleanAppPassword(rawPassword);
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: email.trim(),
        pass,
      },
    });

    const info = await transporter.sendMail({
      from: email.trim(),
      to: to.trim(),
      subject,
      text: body,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Searches the user's Gmail inbox via IMAP.
 */
export async function searchGmail(
  email: string,
  rawPassword: string,
  query: string,
  limit = 5
): Promise<{ success: boolean; emails?: EmailSummary[]; error?: string }> {
  const pass = cleanAppPassword(rawPassword);
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email.trim(),
      pass,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const results: EmailSummary[] = [];

    try {
      // Search recent or query-matched messages
      const searchCriteria = query ? { body: query } : { all: true };
      const messages = await client.search(searchCriteria, { uid: true });

      // Take latest 'limit' messages
      const targetUids = (messages || []).slice(-Math.min(limit, 15)).reverse();

      if (targetUids.length > 0) {
        for await (const message of client.fetch(targetUids, {
          envelope: true,
          uid: true,
          source: false,
        })) {
          const env = message.envelope;
          const dateVal = env?.date;
          const dateStr = dateVal instanceof Date ? dateVal.toISOString() : (dateVal ? String(dateVal) : "");
          results.push({
            uid: message.uid,
            from: env?.from?.[0]?.address || "Unknown",
            subject: env?.subject || "(No Subject)",
            date: dateStr,
          });
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, emails: results };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      // ignore
    }
    return { success: false, error: (err as Error).message };
  }
}
