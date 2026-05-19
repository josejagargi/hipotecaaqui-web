// Netlify Function: submit-referral.js
// Public endpoint: creates a new lead in Contacts table linked to their referrer.
// Validates on server-side to prevent spam. Never exposes API key to client.

const CONTACTS_TABLE = 'Contacts'; // 🧑‍💼Contacts

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
    const BASE_ID = process.env.AIRTABLE_BASE_ID;

    if (!AIRTABLE_PAT || !BASE_ID) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration' }) };
    }

    if (event.httpMethod === 'GET') {
        const ref = event.queryStringParameters ? event.queryStringParameters.ref : null;
        if (!ref) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing ref parameter' }) };
        }

        try {
            const airtableBase = `https://api.airtable.com/v0/${BASE_ID}`;
            
            // Check Contacts first
            const refRes = await fetch(
                `${airtableBase}/Contacts/${encodeURIComponent(ref)}`,
                { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
            );

            if (refRes.ok) {
                const data = await refRes.json();
                const name = data.fields['Nombre y apellidos'] || data.fields['Nombre'] || 'un amigo';
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, name })
                };
            }

            // Fallback: Check Franquiciados
            const assocRes = await fetch(
                `${airtableBase}/Franquiciados/${encodeURIComponent(ref)}`,
                { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
            );

            if (assocRes.ok) {
                const data = await assocRes.json();
                const name = data.fields['Nombre franquiciado'] || data.fields['Nombre y apellidos del representante'] || 'un asesor';
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, name })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, name: 'un amigo' }) // graceful fallback
            };
        } catch (error) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, name: 'un amigo' }) // graceful fallback
            };
        }
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { nombre, email, telefono, refCode } = body;

    // --- Server-side validation ---
    if (!nombre || !email || !telefono) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nombre, email y teléfono son obligatorios.' }) };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Formato de email inválido.' }) };
    }

    // Sanitize inputs to prevent formula injection
    const sanitize = (str) => String(str).replace(/'/g, "\\'").substring(0, 255);

    try {
        const airtableBase = `https://api.airtable.com/v0/${BASE_ID}`;
        const authHeader = {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json'
        };

        // 1. Check if lead already exists (avoid duplicates)
        const filterFormula = encodeURIComponent(`{Email} = '${sanitize(email)}'`);
        const checkRes = await fetch(
            `${airtableBase}/${CONTACTS_TABLE}?filterByFormula=${filterFormula}&maxRecords=1`,
            { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
        );
        const checkData = await checkRes.json();

        if (checkData.records && checkData.records.length > 0) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ error: 'Este email ya está registrado. ¡Nuestro equipo ya está en contacto contigo!' })
            };
        }

        // 2. Find referrer by their Referral Code (or record ID)
        let referrerRecordId = null;
        if (refCode) {
            // Try by Referral Code field first
            const refFilter = encodeURIComponent(`{Referral Code} = '${sanitize(refCode)}'`);
            const refRes = await fetch(
                `${airtableBase}/${CONTACTS_TABLE}?filterByFormula=${refFilter}&maxRecords=1`,
                { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
            );
            const refData = await refRes.json();

            if (refData.records && refData.records.length > 0) {
                referrerRecordId = refData.records[0].id;
            } else {
                // Fallback: try matching the refCode as a record ID
                try {
                    const directRes = await fetch(
                        `${airtableBase}/${CONTACTS_TABLE}/${sanitize(refCode)}`,
                        { headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` } }
                    );
                    if (directRes.ok) {
                        const directData = await directRes.json();
                        referrerRecordId = directData.id;
                    }
                } catch { /* refCode was not a valid record ID */ }
            }
        }

        // 3. Create the lead in Contacts table
        const newContactFields = {
            'Nombre y apellidos': sanitize(nombre),
            'Email': sanitize(email),
            'Telefono': sanitize(telefono),
            'Consentimiento': true
        };

        // Link to referrer via "referido por" field if we found them
        if (referrerRecordId) {
            newContactFields['referido por'] = [referrerRecordId];
        }

        const createRes = await fetch(
            `${airtableBase}/${CONTACTS_TABLE}`,
            {
                method: 'POST',
                headers: authHeader,
                body: JSON.stringify({ fields: newContactFields })
            }
        );

        const createData = await createRes.json();

        if (!createRes.ok) {
            console.error('Airtable create error:', createData);
            throw new Error(createData.error?.message || 'Error creating record');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '¡Gracias! Hemos recibido tus datos. Nuestro equipo se pondrá en contacto contigo muy pronto.',
                referredBy: referrerRecordId ? true : false
            })
        };

    } catch (error) {
        console.error('Submit referral error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Error interno del servidor. Por favor, inténtalo de nuevo.' })
        };
    }
};
