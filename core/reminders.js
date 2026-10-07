'use strict';
// Avvisi di rinnovo: chi va avvisato, come si raggruppano le email, come si scrive il messaggio.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

const DEFAULT_SUBJECT = 'Promemoria rinnovo tessera – {associazione}';
const DEFAULT_BODY = `Gentile tesserato/a,

ti ricordiamo che la tessera di {associazione} sta per scadere:

{elenco}

Per rinnovarla puoi contattarci:
{contatti}

Grazie per far parte di {associazione}!

—
Per non ricevere più questi avvisi rispondi a questa email.`;

const toUtc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const daysBetween = (fromIso, toIso) => Math.round((toUtc(toIso) - toUtc(fromIso)) / 864e5);
const fmt = (iso) => iso.split('-').reverse().join('/');

// Ultima tessera di ogni persona (come nell'elenco: iscrizione più recente).
function latestByPerson(state) {
  const latest = new Map();
  for (const m of Object.values(state.memberships)) {
    const c = latest.get(m.personId);
    if (!c || m.iscrizione > c.iscrizione || (m.iscrizione === c.iscrizione && m.scadenza > c.scadenza)) latest.set(m.personId, m);
  }
  return latest;
}

// Ritorna { groups, skipped }.
// groups: un elemento per indirizzo email, con tutte le tessere in scadenza collegate.
function dueReminders(state, today, { daysBefore } = {}) {
  const win = Number.isFinite(daysBefore) ? daysBefore : state.settings.mail.daysBefore;
  const byEmail = new Map();
  const skipped = { senzaEmail: [], nonAttivi: 0, escluse: 0, nascoste: 0 };
  for (const m of latestByPerson(state).values()) {
    const days = daysBetween(today, m.scadenza);
    if (days < 0 || days > win) continue;
    if (m.reminders && m.reminders.pre) continue;
    const p = state.persons[m.personId];
    if (!p) continue;
    if (m.hidden) { skipped.nascoste++; continue; }
    if (m.stato !== 'Attivo') { skipped.nonAttivi++; continue; }
    if (p.noEmail) { skipped.escluse++; continue; }
    if (!isEmail(p.email)) { skipped.senzaEmail.push({ key: m.key, nome: `${p.cognome} ${p.nome}`.trim(), scadenza: m.scadenza }); continue; }
    const email = p.email.trim().toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { email, items: [] });
    byEmail.get(email).items.push({ key: m.key, personId: p.id, nome: p.nome, cognome: p.cognome, scadenza: m.scadenza, days });
  }
  const groups = [...byEmail.values()].map((g) => {
    g.items.sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.cognome.localeCompare(b.cognome, 'it'));
    g.firstExpiry = g.items[0].scadenza;
    return g;
  }).sort((a, b) => a.firstExpiry.localeCompare(b.firstExpiry) || a.email.localeCompare(b.email));
  return { groups, skipped };
}

function contactsText(assoc) {
  const lines = [];
  if (assoc.telefono) lines.push(`Telefono: ${assoc.telefono}`);
  if (assoc.email) lines.push(`Email: ${assoc.email}`);
  if (assoc.indirizzo) lines.push(`Sede: ${assoc.indirizzo}`);
  return lines.join('\n') || 'Rivolgiti all’associazione.';
}

// Il testo usa la data di scadenza (mai "tra 30 giorni"): chi è già a pochi giorni non riceve una frase falsa.
function renderMail(mail, assoc, group) {
  const nome = (assoc.nome || '').trim() || 'la nostra associazione';
  const elenco = group.items.map((i) => `• ${`${i.nome} ${i.cognome}`.trim()} — scade il ${fmt(i.scadenza)}`).join('\n');
  const fill = (tpl) => String(tpl || '')
    .replace(/\{elenco\}/g, elenco)
    .replace(/\{associazione\}/g, nome)
    .replace(/\{contatti\}/g, contactsText(assoc));
  return { to: group.email, subject: fill(mail.subject || DEFAULT_SUBJECT).replace(/\s+/g, ' ').trim(), text: fill(mail.body || DEFAULT_BODY) };
}

module.exports = { EMAIL_RE, isEmail, DEFAULT_SUBJECT, DEFAULT_BODY, daysBetween, latestByPerson, dueReminders, renderMail, contactsText };
