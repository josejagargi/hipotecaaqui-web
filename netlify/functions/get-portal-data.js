// get-portal-data.js
// Uses native fetch (Node 18+) — no airtable package needed
exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
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
    // ── 1. Verify Firebase ID token ──────────────────────────────────────────
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
    if (!userEmail) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token has no email' }) };
    }

    console.log(`Processing portal data for email: [${userEmail}]`);

    // 2. Determine role: Associate or Client ───────────────────────────────
    let role = 'client';
    let userName = '';

    // Check if Associate or Admin (💼 Franquiciados table)
    const assocFormula = encodeURIComponent(`FIND(LOWER("${userEmail}"), LOWER({Email} & "")) > 0`);
    // Check if Client (Contacts table)
    const clientFormula = encodeURIComponent(`LOWER({Email}) = LOWER("${userEmail}")`);

    console.log(`[DEBUG] Querying Airtable for Associate and Client records in parallel...`);
    const [assocRes, clientRes] = await Promise.all([
      fetch(`https://api.airtable.com/v0/${BASE_ID}/Franquiciados?filterByFormula=${assocFormula}&maxRecords=1`, { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }),
      fetch(`https://api.airtable.com/v0/${BASE_ID}/Contacts?filterByFormula=${clientFormula}&maxRecords=1`, { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } })
    ]);

    const [assocData, clientData] = await Promise.all([
      assocRes.json(),
      clientRes.json()
    ]);

    let existsInFranquiciados = (assocData.records && assocData.records.length > 0) || (userEmail.toLowerCase() === 'josejagargi@gmail.com');
    const existsInContacts = clientData.records && clientData.records.length > 0;

    let assocRecordId = null;

    if (existsInFranquiciados) {
      let recordFields = {};
      if (assocData.records && assocData.records.length > 0) {
        recordFields = assocData.records[0].fields;
        assocRecordId = assocData.records[0].id;
      } else if (userEmail.toLowerCase() === 'josejagargi@gmail.com') {
        // Fallback for Developer's test email to his Franquiciados record ID
        assocRecordId = 'recjHrWME10syakFk';
        recordFields = {
          'Nombre franquiciado': 'Javi franquiciado',
          'Rol': 'Administrador'
        };
      }
      role = recordFields['Rol'] === 'Administrador' ? 'admin' : 'associate';
      userName = recordFields['Nombre franquiciado'] || recordFields['Nombre y apellidos del representante'] || recordFields['Nombre comunicaciones'] || '';
      console.log(`[DEBUG] Found associate/admin record. ID: ${assocRecordId}, Role: ${role}, Name: ${userName}`);
    } else if (existsInContacts) {
      userName = clientData.records[0].fields['Nombre y apellidos'] || '';
      console.log(`[DEBUG] Found client record. ID: ${clientData.records[0].id}, Name: [${userName}]`);
    } else {
      console.warn(`[DEBUG] No record found for [${userEmail}] in Franquiciados or Contacts.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          user: {
            email: userEmail,
            role: 'client',
            name: userEmail.split('@')[0],
            existsInContacts: false,
            existsInFranquiciados: false,
            debug_not_found: true
          },
          records: [],
          message: 'No se encontró tu ficha en Airtable.'
        })
      };
    }

    // ── 3. Fetch records from Hipoteca filtered by email ───────────────────
    let filterFormula = '';
    if (role === 'admin') {
      // Admins see all records
      console.log(`[DEBUG] Role is admin, fetching all Hipoteca records.`);
    } else if (role === 'associate') {
      const emails = [userEmail];
      if (userEmail.toLowerCase() === 'josejagargi@gmail.com') {
        emails.push('javiergarciaginer@outlook.com');
      }
      const emailConditions = emails.map(email => `FIND(LOWER("${email}"), LOWER({email franquiciado} & "")) > 0`).join(', ');
      filterFormula = encodeURIComponent(`OR(${emailConditions})`);
      console.log(`[DEBUG] Role is associate, filtering Hipoteca by email conditions: ${emails.join(', ')}.`);
    } else {
      // Client role: use FIND on the lookup field 'email contacto'
      filterFormula = encodeURIComponent(`FIND(LOWER("${userEmail}"), LOWER({email contacto} & "")) > 0`);
      console.log(`[DEBUG] Role is client, filtering Hipoteca by email contacto.`);
    }

    const hipotecaUrl = filterFormula
      ? `https://api.airtable.com/v0/${BASE_ID}/Hipoteca?filterByFormula=${filterFormula}&sort[0][field]=Created&sort[0][direction]=desc`
      : `https://api.airtable.com/v0/${BASE_ID}/Hipoteca?sort[0][field]=Created&sort[0][direction]=desc`;

    const hipotecaRes = await fetch(
      hipotecaUrl,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const hipotecaData = await hipotecaRes.json();

    const records = (hipotecaData.records || []).map(r => ({
      id: r.id,
      created: r.fields['Created'] || r.createdTime,
      contactName: (r.fields['Nombre y apellidos (from Contact)'] || ['N/A'])[0],
      loanType: r.fields['Tipo prestamo'] || 'Hipotecario',
      status: r.fields['OPER - Status'] || r.fields['Etapa'] || 'Pendiente',
      amount: r.fields['Importe a financiar scoring'] || r.fields['Importe a financiar auto'] || null,
      fields: r.fields
    }));

    // ── 4. Fetch contacts (for Admin or Associate) ───────────────────────────
    let contacts = [];
    if (role === 'admin' || role === 'associate') {
      let contactsFormula = '';
      if (role === 'associate' && assocData.records && assocData.records.length > 0) {
        const assocId = assocData.records[0].id;
        // Search where the Franquiciados array contains the associate's ID
        contactsFormula = encodeURIComponent(`FIND('${assocId}', {Franquiciados}) > 0`);
      }
      
      const contactsUrl = contactsFormula 
        ? `https://api.airtable.com/v0/${BASE_ID}/Contacts?filterByFormula=${contactsFormula}&sort[0][field]=Created&sort[0][direction]=desc`
        : `https://api.airtable.com/v0/${BASE_ID}/Contacts?sort[0][field]=Created&sort[0][direction]=desc`;

      const contactsRes = await fetch(
        contactsUrl,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
      );
      const contactsData = await contactsRes.json();
      
      contacts = (contactsData.records || []).map(c => ({
        id: c.id,
        name: c.fields['Nombre y apellidos'] || 'Sin nombre',
        email: c.fields['Email'] || 'Sin email',
        phone: c.fields['Telefono'] || 'Sin teléfono',
        fields: c.fields
      }));
    }

    console.log(`Returning data for ${userEmail}: ${records.length} records found. ID: ${assocRecordId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          id: assocRecordId,
          email: userEmail,
          role,
          name: userName,
          existsInContacts,
          existsInFranquiciados,
          debug_not_found: false
        },
        records,
        contacts
      })
    };

  } catch (error) {
    console.error('Portal data error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
