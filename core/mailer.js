'use strict';
// Invio via SMTP (Gmail / Outlook / altro provider) con nodemailer.

const PROVIDERS = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
};

function effectiveConfig(mail) {
  return PROVIDERS[mail.provider] || { host: mail.host, port: Number(mail.port) || 587, secure: !!mail.secure };
}

function friendlyError(err) {
  const code = err && (err.code || err.responseCode);
  if (code === 'EAUTH' || code === 535 || code === 534 || code === 530) return 'Accesso rifiutato: controlla indirizzo email e password per app.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND', 'ECONNREFUSED', 'EDNS'].includes(code)) return 'Impossibile collegarsi al server di posta: controlla la connessione a internet e le impostazioni del provider.';
  if (code === 'EENVELOPE' || code === 553 || code === 550) return 'Indirizzo del destinatario rifiutato dal server.';
  return (err && err.message) || String(err);
}
const isAuthError = (err) => ['EAUTH', 535, 534, 530].includes(err && (err.code || err.responseCode));

function createTransport(mail, password, override) {
  if (override) return override;
  const nodemailer = require('nodemailer');
  const c = effectiveConfig(mail);
  return nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: mail.user, pass: password }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
}

const fromAddress = (mail, assoc) => ({ name: (mail.fromName || assoc.nome || '').trim(), address: mail.user });

// messages: [{ to, subject, text, ... }]. Si ferma subito se l'accesso è rifiutato; rispetta il tetto per operazione.
async function sendMany({ mail, assoc, password, messages, transport, delayMs = 1000, max = 100, onProgress }) {
  const tr = createTransport(mail, password, transport);
  const results = [];
  let stopped = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (i >= max) { stopped = 'limit'; results.push({ to: m.to, ok: false, skipped: true, error: `Rimandato: tetto di ${max} invii per operazione.` }); continue; }
    if (stopped === 'auth') { results.push({ to: m.to, ok: false, skipped: true, error: 'Non inviato: accesso al server rifiutato.' }); continue; }
    try {
      await tr.sendMail({ from: fromAddress(mail, assoc), replyTo: mail.replyTo || assoc.email || undefined, to: m.to, subject: m.subject, text: m.text });
      results.push({ to: m.to, ok: true });
    } catch (err) {
      results.push({ to: m.to, ok: false, error: friendlyError(err) });
      if (isAuthError(err)) stopped = 'auth';
    }
    if (onProgress) onProgress(i + 1, messages.length);
    if (i < messages.length - 1 && delayMs > 0 && stopped !== 'auth') await new Promise((r) => setTimeout(r, delayMs));
  }
  if (tr.close) tr.close();
  return { results, stopped };
}

module.exports = { PROVIDERS, effectiveConfig, friendlyError, createTransport, sendMany };
