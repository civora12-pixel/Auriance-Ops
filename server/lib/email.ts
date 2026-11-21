/**
 * Automatic emails to shop customers (email confirmation, password reset).
 *
 * Off until RESEND_API_KEY and EMAIL_FROM are set in the server's variables
 * (after the domain is bought and verified with the email service). While off,
 * nothing is sent and customers use the WhatsApp reset instead.
 */
export type Email = { to: string; subject: string; text: string; html: string };

export type Mailer = {
  enabled: boolean;
  send: (email: Email) => Promise<void>;
};

export const disabledMailer: Mailer = {
  enabled: false,
  send: async () => {},
};

export function mailerFromEnv(
  env: { RESEND_API_KEY?: string; EMAIL_FROM?: string },
  log: (msg: string) => void = console.log,
): Mailer {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!key || !from) return disabledMailer;
  return {
    enabled: true,
    send: async (email) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
      if (!res.ok) log(`Email to ${email.to} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A short branded email with one button. */
export function buttonEmail(opts: {
  lang: "en" | "ar";
  to: string;
  subject: string;
  greeting: string;
  body: string;
  button: string;
  url: string;
  footer: string;
}): Email {
  const dir = opts.lang === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html><html dir="${dir}"><body style="margin:0;background:#fff8f7;font-family:Arial,Helvetica,sans-serif;color:#3a1219">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="font-size:22px;font-weight:bold;color:#8e1028;margin:0 0 16px">Auriance</p>
<p style="font-size:16px;margin:0 0 8px">${escapeHtml(opts.greeting)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${escapeHtml(opts.body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${escapeHtml(opts.button)}</a></p>
<p style="font-size:13px;color:#85525b;line-height:1.5;margin:0">${escapeHtml(opts.footer)}</p>
</div></body></html>`;
  const text = `${opts.greeting}\n\n${opts.body}\n\n${opts.url}\n\n${opts.footer}`;
  return { to: opts.to, subject: opts.subject, text, html };
}
