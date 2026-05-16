const Airtable = require('airtable');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración de Airtable no encontrada' })
    };
  }

  const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(BASE_ID);
  const data = JSON.parse(event.body);
  
  console.log('Incoming submission data:', JSON.stringify(data, null, 2));

  try {
    // 1. Gestionar el Contacto (Tabla: Contacts)
    const email = data['Email'] || data['email'] || '';
    const nombre = data['Nombre y apellidos'] || data['name'] || 'Cliente Web';
    const telefono = data['Telefono'] || data['phone'] || '';

    if (!email) {
      throw new Error('El email es obligatorio para crear el contacto');
    }

    // Buscar si ya existe el contacto
    let contactId;
    const existingContacts = await base('Contacts').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage();

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
      console.log('Existing contact found:', contactId);
    } else {
      // Crear nuevo contacto
      const contactFields = {
        'Nombre y apellidos': nombre,
        'Email': email,
      };
      if (telefono) contactFields['Telefono'] = String(telefono);
      
      const newContact = await base('Contacts').create(contactFields);
      contactId = newContact.id;
      console.log('New contact created:', contactId);
    }

    // 2. Crear el registro de Hipoteca con mapeo explícito
    const hipotecaFields = {
      'Contact': [contactId],
    };

    // --- Campos numéricos ---
    hipotecaFields['Edad sim']                  = parseInt(data['Edad sim']) || 0;
    hipotecaFields['Antiguedad sim']            = parseInt(data['Antiguedad sim']) || 0;
    hipotecaFields['Ingresos titular 1']        = parseFloat(data['Ingresos titular 1']) || 0;
    hipotecaFields['Num pagas T1']              = parseInt(data['Num pagas T1']) || 12;
    hipotecaFields['Ingresos titular 2']        = parseFloat(data['Ingresos titular 2']) || 0;
    hipotecaFields['Num pagas T2']              = parseInt(data['Num pagas T2']) || 12;
    hipotecaFields['Antiguedad T2']             = parseInt(data['Antiguedad T2']) || 0;
    hipotecaFields['Otros prestamos mensuales'] = parseFloat(data['Otros prestamos mensuales']) || 0;
    hipotecaFields['Capital pendiente']         = parseFloat(data['Capital pendiente']) || 0;
    hipotecaFields['Ahorros']                   = parseFloat(data['Ahorros']) || 0;
    hipotecaFields['Precio del inmueble']       = parseFloat(data['Precio del inmueble']) || 0;

    // --- Campos de texto libres ---
    if (data['Localidad inmueble']) hipotecaFields['Localidad inmueble'] = data['Localidad inmueble'];
    if (data['CP Localidad'])       hipotecaFields['CP Localidad']       = data['CP Localidad'];

    // --- Campos singleSelect ---
    const validSingleSelects = {
      'Tipo trabajo sim':            ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'],
      'Tipo trabajo T2':             ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'],
      'Hay segundo titular':         ['Si', 'No'],
      'Habeis encontrado propiedad': ['Si, reservada', 'Si, no reservada', 'Buscando'],
      'Tipo vivienda':               ['Nueva', 'Segunda mano'],
      'Tipo prestamo':               ['Hipotecario', 'ICO', 'Autopromocion', 'Hipoteca no residente'],
    };

    for (const [fieldName, validValues] of Object.entries(validSingleSelects)) {
      const value = data[fieldName];
      if (value && validValues.includes(value)) {
        hipotecaFields[fieldName] = value;
      }
    }

    console.log('Sending fields to Hipoteca:', JSON.stringify(hipotecaFields, null, 2));

    const hipotecaRecord = await base('Hipoteca').create(hipotecaFields);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ success: true, id: hipotecaRecord.id })
    };

  } catch (error) {
    console.error('Error in save-to-airtable process:', error);
    
    return {
      statusCode: error.statusCode || 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ 
        error: 'Error al procesar la solicitud', 
        message: error.message,
        details: error
      })
    };
  }
};
