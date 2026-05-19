// referral-get-dashboard.js
// Secure backend proxy: fetches referrer's dashboard data from Airtable
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-user-email',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const userEmail = event.headers['x-user-email'];
  if (!userEmail) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized: no email provided' }) };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const CONTACTS_TABLE = 'Contacts';
  const RECOMPENSAS_TABLE = 'tblnnpzFyLvwevySF';

  try {
    // 1. Find the referrer by email
    const searchFormula = encodeURIComponent(`{Email} = '${userEmail}'`);
    const contactRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE}?filterByFormula=${searchFormula}&fields[]=Nombre&fields[]=Email&fields[]=Telefono&fields[]=Referral Code&fields[]=recordid&fields[]=referidos&fields[]=referido por&fields[]=Recompensas Referidos`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const contactData = await contactRes.json();

    if (!contactData.records || contactData.records.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Referrer not found. Please register first.' }) };
    }

    const referrer = contactData.records[0];
    const referrerId = referrer.id;
    const referralCode = referrer.fields['Referral Code'] || referrer.fields['recordid'] || referrerId;
    const referidosIds = referrer.fields['referidos'] || [];

    // 2. Fetch referidos details
    let referidos = [];
    if (referidosIds.length > 0) {
      const orFormula = referidosIds.map(id => `RECORD_ID() = '${id}'`).join(',');
      const referidosFormula = encodeURIComponent(`OR(${orFormula})`);
      const referidosRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CONTACTS_TABLE}?filterByFormula=${referidosFormula}&fields[]=Nombre&fields[]=Email&fields[]=Estado`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
      );
      const referidosData = await referidosRes.json();
      referidos = (referidosData.records || []).map(r => ({
        id: r.id,
        nombre: r.fields['Nombre'] || 'Sin nombre',
        estado: r.fields['Estado'] || 'Pendiente'
      }));
    }

    // 3. Fetch recompensas for this referrer
    const recompFormula = encodeURIComponent(`FIND('${referrerId}', ARRAYJOIN({Referidor}))`);
    const recompRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${RECOMPENSAS_TABLE}?filterByFormula=${recompFormula}&fields[]=Importe Recompensa&fields[]=Estado Pago&fields[]=Fecha Asignacion`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
    );
    const recompData = await recompRes.json();
    const recompensas = (recompData.records || []).map(r => ({
      id: r.id,
      importe: r.fields['Importe Recompensa'] || 0,
      estado: r.fields['Estado Pago'] || 'Pendiente',
      fecha: r.fields['Fecha Asignacion'] || ''
    }));

    const totalRecompensas = recompensas.reduce((sum, r) => sum + (r.importe || 0), 0);
    const baseUrl = process.env.SITE_URL || 'https://hipotecaaqui.com';
    const referralUrl = `${baseUrl}/ref/?ref=${referralCode}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        referrer: {
          id: referrerId,
          nombre: referrer.fields['Nombre'] || '',
          email: referrer.fields['Email'] || '',
          telefono: referrer.fields['Telefono'] || '',
          referralCode,
          referralUrl
        },
        stats: {
          totalReferidos: referidos.length,
          totalRecompensas,
          recompensasPendientes: recompensas.filter(r => r.estado === 'Pendiente').length
        },
        referidos,
        recompensas
      })
    };
  } catch (error) {
    console.error('Dashboard error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error', detail: error.message }) };
  }
};
