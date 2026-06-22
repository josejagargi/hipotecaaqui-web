// get-contact-docs.js
// Netlify Function to retrieve current uploaded documents for a Contact using recordId (c)
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

  const contactId = event.queryStringParameters.c;
  if (!contactId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing contact ID parameter (c)' }) };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Airtable configuration missing in environment variables.' })
    };
  }

  try {
    const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/Contacts/${contactId}`;
    console.log(`[DEBUG] Fetching contact docs for ID: ${contactId}`);

    const res = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[ERROR] Airtable fetch failed for contact ${contactId}:`, data);
      return { 
        statusCode: res.status, 
        headers, 
        body: JSON.stringify({ error: data.error?.message || 'Error fetching contact from Airtable' }) 
      };
    }

    const fields = data.fields || {};

    // Map the fields safely
    const responseData = {
      id: data.id,
      name: fields['Nombre y apellidos'] || 'Cliente',
      email: fields['Email'] || '',
      aceptacionLOPD: !!fields['Aceptacion LOPD'],
      docs: {
        nif: fields['NIF'] || [],
        nominas: fields['Nominas'] || [],
        vidaLaboral: fields['Vida laboral'] || [],
        renta: fields['Renta'] || [],
        cuotasPrestamos: fields['Cuotas prestamos'] || [],
        extractosBancarios: fields['Extractos bancarios'] || [],
        otrosAdjuntos: fields['Otros adjuntos'] || []
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('[ERROR] get-contact-docs error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
