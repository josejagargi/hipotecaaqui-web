// Netlify Function: referral-dashboard.js
// Returns referral dashboard data for an authenticated referrer.
// Flow: Frontend -> This function -> Airtable API (API key never exposed to client)

const CONTACTS_TABLE = 'Contacts';    // 🧑‍💼Contacts
const RECOMPENSAS_TABLE = 'tblnnpzFyLvwevySF'; // Recompensas Referidos

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const BASE_ID = process.env.AIRTABLE_BASE_ID;

    if (!AIRTABLE_PAT || !BASE_ID) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration' }) };
    }

    // Authentication: expect ?email=xxx or Authorization header with email token
    // We use a simple email-based lookup (the user proves identity via their email)
    const email = event.queryStringParameters?.email;

    if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email parameter required' }) };
    }

    // Basic email format validation server-side
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email format' }) };
    }

    try {
        const airtableBase = `https://api.airtable.com/v0/${BASE_ID}`;
        const authHeader = { 'Authorization': `Bearer ${AIRTABLE_PAT}` };

        // 1. Find the referrer in Contacts table
        const filterFormula = encodeURIComponent(`{📧Email} = '${email}'`);
        const contactRes = await fetch(
            `${airtableBase}/${CONTACTS_TABLE}?filterByFormula=${filterFormula}&maxRecords=1`,
            { headers: authHeader }
        );
        const contactData = await contactRes.json();

        if (!contactData.records || contactData.records.length === 0) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuario no encontrado. Contacta con el equipo de Hipoteca Aquí.' }) };
        }

        const referrer = contactData.records[0];
        const referrerId = referrer.id;
        const referrerName = referrer.fields['Nombre'] || referrer.fields['Nombre y apellidos'] || 'Usuario';
        const referralCode = referrer.fields['Referral Code'] || referrerId; // fallback to recordId
        const referidosIds = referrer.fields['referidos'] || [];

        // 2. Get details of each referido (linked contacts)
        let referidosList = [];
        if (referidosIds.length > 0) {
            // Fetch each referido record
            const idFilter = referidosIds.map(id => `RECORD_ID() = '${id}'`).join(', ');
            const orFormula = encodeURIComponent(`OR(${idFilter})`);
            const referidosRes = await fetch(
                `${airtableBase}/${CONTACTS_TABLE}?filterByFormula=${orFormula}&fields%5B%5D=Nombre&fields%5B%5D=Nombre%20y%20apellidos&fields%5B%5D=Estado&fields%5B%5D=Fecha_Registro`,
                { headers: authHeader }
            );
            const referidosData = await referidosRes.json();

            referidosList = (referidosData.records || []).map(r => ({
                id: r.id,
                nombre: r.fields['Nombre'] || r.fields['Nombre y apellidos'] || 'Contacto',
                estado: r.fields['Estado'] || 'Pendiente',
                fecha: r.fields['Fecha_Registro'] || r.fields['Created'] || null
            }));
        }

        // 3. Get rewards for this referrer
        const rewardFilter = encodeURIComponent(`{Referidor} = '${referrerId}'`);
        const rewardsRes = await fetch(
            `${airtableBase}/${RECOMPENSAS_TABLE}?filterByFormula=${rewardFilter}`,
            { headers: authHeader }
        );
        const rewardsData = await rewardsRes.json();

        const rewardsList = (rewardsData.records || []).map(r => ({
            id: r.id,
            importe: r.fields['Importe Recompensa'] || 0,
            estado: r.fields['Estado Pago'] || 'Pendiente',
            fecha: r.fields['Fecha Asignacion'] || null
        }));

        const totalRewards = rewardsList.reduce((sum, r) => sum + r.importe, 0);
        const pendingRewards = rewardsList.filter(r => r.estado === 'Pendiente').reduce((sum, r) => sum + r.importe, 0);

        // 4. Build referral URL (using the actual deployed domain)
        const protocol = 'https';
        const domain = event.headers?.host || 'hipotecaaqui.netlify.app';
        const referralUrl = `${protocol}://${domain}/referidos/?ref=${referralCode}`;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                referrer: {
                    id: referrerId,
                    nombre: referrerName,
                    email,
                    referralCode,
                    referralUrl
                },
                stats: {
                    totalReferidos: referidosIds.length,
                    totalRewards,
                    pendingRewards,
                    paidRewards: totalRewards - pendingRewards
                },
                referidos: referidosList,
                recompensas: rewardsList
            })
        };

    } catch (error) {
        console.error('Referral dashboard error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error interno del servidor', details: error.message })
        };
    }
};
