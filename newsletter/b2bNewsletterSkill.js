require('dotenv').config();
const fetch = require('node-fetch');

/**
 * B2B Newsletter Skill (v2)
 * -----------------------
 * - Sends up to 300 newsletters per day based on the `Fecha` field in the Content table.
 * - Content fields: Titulo, Detalles, imagen (attachment), URL, Fecha, Status.
 * - After a successful send the lead record is marked as `Enviado = true` and the Content record's `Status` is set to "Enviada".
 */

// ---------------------------------------------------------------------------
// Configuration – keep secrets in .env
// ---------------------------------------------------------------------------
const LEADS_BASE_ID = process.env.AIRTABLE_LEADS_BASE_ID || 'appdpPB3CK0d5R2oI';
const CONTENT_BASE_ID = process.env.AIRTABLE_CONTENT_BASE_ID || LEADS_BASE_ID; // same base unless overridden
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'patapt61z0HwTUIDH.655a5a30d9af22ff222bfb5b53b427613dce343bff42e188665f34e8d5ff5171';

const LEADS_TABLE = 'Leads';
const CONTENT_TABLE = 'Content'; // table that stores the newsletter content

// Netlify function endpoint that actually sends the e‑mail
const SEND_FUNCTION_URL = process.env.SEND_NEWSLETTER_URL || 'https://hipotecaaqui.netlify.app/.netlify/functions/sendNewsletter';

/** Helper to call Airtable API */
async function airtableRequest({ baseId, table, method = 'GET', query = '', body = null }) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${query}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(url, options);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Airtable request failed ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/** Build HTML from Content record fields */
function buildHtmlFromContent(record) {
  const fields = record.fields || {};
  const titulo = fields.Titulo || '';
  const detalles = fields.Detalles || '';
  const url = fields.URL || '';
  // imagen is an attachment array; take first if exists
  const imagenArray = fields.imagen || [];
  const imagenUrl = (imagenArray[0] && imagenArray[0].url) ? imagenArray[0].url : '';
  // Simple template – you can customize further
  return `
    <h1 style="margin:0;font-size:28px;font-weight:800;line-height:1.2;color:#33475b;">${titulo}</h1>
    ${imagenUrl ? `<img src="${imagenUrl}" alt="${titulo}" style="max-width:100%;margin:20px 0;"/>` : ''}
    <p style="font-size:16px;color:#1a1a1a;">${detalles}</p>
    ${url ? `<p style="font-size:14px;"><a href="${url}" target="_blank">Ver más</a></p>` : ''}
  `;
}

/** Fetch today's content (status not Enviada) */
async function getTodayContent() {
  const today = new Date().toISOString().split('T')[0];
  const formula = `AND({Fecha} = '${today}', {Status} != 'Enviada')`;
  const query = `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const data = await airtableRequest({ baseId: CONTENT_BASE_ID, table: CONTENT_TABLE, query });
  if (!data.records.length) {
    throw new Error('No content found for today (or already sent). Create a record in Content with Fecha = today and Status not "Enviada".');
  }
  const record = data.records[0];
  return {
    id: record.id,
    html: buildHtmlFromContent(record),
    subject: record.fields.Asunto || 'Newsletter AKIA',
  };
}

/** Fetch up to 300 leads scheduled for today or earlier that haven’t been sent yet */
async function getLeadsBatch() {
  const today = new Date().toISOString().split('T')[0];
  // Filter: Email confirmado exists, not Enviado, and Fecha <= today
  const formula = `AND({Email confirmado}, NOT({Enviado}), IS_BEFORE({Fecha}, DATEADD(TODAY(), 1, 'day'))) `;
  const query = `?filterByFormula=${encodeURIComponent(formula)}&pageSize=300`;
  const data = await airtableRequest({ baseId: LEADS_BASE_ID, table: LEADS_TABLE, query });
  return data.records.map(r => ({
    id: r.id,
    email: r.fields['Email confirmado'],
    name: r.fields['Nombre'] || '',
  }));
}

/** Send a single e‑mail via the Netlify function */
async function sendEmail(to, subject, html) {
  const payload = { to, subject, html };
  const resp = await fetch(SEND_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Send function failed ${resp.status}: ${txt}`);
  }
  return resp.json();
}

/** Mark leads as sent in Airtable */
async function markLeadsAsSent(recordIds) {
  const chunks = [];
  for (let i = 0; i < recordIds.length; i += 10) {
    chunks.push(recordIds.slice(i, i + 10));
  }
  for (const batch of chunks) {
    const updates = batch.map(id => ({ id, fields: { Enviado: true } }));
    await airtableRequest({ baseId: LEADS_BASE_ID, table: LEADS_TABLE, method: 'PATCH', body: { records: updates } });
  }
}

/** Update Content record status to "Enviada" */
async function markContentAsSent(contentId) {
  await airtableRequest({
    baseId: CONTENT_BASE_ID,
    table: CONTENT_TABLE,
    method: 'PATCH',
    body: { records: [{ id: contentId, fields: { Status: 'Enviada' } }] },
  });
}

/** Main entry point */
async function runB2BNewsletterCampaign() {
  try {
    const content = await getTodayContent();
    const leads = await getLeadsBatch();
    if (!leads.length) {
      console.log('No leads to send today – either all sent or none scheduled.');
      return { sent: 0 };
    }
    console.log(`Sending ${leads.length} B2B newsletters (max 300 per day)...`);
    const sentIds = [];
    for (const lead of leads) {
      try {
        const personalizedHtml = content.html.replace(/{{NAME}}/g, lead.name);
        await sendEmail(lead.email, content.subject, personalizedHtml);
        sentIds.push(lead.id);
      } catch (e) {
        console.error(`Failed to send to ${lead.email}:`, e.message);
      }
    }
    if (sentIds.length) await markLeadsAsSent(sentIds);
    await markContentAsSent(content.id);
    console.log(`Successfully sent ${sentIds.length} newsletters and marked content as Enviada.`);
    return { sent: sentIds.length };
  } catch (err) {
    console.error('B2B Newsletter skill error:', err.message);
    throw err;
  }
}

module.exports = { runB2BNewsletterCampaign };
