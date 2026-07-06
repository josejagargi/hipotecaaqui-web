// netlify/functions/get-franquiciado.js
// Fetch franchisee details securely by Airtable Record ID

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  const { id } = event.queryStringParameters || {};
  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing record ID parameter (id)' }) };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    console.error('Missing Airtable environment variables.');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    console.log(`[get-franquiciado] Fetching franchisee with Record ID: ${id}`);
    
    const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/Franquiciados/${id}`;
    const response = await fetch(airtableUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Franquiciado no encontrado' }) };
      }
      const errText = await response.text();
      console.error(`Airtable error response: ${errText}`);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'Error al consultar Airtable' }) };
    }

    const record = await response.json();
    const fields = record.fields;

    // Resolve name from possible fields
    const name = fields['Nombre franquiciado'] || 
                 fields['Nombre y apellidos del representante'] || 
                 fields['Nombre comunicaciones'] || 
                 'Franquiciado';

    const email = fields['Email'] || fields['email franquiciado'] || '';
    const role = fields['Rol'] === 'Administrador' ? 'admin' : 'associate';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: record.id,
        name,
        email,
        role
      })
    };
  } catch (error) {
    console.error('Error fetching franchisee:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
