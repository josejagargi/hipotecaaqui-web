// update-portal-profile.js
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
    const newName = data.name;

    if (!newName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name is required' }) };
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

    const userEmail = verifyData.users[0].email;

    // 2. Find user in Airtable to update
    // Check if Associate or Admin (💼 Franquiciados table)
    const assocFormula = encodeURIComponent(`FIND(LOWER("${userEmail}"), LOWER({Email} & "")) > 0`);
    const assocRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Franquiciados?filterByFormula=${assocFormula}&maxRecords=1`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const assocData = await assocRes.json();

    if (assocData.records && assocData.records.length > 0) {
      const recordId = assocData.records[0].id;
      // Update Franquiciados
      await fetch(`https://api.airtable.com/v0/${BASE_ID}/Franquiciados/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Nombre franquiciado': newName
          }
        })
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Profile updated' }) };
    } else {
      // Check if Client (Contacts table)
      const clientFormula = encodeURIComponent(`FIND(LOWER("${userEmail}"), LOWER({Email} & "")) > 0`);
      const clientRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/Contacts?filterByFormula=${clientFormula}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
      );
      const clientData = await clientRes.json();

      if (clientData.records && clientData.records.length > 0) {
        const recordId = clientData.records[0].id;
        // Update Contacts
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/Contacts/${recordId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Nombre y apellidos': newName
            }
          })
        });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Profile updated' }) };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'User record not found in Airtable' }) };

  } catch (error) {
    console.error('Update profile error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
