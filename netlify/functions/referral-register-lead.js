// referral-register-lead.js
// Registers a new lead from the public referral landing page
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { nombre, email, telefono, referralCode } = JSON.parse(event.body);

    if (!nombre || !email || !telefono) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre, email y teléfono son obligatorios.' }) };
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const BASE_ID = process.env.AIRTABLE_BASE_ID;
    const CONTACTS_TABLE = 'Contacts';

    // Check if lead already exists
    const checkFormula = encodeURIComponent(`{Email} = '${email}'`);
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE}?filterByFormula=${checkFormula}&fields[]=Nombre`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const checkData = await checkRes.json();
    if (checkData.records && checkData.records.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Este email ya está registrado.' }) };
    }

    // Find the referrer by referral code (which is their recordid or Referral Code field)
    let referrerId = null;
    if (referralCode) {
      // Try matching by Referral Code field first, then by recordid formula
      const refFormula = encodeURIComponent(`OR({Referral Code} = '${referralCode}', {recordid} = '${referralCode}')`);
      const refRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE}?filterByFormula=${refFormula}&fields[]=Nombre`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
      );
      const refData = await refRes.json();
      if (refData.records && refData.records.length > 0) {
        referrerId = refData.records[0].id;
      }
    }

    // Build new contact fields
    const newContactFields = {
      'Nombre': nombre,
      'Email': email,
      'Telefono': telefono,
      'Estado': 'Pendiente'
    };

    // If we found a referrer, link them
    if (referrerId) {
      newContactFields['referido por'] = [referrerId];
    }

    // Create the new lead in Contacts
    const createRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: newContactFields })
      }
    );

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('Airtable error:', createData);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al crear el registro.', detail: createData.error }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: referrerId
          ? '¡Gracias! Tu solicitud ha sido registrada. Te contactaremos pronto.'
          : '¡Gracias! Tus datos han sido registrados correctamente.',
        id: createData.id
      })
    };
  } catch (error) {
    console.error('Register lead error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno del servidor.', detail: error.message }) };
  }
};
