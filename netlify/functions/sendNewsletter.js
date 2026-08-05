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

  let payload = {};
  try {
    let bodyStr = event.body;
    if (event.isBase64Encoded && bodyStr) {
      bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
    }
    if (typeof bodyStr === 'string' && bodyStr.trim().length > 0) {
      payload = JSON.parse(bodyStr);
    } else if (typeof bodyStr === 'object' && bodyStr !== null) {
      payload = bodyStr;
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON payload', details: e.message }) };
  }

  const action = payload.action;
  const studyId = payload.studyId;
  const recordId = payload.recordId;
  const recipientEmail = payload.recipientEmail;
  const to = payload.to;
  const subject = payload.subject;
  const html = payload.html;
  const text = payload.text;

  // Handle viability report dispatch
  if (action === 'sendViabilityReport' || studyId || recordId) {
    const targetRecordId = studyId || recordId;
    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'gerente@hipotecaaqui.com';
    const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
    const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

    if (!AIRTABLE_PAT || !BASE_ID) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta configuración de Airtable' }) };
    }

    try {
      const recordRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Hipoteca/${targetRecordId}`, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
      });

      if (!recordRes.ok) {
        const errText = await recordRes.text();
        return { statusCode: recordRes.status, headers, body: JSON.stringify({ error: 'No se pudo obtener el estudio de Airtable', details: errText }) };
      }

      const record = await recordRes.json();
      const f = record.fields || {};

      const rawName = f['Nombre y apellidos (from Ficha cliente)'] || f['Nombre contacto'] || f['Nombre'] || f['Cliente'] || 'Cliente';
      const contactName = Array.isArray(rawName) ? rawName[0] : rawName;

      const rawEmail = recipientEmail || 
        f['email contacto'] || 
        f['Email contacto'] || 
        f['Email (from Ficha cliente)'] || 
        f['email (from Ficha cliente)'] || 
        f['Email'] || 
        f['email'] || 
        f['Email cliente'];
      const targetEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;

      if (!targetEmail) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `El estudio ${targetRecordId} no tiene un email de cliente asociado.` }) };
      }

      const viability = f['Viabilidad'] || 'Pendiente';
      const user = process.env.BREVO_SMTP_USER;
      const pass = process.env.BREVO_SMTP_PASS;

      let transporter;
      if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN) {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: SENDER_EMAIL,
            clientId: GMAIL_CLIENT_ID,
            clientSecret: GMAIL_CLIENT_SECRET,
            refreshToken: GMAIL_REFRESH_TOKEN
          }
        });
      } else if (user && pass) {
        transporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: { user, pass }
        });
      } else {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'No hay credenciales SMTP u OAuth2 configuradas' }) };
      }

      const emailBodyHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #33475b;">
        <h2 style="color: #33475b;">Informe de Viabilidad Hipotecaria</h2>
        <p>Hola <strong>${contactName}</strong>,</p>
        <p>Hemos completado la evaluación de tu estudio de financiación en <strong>Hipoteca Aquí</strong>.</p>
        <p>Resultado del análisis: <strong>${viability}</strong></p>
        <p>Atentamente,<br><strong>Dirección de Gerencia</strong><br>Hipoteca Aquí</p>
      </div>`;

      const mailResult = await transporter.sendMail({
        from: `"Hipoteca Aquí - Gerencia" <${SENDER_EMAIL}>`,
        to: targetEmail,
        subject: `Informe de Viabilidad Hipotecaria - ${contactName}`,
        html: emailBodyHtml
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Informe enviado con éxito a ${targetEmail} desde ${SENDER_EMAIL}`,
          messageId: mailResult.messageId
        })
      };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

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
