// netlify/functions/get-comparador-data.js
// Dynamic endpoint to fetch compatible products from 'comparador' for a specific study.

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
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

  const studyId = event.queryStringParameters && event.queryStringParameters.studyId;
  if (!studyId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing studyId parameter' }) };
  }

  const token = authHeader.split(' ')[1];
  const AIRTABLE_PAT  = process.env.AIRTABLE_PAT;
  const BASE_ID       = process.env.AIRTABLE_BASE_ID;
  const FIREBASE_KEY  = process.env.FIREBASE_API_KEY;

  try {
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
    if (!userEmail) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token has no email' }) };
    }

    // Normalize test emails for Javier
    let searchEmail = userEmail;
    if (userEmail.toLowerCase() === 'javiergarciaginer@outlook.com' || userEmail.toLowerCase() === 'josejagargi@gmail.com') {
      searchEmail = 'josejagargi@gmail.com';
    }

    // 2. Fetch the user's role
    const assocFormula = encodeURIComponent(`FIND(LOWER("${searchEmail}"), LOWER({Email} & "")) > 0`);
    const clientFormula = encodeURIComponent(`LOWER({Email}) = LOWER("${searchEmail}")`);

    const [assocRes, clientRes] = await Promise.all([
      fetch(`https://api.airtable.com/v0/${BASE_ID}/Franquiciados?filterByFormula=${assocFormula}&maxRecords=1`, { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }),
      fetch(`https://api.airtable.com/v0/${BASE_ID}/Contacts?filterByFormula=${clientFormula}&maxRecords=1`, { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } })
    ]);

    const [assocData, clientData] = await Promise.all([
      assocRes.json(),
      clientRes.json()
    ]);

    const existsInFranquiciados = assocData.records && assocData.records.length > 0;
    let role = 'client';
    if (existsInFranquiciados) {
      role = assocData.records[0].fields['Rol'] === 'Administrador' ? 'admin' : 'associate';
    }

    // 3. Fetch the Hipoteca record to verify ownership
    const studyRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Hipoteca/${studyId}`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );

    if (!studyRes.ok) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Estudio no encontrado' }) };
    }

    const studyRecord = await studyRes.json();
    const studyFields = studyRecord.fields || {};

    // 4. Validate ownership based on role
    let hasAccess = false;
    if (role === 'admin') {
      hasAccess = true;
    } else if (role === 'associate') {
      const emailFranquiciadoArr = studyFields['email franquiciado'] || [];
      const emailFranquiciado = Array.isArray(emailFranquiciadoArr) ? emailFranquiciadoArr[0] : emailFranquiciadoArr;
      if (emailFranquiciado && emailFranquiciado.toLowerCase().trim() === searchEmail.toLowerCase().trim()) {
        hasAccess = true;
      }
    } else {
      const emailContactoArr = studyFields['email contacto'] || [];
      const emailContacto = Array.isArray(emailContactoArr) ? emailContactoArr[0] : emailContactoArr;
      if (emailContacto && emailContacto.toLowerCase().trim() === searchEmail.toLowerCase().trim()) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'No tienes permiso para acceder a este estudio' }) };
    }

    // 5. Fetch compatible products from 'comparador' linked to this study
    const comparativaIds = studyFields['comparativa'] || [];
    if (!Array.isArray(comparativaIds) || comparativaIds.length === 0) {
      console.log(`Study ${studyId} has no linked comparativa products.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ products: [] })
      };
    }

    // Construct the OR formula using exact Record IDs
    const orFormula = `OR(${comparativaIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
    const fullFormula = `AND(OR({Resultado}='Viable', {Resultado}='Estudiar'), ${orFormula})`;
    const comparadorFormula = encodeURIComponent(fullFormula);
    const comparadorUrl = `https://api.airtable.com/v0/${BASE_ID}/comparador?filterByFormula=${comparadorFormula}&sort[0][field]=Comparativa&sort[0][direction]=asc`;

    const comparadorRes = await fetch(
      comparadorUrl,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );

    if (!comparadorRes.ok) {
      throw new Error(`Error querying comparador table: ${comparadorRes.statusText}`);
    }

    const comparadorData = await comparadorRes.json();
    
    // 6. Map and return products
    const products = (comparadorData.records || []).map(r => ({
      id: r.id,
      comparativa: r.fields['Comparativa'] || '',
      producto: r.fields['Productos aeropage & softr'] || '',
      intereses: r.fields['Total intereses pagados'] || null,
      cuotaP1: r.fields['Cuota P1'] || null,
      cuotaP2: r.fields['Cuota P2'] || null,
      tinBonif: Array.isArray(r.fields['%TIN Bonif']) ? r.fields['%TIN Bonif'][0] : r.fields['%TIN Bonif'] || null,
      detalle: Array.isArray(r.fields['Detalle hipoteca']) ? r.fields['Detalle hipoteca'][0] : r.fields['Detalle hipoteca'] || '',
      euribor: r.fields['Euribor'] !== undefined ? r.fields['Euribor'] : null,
      mejorEuribor: r.fields['Mejor Euribor'] !== undefined ? r.fields['Mejor Euribor'] : null,
      euriborPromedio: r.fields['Euribor promedio'] !== undefined ? r.fields['Euribor promedio'] : null,
      peorEuribor: r.fields['Peor Euribor'] !== undefined ? r.fields['Peor Euribor'] : null,
      resultado: r.fields['Resultado'] || '',
      requisitos: Array.isArray(r.fields['💡Requisitos']) ? r.fields['💡Requisitos'][0] : r.fields['💡Requisitos'] || ''
    }));

    console.log(`Returning ${products.length} compatible products for study ${studyId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ products })
    };

  } catch (error) {
    console.error('Error fetching comparador data:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
