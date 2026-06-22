const nodemailer = require('nodemailer');

/**
 * Netlify Function to send a newsletter via Brevo SMTP.
 * Expected JSON body:
 * {
 *   "to": "recipient@example.com",
 *   "subject": "Your newsletter subject",
 *   "html": "<p>HTML content</p>"
 * }
 */
exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON payload' }) };
  }

  const { to, subject, html, text } = payload;
  if (!to || !subject || !(html || text)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: to, subject, html/text' }) };
  }

  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_PASS;
  if (!user || !pass) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SMTP credentials not configured' }) };
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user,
      pass
    }
  });

  try {
    const fs = require('fs');
    await transporter.sendMail({
      from: `${user}`,
      to,
      subject,
      html,
      text: text || undefined,
      attachments: [{
        filename: 'akialogo.png',
        path: 'src/assets/akialogo.png',
        cid: 'logo.png'
      }]
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Newsletter sent successfully' })
    };
  } catch (error) {
    console.error('Error sending newsletter:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to send newsletter', details: error.message })
    };
  }
};
