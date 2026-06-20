const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Manejo de CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Claves de API y configuración
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY || "49e34687-15be-4ccf-a7fb-56dd70a5413c";
  const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "067c6387-f1d6-40bc-9628-7912ba7652b7";
  const PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

  if (!PHONE_NUMBER_ID) {
    console.error("[Vapi Outbound] ERROR: Falta configurar VAPI_PHONE_NUMBER_ID en las variables de entorno");
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'La API del número de teléfono de Vapi no está configurada aún.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  console.log('Incoming Outbound trigger payload:', JSON.stringify(payload, null, 2));

  // Extraer el teléfono y el nombre. 
  // Soportamos payloads comunes de Spoki o de integraciones directas.
  let phone = payload.phone || payload.contact?.phone || payload.telefono;
  let name = payload.name || payload.contact?.first_name || payload.nombre || "Cliente";

  if (!phone) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Falta el parámetro del número de teléfono (phone)' })
    };
  }

  // Asegurar formato de teléfono internacional (Vapi requiere prefijo +)
  phone = phone.trim();
  if (!phone.startsWith('+')) {
    // Si es un número español estándar de 9 dígitos y no empieza por +, asumimos prefijo +34
    if (phone.length === 9 && (phone.startsWith('6') || phone.startsWith('7') || phone.startsWith('9'))) {
      phone = `+34${phone}`;
    } else {
      phone = `+${phone}`;
    }
  }

  const vapiPayload = {
    assistantId: ASSISTANT_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    customer: {
      number: phone,
      name: name
    }
  };

  console.log(`[Vapi Outbound] Iniciando llamada saliente al número: ${phone} (Nombre: ${name}) usando el teléfono ID: ${PHONE_NUMBER_ID}...`);

  try {
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vapiPayload)
    });

    const status = response.status;
    const data = await response.json();

    if (response.ok) {
      console.log(`[Vapi Outbound] Llamada iniciada con éxito! ID de llamada: ${data.id}`);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ success: true, callId: data.id })
      };
    } else {
      console.error(`[Vapi Outbound] La API de Vapi devolvió un error (${status}):`, data);
      return {
        statusCode: status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Error al iniciar la llamada en Vapi', details: data })
      };
    }
  } catch (error) {
    console.error('[Vapi Outbound] Excepción al invocar la API de Vapi:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
    };
  }
};
