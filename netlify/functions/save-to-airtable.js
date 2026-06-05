const Airtable = require('airtable');

const generateEmailHtml = (data) => {
  const isT2 = data['Hay segundo titular'] === 'Si';
  const formatEuro = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0 €';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
  };

  return `
### Estudio de Viabilidad Hipotecaria

Hola **${data['Nombre y apellidos'] || 'Cliente'}**,

Hemos recibido tu solicitud para el análisis de viabilidad hipotecaria. Aquí tienes un resumen con la información que nos has facilitado:

**👤 Datos Personales y Contacto**
- Nombre completo: **${data['Nombre y apellidos'] || 'No indicado'}**
- Email: **${data['Email'] || 'No indicado'}**
- Teléfono: **${data['Telefono'] || 'No indicado'}**

**💼 Datos del Primer Titular**
- Edad: **${data['Edad sim'] ? data['Edad sim'] + ' años' : 'No indicado'}**
- Tipo de Contrato: **${data['Tipo trabajo sim'] || 'No indicado'}**
- Antigüedad laboral: **${data['Antiguedad sim'] ? data['Antiguedad sim'] + ' años' : 'No indicado'}**
- Ingresos mensuales netos: **${formatEuro(data['Ingresos titular 1'])}** (${data['Num pagas T1'] || 12} pagas)
${isT2 ? `
**👥 Datos del Segundo Titular**
- Tipo de Contrato T2: **${data['Tipo trabajo T2'] || 'No indicado'}**
- Antigüedad laboral T2: **${data['Antiguedad T2'] ? data['Antiguedad T2'] + ' años' : 'No indicado'}**
- Ingresos mensuales T2: **${formatEuro(data['Ingresos titular 2'])}** (${data['Num pagas T2'] || 12} pagas)
` : ''}
**💰 Información Financiera**
- Otros préstamos activos: **${formatEuro(data['Otros prestamos mensuales'])} / mes**
- Capital pendiente: **${formatEuro(data['Capital pendiente'])}**
- Ahorros aportados: **${formatEuro(data['Ahorros'])}**

**🏠 Detalles de la Operación**
- ¿Propiedad encontrada?: **${data['Habeis encontrado propiedad'] || 'Buscando'}**
- Precio del inmueble: **${formatEuro(data['Precio del inmueble'])}**
- Tipo de vivienda: **${data['Tipo vivienda'] || 'No indicado'}**
- Ubicación: **${data['Localidad inmueble'] || ''} (CP: ${data['CP Localidad'] || ''})**
- Tipo de préstamo: **${data['Tipo prestamo'] || 'Hipotecario'}**

Nuestro equipo de analistas ya está evaluando las mejores ofertas del mercado hipotecario que encajan con tu perfil. Nos pondremos en contacto contigo en las próximas horas para presentarte los resultados detallados.

[👉 HABLAR CON UN ASESOR POR WHATSAPP](https://wa.me/34630431874)

---

**Hipoteca Aquí**
*Financiación Inteligente Sin Complicaciones*

*Este es un email de confirmación automática de recepción de datos. Si no has iniciado este trámite, por favor ignora este mensaje.*
  `;
};

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
        'Aceptacion LOPD': data['Aceptacion privacidad'] === true || data['Aceptacion privacidad'] === 'true' || data['Aceptacion privacidad'] === 'on',
        'Aceptacion publicidad': data['Consentimiento'] === true || data['Consentimiento'] === 'true' || data['Consentimiento'] === 'on'
      };
      if (telefono) contactFields['Telefono'] = String(telefono);
      if (resolvedFranquiciados) contactFields['Franquiciados'] = resolvedFranquiciados;
      
      const newContact = await base('Contacts').create(contactFields);
      contactId = newContact.id;
      console.log('New contact created with Franquiciados:', contactId, resolvedFranquiciados);
    } else {
      // Sincronizar Franquiciado y LOPD si el contacto ya existe
      const updateFields = {
        'Aceptacion LOPD': data['Aceptacion privacidad'] === true || data['Aceptacion privacidad'] === 'true' || data['Aceptacion privacidad'] === 'on',
        'Aceptacion publicidad': data['Consentimiento'] === true || data['Consentimiento'] === 'true' || data['Consentimiento'] === 'on'
      };
      if (resolvedFranquiciados && (!contactFranquiciados || contactFranquiciados.length === 0)) {
        updateFields['Franquiciados'] = resolvedFranquiciados;
      }
      try {
        await base('Contacts').update(contactId, updateFields);
        console.log(`Successfully updated existing Contact ${contactId} with fields:`, updateFields);
      } catch (err) {
        console.error('Failed to update existing Contact fields:', err);
      }
    }

    // 1.5. Crear segundo contacto para el Titular 2 si existe y tiene nombre
    const isT2 = data['Hay segundo titular'] === 'Si';
    let contact2Id = null;
    if (isT2 && data['Nombre titular 2']) {
      try {
        const contact2Fields = {
          'Nombre y apellidos': data['Nombre titular 2']
        };
        if (data['Edad titular 2'] !== undefined && data['Edad titular 2'] !== null) {
          contact2Fields['Edad form'] = parseInt(data['Edad titular 2'], 10) || 0;
        }
        if (resolvedFranquiciados) {
          contact2Fields['Franquiciados'] = resolvedFranquiciados;
        }
        
        const newContact2 = await base('Contacts').create(contact2Fields);
        contact2Id = newContact2.id;
        console.log('Second contact created for T2:', contact2Id);
      } catch (err) {
        console.error('Failed to create second contact for T2:', err);
      }
    }

    // 2. Preparar el registro de Hipoteca
    const contactsList = [contactId];
    if (contact2Id) {
      contactsList.push(contact2Id);
    }

    const hipotecaFields = {
      'Contact': contactsList,
      'Enviar scoring': true,
      'html': generateEmailHtml(data)
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
        console.log(`Waiting 0.5 seconds for background automations to complete before patching Hipoteca...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        
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
