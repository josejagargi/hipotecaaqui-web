// register-referrer-client.js
// Netlify serverless function to register or locate a client referrer using Name, Surnames, Email.
// Creates or updates record in Contacts table in Airtable and returns their referral code/link.

const CONTACTS_TABLE = 'Contacts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuración de servidor incompleta.' }) };
  }

  try {
    const { nombre, apellidos, email } = JSON.parse(event.body || '{}');

    if (!nombre || !apellidos || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre, apellidos y email son obligatorios.' }) };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El formato del email no es válido.' }) };
    }

    const cleanNombre = nombre.trim();
    const cleanApellidos = apellidos.trim();
    const fullName = `${cleanNombre} ${cleanApellidos}`;

    const airtableBase = `https://api.airtable.com/v0/${BASE_ID}`;
    const authHeader = {
      'Authorization': `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json'
    };

    // 1. Check if contact already exists by email
    const filterFormula = encodeURIComponent(`LOWER({Email} & "") = '${cleanEmail}'`);
    const checkRes = await fetch(
      `${airtableBase}/${CONTACTS_TABLE}?filterByFormula=${filterFormula}&maxRecords=1`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const checkData = await checkRes.json();

    let referrerRecordId = null;
    let referralCode = null;
    let isExisting = false;

    if (checkData.records && checkData.records.length > 0) {
      // Existing client referrer
      const record = checkData.records[0];
      referrerRecordId = record.id;
      referralCode = record.fields['Referral Code'] || record.id;
      isExisting = true;
    } else {
      // 2. Create new contact record in Contacts table
      const newContactFields = {
        'Nombre y apellidos': fullName,
        'Email': cleanEmail,
        'Aceptacion LOPD': true
      };

      const createRes = await fetch(
        `${airtableBase}/${CONTACTS_TABLE}`,
        {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ fields: newContactFields })
        }
      );

      const createData = await createRes.json();

      if (!createRes.ok) {
        console.error('Error al crear registro en Airtable:', createData);
        throw new Error(createData.error?.message || 'Error al guardar el contacto');
      }

      referrerRecordId = createData.id;
      referralCode = createData.fields['Referral Code'] || createData.id;
    }

    const domain = event.headers?.host || 'hipotecaaqui.com';
    const protocol = domain.includes('localhost') ? 'http' : 'https';
    const referralUrl = `${protocol}://${domain}/referidos/?ref=${referralCode}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: isExisting
          ? '¡Ya estabas registrado! Hemos recuperado tu enlace de referido.'
          : '¡Registro completado con éxito! Ya puedes empezar a compartir tu enlace.',
        referrer: {
          id: referrerRecordId,
          nombre: cleanNombre,
          apellidos: cleanApellidos,
          email: cleanEmail,
          referralCode,
          referralUrl
        }
      })
    };

  } catch (error) {
    console.error('Register referrer client error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor.', detail: error.message })
    };
  }
};
