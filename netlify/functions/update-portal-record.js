// update-portal-record.js
// Serverless function to update Contacts or Hipoteca records in Airtable for authenticated Associates and Admins.
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
    const { type, id, fields } = data;

    if (!type || !id || !fields) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'type, id, and fields are required' }) };
    }

    if (type !== 'contact' && type !== 'estudio') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid record type' }) };
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

    // 2. Authorize: Check if the user is an Associate or Admin in Franquiciados
    const assocFormula = encodeURIComponent(`FIND(LOWER("${userEmail}"), LOWER({Email} & "")) > 0`);
    const assocRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Franquiciados?filterByFormula=${assocFormula}&maxRecords=1`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const assocData = await assocRes.json();

    const isAssociateOrAdmin = assocData.records && assocData.records.length > 0;
    if (!isAssociateOrAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized: Only Associates and Admins can modify records.' }) };
    }

    const tableName = type === 'contact' ? 'Contacts' : 'Hipoteca';
    console.log(`[DEBUG] Updating ${tableName} record ${id} for associate ${userEmail}`);

    // 3. Patch Airtable record
    const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableName}/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      console.error(`[ERROR] Airtable update failed:`, updateData);
      throw new Error(updateData.error?.message || 'Error updating record in Airtable');
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: `${type} updated successfully` }) };

  } catch (error) {
    console.error('Update record error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
