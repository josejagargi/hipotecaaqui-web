const Airtable = require('airtable');

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Configuración de Airtable no encontrada en variables de entorno' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const nombreFranquiciado = data['Nombre franquiciado'];
    const representante = data['Nombre y apellidos del representante'];
    const email = data['Email'];
    const telefono = data['Telefono'];
    const nif = data['NIF / CIF'];
    const localidad = data['Localidad'];
    const cp = data['Codigo postal'];
    const modalidad = data['Modalidad']; // 'pago' o 'sin_desembolso'

    if (!nombreFranquiciado || !representante || !email || !telefono || !nif || !localidad || !cp) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Todos los campos de contacto, NIF, Localidad y Código Postal son obligatorios.' })
      };
    }

    const modalidadAirtable = modalidad === 'pago' ? 'A pago inicial' : 'B cesion progresiva';

    const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(BASE_ID);

    // Create the record in Franquiciados
    const record = await base('Franquiciados').create({
      'Nombre franquiciado': nombreFranquiciado,
      'Nombre y apellidos del representante': representante,
      'Email': email,
      'Telefono': String(telefono),
      'NIF / CIF': nif,
      'Localidad': localidad,
      'Codigo postal': String(cp),
      'Modalidad': modalidadAirtable,
      'Notas CRM': `Solicitud de alta web.\nModalidad elegida: ${modalidad === 'pago' ? 'Con Pago Inicial (1.199€ + IVA)' : 'Sin desembolso inicial (Cesión progresiva)'}`,
      'Status': 'Lead'
    });

    console.log(`[SUCCESS] Franquiciado record created in Airtable: ${record.id}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, id: record.id })
    };

  } catch (error) {
    console.error('[ERROR] Error in save-associate process:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al procesar la solicitud en el servidor', 
        message: error.message 
      })
    };
  }
};
