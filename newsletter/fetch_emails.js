require('dotenv').config();
const fetch = require('node-fetch');

// Airtable credentials (hard‑coded for now – consider moving to .env for security)
const BASE_ID = 'appdpPB3CK0d5R2oI';
const API_KEY = 'patapt61z0HwTUIDH.655a5a30d9af22ff222bfb5b53b427613dce343bff42e188665f34e8d5ff5171';
const TABLE_NAME = 'Leads';
const VIEW_NAME = 'newsletter';

async function fetchNewsletterEmails() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?view=${encodeURIComponent(VIEW_NAME)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!response.ok) {
    console.error('Airtable request failed:', response.status, await response.text());
    process.exit(1);
  }

  const data = await response.json();
  // Assuming the email field is named "Email" – adjust if different
  const emails = data.records
    .map(record => record.fields.Email)
    .filter(email => typeof email === 'string' && email.length > 0);

  console.log('Fetched', emails.length, 'emails');
  console.log(JSON.stringify(emails, null, 2));
}

module.exports = fetchNewsletterEmails;
