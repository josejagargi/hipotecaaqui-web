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
    let contactFranquiciados = null;
    const existingContacts = await base('Contacts').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage();

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
      contactFranquiciados = existingContacts[0].fields['Franquiciados'] || null;
      console.log('Existing contact found:', contactId, 'linked Franquiciados:', contactFranquiciados);
    }

    // Determine the Franquiciados link BEFORE creating/updating the contact
    let resolvedFranquiciados = null;
    
    // A. Use Franquiciados sent from the frontend payload
    if (data['Franquiciados'] && Array.isArray(data['Franquiciados']) && data['Franquiciados'].length > 0) {
      resolvedFranquiciados = data['Franquiciados'];
    }
    // B. Fallback: Inherit from existing contact if not sent in payload
    else if (contactFranquiciados && Array.isArray(contactFranquiciados) && contactFranquiciados.length > 0) {
      resolvedFranquiciados = contactFranquiciados;
    }

    // C. Default Fallback: Assign to Javier Garcia Giner (franqui) as the default master franchise for direct/organic traffic
    if (!resolvedFranquiciados || resolvedFranquiciados.length === 0) {
      resolvedFranquiciados = ["recBbqj0xUs1hZGKi"];
      console.log('No Franquiciados sent or inherited. Falling back to default master franchise: ["recBbqj0xUs1hZGKi"]');
    }

    if (!contactId) {
      // Crear nuevo contacto incluyendo el Franquiciado de forma síncrona
      const contactFields = {
        'Nombre y apellidos': nombre,
        'Email': email,
      };
      if (telefono) contactFields['Telefono'] = String(telefono);
      if (resolvedFranquiciados) contactFields['Franquiciados'] = resolvedFranquiciados;
      
      const newContact = await base('Contacts').create(contactFields);
      contactId = newContact.id;
      console.log('New contact created with Franquiciados:', contactId, resolvedFranquiciados);
    } else {
      // Sincronizar Franquiciado si el contacto existente no lo tiene enlazado todavía
      if (resolvedFranquiciados && (!contactFranquiciados || contactFranquiciados.length === 0)) {
        try {
          await base('Contacts').update(contactId, {
            'Franquiciados': resolvedFranquiciados
          });
          console.log(`Successfully synced existing Contact ${contactId} to Franquiciados ${resolvedFranquiciados}`);
        } catch (err) {
          console.error('Failed to sync existing Contact to Franquiciados:', err);
        }
      }
    }

    // 2. Preparar el registro de Hipoteca
    const hipotecaFields = {
      'Contact': [contactId],
    };
    if (resolvedFranquiciados) {
      hipotecaFields['Franquiciados'] = resolvedFranquiciados;
    }


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
    console.log('Hipoteca record created:', hipotecaRecord.id);

    // Post-creation patch update to guarantee Airtable links the Franquiciados field.
    // We wait 2.5 seconds to let any background Airtable automations complete,
    // ensuring we force-link the correct Franchisee permanently.
    if (resolvedFranquiciados && resolvedFranquiciados.length > 0) {
      try {
        console.log(`Waiting 2.5 seconds for background automations to complete before patching Hipoteca...`);
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        await base('Hipoteca').update(hipotecaRecord.id, {
          'Franquiciados': resolvedFranquiciados
        });
        console.log(`Successfully patched Hipoteca record ${hipotecaRecord.id} with Franquiciados:`, resolvedFranquiciados);
      } catch (err) {
        console.error(`Failed to patch Hipoteca record ${hipotecaRecord.id} with Franquiciados:`, err);
      }
    }

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
