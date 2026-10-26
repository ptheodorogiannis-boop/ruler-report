// Delivery channels used by automations and goal alerts: email (SMTP or Outbox), in-app, WhatsApp / Slack /
// Teams / Discord / Telegram via webhook or bot API.
import nodemailer from 'nodemailer';
import { db } from '@/lib/db';

export async function notify(companyId: number, projectId: number | null, title: string, body = '', link?: string) {
  await db.notification.create({ data: { companyId, projectId, title, body, link } });
}

export const smtpConfigured = () => !!process.env.SMTP_HOST;

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export async function sendEmail(to: string[], subject: string, html: string, opts: { fromName?: string | null; companyId?: number | null; attachments?: EmailAttachment[] } = {}) {
  const fromName = opts.fromName;
  const names = opts.attachments?.length ? opts.attachments.map((a) => a.filename) : undefined;
  const results: { to: string; status: 'sent' | 'queued' | 'error'; error?: string }[] = [];
  for (const addr of to) {
    if (!smtpConfigured()) {
      await db.outbox.create({ data: { companyId: opts.companyId ?? null, channel: 'email', toAddr: addr, subject, body: html, ...(names ? { attachmentNames: names } : {}), status: 'queued', error: 'SMTP not configured' } });
      results.push({ to: addr, status: 'queued' });
      continue;
    }
    try {
      const tx = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      const from = process.env.SMTP_FROM || 'reports@localhost';
      await tx.sendMail({ from: fromName ? `"${fromName}" <${from.replace(/.*<|>.*/g, '')}>` : from, to: addr, subject, html, attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) });
      await db.outbox.create({ data: { companyId: opts.companyId ?? null, channel: 'email', toAddr: addr, subject, body: html, ...(names ? { attachmentNames: names } : {}), status: 'sent' } });
      results.push({ to: addr, status: 'sent' });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.outbox.create({ data: { companyId: opts.companyId ?? null, channel: 'email', toAddr: addr, subject, body: html, ...(names ? { attachmentNames: names } : {}), status: 'error', error } });
      results.push({ to: addr, status: 'error', error });
    }
  }
  return results;
}

async function post(url: string, body: unknown) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(t);
  }
}

export interface ChatMessage {
  title: string;
  text: string;
  url?: string;
}

export async function sendChat(kind: 'whatsapp' | 'slack' | 'teams' | 'discord' | 'telegram', cfg: { url?: string | null; type?: string | null; botToken?: string | null; chatId?: string | null }, m: ChatMessage) {
  const plain = `${m.title}\n\n${m.text}${m.url ? `\n\n${m.url}` : ''}`;
  switch (kind) {
    case 'slack':
      return post(cfg.url!, { text: `*${m.title}*\n${m.text}${m.url ? `\n<${m.url}|Open report>` : ''}` });
    case 'discord':
      return post(cfg.url!, { content: `**${m.title}**\n${m.text}${m.url ? `\n${m.url}` : ''}` });
    case 'teams':
      return post(cfg.url!, { '@type': 'MessageCard', '@context': 'https://schema.org/extensions', summary: m.title, title: m.title, text: m.text, potentialAction: m.url ? [{ '@type': 'OpenUri', name: 'Open report', targets: [{ os: 'default', uri: m.url }] }] : [] });
    case 'telegram':
      return post(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, { chat_id: cfg.chatId, text: plain, disable_web_page_preview: false });
    case 'whatsapp': {
      // generic webhook (Make / Zapier / n8n → WhatsApp). Provider flavours reshape the body.
      if (cfg.type === 'zapi') return post(cfg.url!, { phone: undefined, message: plain });
      if (cfg.type === 'evolution') return post(cfg.url!, { text: plain });
      return post(cfg.url!, { title: m.title, message: m.text, text: plain, url: m.url });
    }
  }
}
