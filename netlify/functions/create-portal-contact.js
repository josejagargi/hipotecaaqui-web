// create-portal-contact.js
// Serverless function to create a new Contact record in Airtable for authenticated Associates and Admins.
exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing token' }) };
  }

  const token = authHeader.split(' ')[1];
  const AIRTABLE_PAT  = process.env.AIRTABLE_PAT;
  const BASE_ID       = process.env.AIRTABLE_BASE_ID;
  const FIREBASE_KEY  = process.env.FIREBASE_API_KEY;

  try {
    const data = JSON.parse(event.body);
    const { name, email, phone } = data;

    if (!name || !email || !phone) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre y apellidos, Email y Teléfono son obligatorios' }) };
    }

    const phoneRegex = /^[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'El teléfono debe tener exactamente 9 dígitos' }) };
    }

    // 1. Verify Firebase ID token
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.users || verifyData.users.length === 0) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    const userEmail = verifyData.users[0].email.trim();

    // Normalize test emails for Javier
    let searchEmail = userEmail;
    if (userEmail.toLowerCase() === 'javiergarciaginer@outlook.com' || userEmail.toLowerCase() === 'josejagargi@gmail.com') {
      searchEmail = 'josejagargi@gmail.com';
    }

    // 2. Authorize: Check if the user is an Associate or Admin in Franquiciados
    const assocFormula = encodeURIComponent(`FIND(LOWER("${searchEmail}"), LOWER({Email} & "")) > 0`);
    const assocRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Franquiciados?filterByFormula=${assocFormula}&maxRecords=1`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const assocData = await assocRes.json();

    const isAssociateOrAdmin = assocData.records && assocData.records.length > 0;
    if (!isAssociateOrAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized: Only Associates and Admins can create contacts.' }) };
    }

    const assocId = assocData.records[0].id;
    console.log(`[DEBUG] Creating contact for associate ID: ${assocId} (${userEmail})`);

    // 3. Create Airtable Contact record
    const contactFields = {
      'Nombre y apellidos': name,
      'Email': email,
      'Franquiciados': [assocId]
    };
    if (phone) {
      contactFields['Telefono'] = String(phone);
    }

    const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: contactFields })
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error(`[ERROR] Airtable contact creation failed:`, createData);
      throw new Error(createData.error?.message || 'Error creating contact in Airtable');
    }

    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ 
        success: true, 
        message: 'Contacto creado correctamente', 
        contact: {
          id: createData.id,
          name: createData.fields['Nombre y apellidos'],
          email: createData.fields['Email'],
          phone: createData.fields['Telefono']
        }
      }) 
    };

  } catch (error) {
    console.error('Create contact error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
