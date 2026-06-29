const Airtable = require('airtable');
const fetch = require('node-fetch');

const generateEmailHtml = (data, recordingUrl, callSummary) => {
  const isT2 = data['Hay segundo titular'] === 'Si';
  const formatEuro = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0 €';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
  };

  return `
### Estudio de Viabilidad Hipotecaria (Agente de Voz Vapi)

Hola **${data['Nombre y apellidos'] || 'Cliente'}**,

Hemos recibido tu solicitud para el análisis de viabilidad hipotecaria a través de nuestro agente de voz. Aquí tienes un resumen con la información facilitada:

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
- Nombre T2: **${data['Nombre titular 2'] || 'No indicado'}**
- Edad T2: **${data['Edad titular 2'] ? data['Edad titular 2'] + ' años' : 'No indicado'}**
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

---

**📞 Detalles de la Llamada de Voz**
- **Grabación de llamada:** ${recordingUrl ? `[Escuchar grabación](${recordingUrl})` : 'No disponible'}
- **Resumen del Asistente:** ${callSummary || 'No disponible'}

Nuestro equipo de analistas ya está evaluando las mejores ofertas del mercado hipotecario que encajan con tu perfil. Nos pondremos en contacto contigo en las próximas horas para presentarte los resultados detallados.

[👉 HABLAR CON UN ASESOR POR WHATSAPP](https://wa.me/34630431874)

---

**Hipoteca Aquí**
*Financiación Inteligente Sin Complicaciones*
  `;
};

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

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración de Airtable no encontrada' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  console.log('Incoming Vapi payload:', JSON.stringify(payload, null, 2));

  // Verificar tipo de mensaje de Vapi (end-of-call-report)
  const message = payload.message;
  if (!message || message.type !== 'end-of-call-report') {
    console.log(`Skipping payload: message type is '${message ? message.type : 'undefined'}', not 'end-of-call-report'`);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, message: 'Skipped non-report event' })
    };
  }

  const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(BASE_ID);

  try {
    const callData = message.call || {};
    const callId = callData.id;
    let analysis = message.analysis || {};
    let structuredData = analysis.structuredData || {};
    let recordingUrl = callData.recordingUrl || '';
    let callSummary = analysis.summary || callData.summary || '';
    let assistantOverrides = callData.assistantOverrides || {};

    // Fetch call details from Vapi API directly to ensure the structuredData is fully extracted
    if (callId) {
      const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY || "49e34687-15be-4ccf-a7fb-56dd70a5413c";
      console.log(`[Vapi Webhook] Fetching latest call details for ID: ${callId}...`);
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const vapiResponse = await fetch(`https://api.vapi.ai/call/${callId}`, {
            headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}` }
          });
          if (vapiResponse.ok) {
            const callDetails = await vapiResponse.json();
            
            if (callDetails.assistantOverrides) {
              assistantOverrides = callDetails.assistantOverrides;
            }

            const latestAnalysis = callDetails.analysis || {};
            const latestStructured = latestAnalysis.structuredData || {};
            
            // Update fields if we got the structured data
            if (latestStructured && Object.keys(latestStructured).length > 0) {
              analysis = latestAnalysis;
              structuredData = latestStructured;
              callSummary = latestAnalysis.summary || callDetails.summary || callSummary;
              recordingUrl = callDetails.recordingUrl || recordingUrl;
              console.log(`[Vapi Webhook] Successfully retrieved structured data on attempt ${attempt}:`, JSON.stringify(structuredData));
              break;
            }
          } else {
            console.warn(`[Vapi Webhook] Vapi API returned status ${vapiResponse.status} on attempt ${attempt}`);
          }
        } catch (err) {
          console.error(`[Vapi Webhook] Failed to fetch call details (attempt ${attempt}):`, err);
        }
        if (attempt < 4) {
          console.log(`[Vapi Webhook] Structured data not ready yet. Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    // Resolve email from assistantOverrides (passed from frontend form) or fallback to transcribed email
    const variableValues = assistantOverrides.variableValues || {};
    const formEmail = (variableValues.email || '').trim();

    // Mapear los datos estructurados al formato de Airtable
    const data = {
      'Nombre y apellidos': structuredData.nombre || 'Cliente Vapi',
      'Email': formEmail || structuredData.email || '',
      'Telefono': structuredData.telefono || message.customer?.number || callData.customer?.number || '',
      'Edad sim': structuredData.edad,
      'Tipo trabajo sim': structuredData.tipoTrabajo,
      'Antiguedad sim': structuredData.antiguedad,
      'Ingresos titular 1': structuredData.ingresos,
      'Num pagas T1': structuredData.pagas || 12,
      'Hay segundo titular': structuredData.haySegundoTitular || 'No',
      'Nombre titular 2': structuredData.nombreT2 || '',
      'Edad titular 2': structuredData.edadT2,
      'Tipo trabajo T2': structuredData.tipoTrabajoT2,
      'Antiguedad T2': structuredData.antiguedadT2,
      'Ingresos titular 2': structuredData.ingresosT2,
      'Num pagas T2': structuredData.pagasT2 || 12,
      'Otros prestamos mensuales': structuredData.otrosPrestamos,
      'Capital pendiente': structuredData.capitalPendiente,
      'Ahorros': structuredData.ahorros,
      'Precio del inmueble': structuredData.precioInmueble,
      'Localidad inmueble': structuredData.localidad || '',
      'CP Localidad': structuredData.cp || '',
      'Habeis encontrado propiedad': structuredData.encontradoPropiedad,
      'Tipo vivienda': structuredData.tipoVivienda,
      'Tipo prestamo': structuredData.tipoPrestamo || 'Hipotecario',
    };

    // Forzar LOPD/Consentimientos ya que proceden de aceptación de llamada / asistente de voz
    const email = data['Email'];
    if (!email) {
      // Intentar usar un correo genérico temporal o de fallback si Vapi no pudo extraerlo
      // para evitar que falle el proceso de Contacts
      data['Email'] = `vapi-${callData.id || Date.now()}@hipotecaaqui.com`;
      console.warn(`Email not extracted by Vapi. Assigned temporary email: ${data['Email']}`);
    }

    const nombre = data['Nombre y apellidos'];
    const telefono = data['Telefono'];

    // Buscar si ya existe el contacto
    let contactId;
    let contactFranquiciados = null;
    const existingContacts = await base('Contacts').select({
      filterByFormula: `{Email} = '${data['Email']}'`,
      maxRecords: 1
    }).firstPage();

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
      contactFranquiciados = existingContacts[0].fields['Franquiciados'] || null;
      console.log('Existing contact found:', contactId, 'linked Franquiciados:', contactFranquiciados);
    }

    // Resolver franquiciado
    let resolvedFranquiciados = ["recBbqj0xUs1hZGKi"]; // Javier Garcia Giner por defecto
    
    // Si viene agentEmail (flujo B2B), buscamos el id del franquiciado por su email en Airtable
    const agentEmail = (variableValues.agentEmail || '').trim();
    if (agentEmail) {
      try {
        console.log(`[Vapi Webhook] Buscando franquiciado para B2B con email: ${agentEmail}`);
        const franquiciadosRecords = await base('Franquiciados').select({
          filterByFormula: `LOWER({Email}) = '${agentEmail.toLowerCase()}'`,
          maxRecords: 1
        }).firstPage();
        
        if (franquiciadosRecords && franquiciadosRecords.length > 0) {
          resolvedFranquiciados = [franquiciadosRecords[0].id];
          console.log(`[Vapi Webhook] Franquiciado B2B resuelto: ${franquiciadosRecords[0].fields['Nombre y apellidos'] || agentEmail} (ID: ${resolvedFranquiciados[0]})`);
        } else {
          console.warn(`[Vapi Webhook] No se encontró ningún franquiciado con el email: ${agentEmail}. Usando valor por defecto.`);
        }
      } catch (err) {
        console.error('[Vapi Webhook] Error al buscar franquiciado B2B:', err);
      }
    } else if (contactFranquiciados && Array.isArray(contactFranquiciados) && contactFranquiciados.length > 0) {
      resolvedFranquiciados = contactFranquiciados;
    }

    if (!contactId) {
      const contactFields = {
        'Nombre y apellidos': nombre,
        'Email': data['Email'],
        'Aceptacion LOPD': true,
        'Aceptacion publicidad': true,
        'Franquiciados': resolvedFranquiciados
      };
      if (telefono) contactFields['Telefono'] = String(telefono);
      
      const newContact = await base('Contacts').create(contactFields);
      contactId = newContact.id;
      console.log('New contact created for Vapi lead:', contactId);
    } else {
      const updateFields = {
        'Aceptacion LOPD': true,
        'Aceptacion publicidad': true
      };
      if (telefono) updateFields['Telefono'] = String(telefono);
      try {
        await base('Contacts').update(contactId, updateFields);
      } catch (err) {
        console.error('Failed to update existing Contact:', err);
      }
    }

    // Crear contacto para el segundo titular si existe
    const isT2 = data['Hay segundo titular'] === 'Si';
    let contact2Id = null;
    if (isT2 && data['Nombre titular 2']) {
      try {
        const contact2Fields = {
          'Nombre y apellidos': data['Nombre titular 2'],
          'Franquiciados': resolvedFranquiciados
        };
        if (data['Edad titular 2'] !== undefined && data['Edad titular 2'] !== null) {
          contact2Fields['Edad form'] = parseInt(data['Edad titular 2'], 10) || 0;
        }
        const newContact2 = await base('Contacts').create(contact2Fields);
        contact2Id = newContact2.id;
        console.log('Second contact created for Vapi T2:', contact2Id);
      } catch (err) {
        console.error('Failed to create second contact for Vapi T2:', err);
      }
    }

    // Crear registro de Hipoteca
    const contactsList = [contactId];
    if (contact2Id) {
      contactsList.push(contact2Id);
    }

    const hipotecaFields = {
      'Contact': contactsList,
      'Enviar scoring': true,
      'html': generateEmailHtml(data, recordingUrl, callSummary),
      'Franquiciados': resolvedFranquiciados
    };

    // Campos numéricos
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

    // Campos de texto
    if (data['Localidad inmueble']) hipotecaFields['Localidad inmueble'] = data['Localidad inmueble'];
    if (data['CP Localidad'])       hipotecaFields['CP Localidad']       = data['CP Localidad'];

    // Validar single select fields con comparación tolerante a acentos y mayúsculas
    const validSingleSelects = {
      'Tipo trabajo sim':            ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'],
      'Tipo trabajo T2':             ['Cuenta ajena', 'Funcionario', 'Autonomo', 'Fijo discontinuo'],
      'Hay segundo titular':         ['Si', 'No'],
      'Habeis encontrado propiedad': ['Si, reservada', 'Si, no reservada', 'Buscando'],
      'Tipo vivienda':               ['Nueva', 'Segunda mano'],
      'Tipo prestamo':               ['Hipotecario', 'ICO', 'Autopromocion', 'Hipoteca no residente'],
    };

    const normalizeStr = (str) => {
      if (!str) return '';
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    for (const [fieldName, validValues] of Object.entries(validSingleSelects)) {
      const value = data[fieldName];
      if (value) {
        // Encontrar coincidencia sin acentos ni mayúsculas
        let matchedValue = validValues.find(v => normalizeStr(v) === normalizeStr(value));
        
        // Mapeo flexible para Tipo vivienda
        if (!matchedValue && fieldName === 'Tipo vivienda') {
          const valNorm = normalizeStr(value);
          if (valNorm.includes('nueva') || valNorm.includes('obra')) {
            matchedValue = 'Nueva';
          } else if (valNorm.includes('segunda') || valNorm.includes('mano') || valNorm.includes('usada')) {
            matchedValue = 'Segunda mano';
          }
        }

        if (matchedValue) {
          hipotecaFields[fieldName] = matchedValue;
        }
      }
    }

    console.log('Sending fields to Hipoteca from Vapi:', JSON.stringify(hipotecaFields, null, 2));

    const hipotecaRecord = await base('Hipoteca').create(hipotecaFields);
    console.log('Hipoteca record created from Vapi:', hipotecaRecord.id);

    // Patch final tras retardo corto para sobreescribir posibles automatizaciones de Airtable
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await base('Hipoteca').update(hipotecaRecord.id, {
        'Franquiciados': resolvedFranquiciados
      });
      console.log('Successfully patched Hipoteca with Franquiciados:', resolvedFranquiciados);
    } catch (err) {
      console.error('Failed to patch Hipoteca record:', err);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ success: true, id: hipotecaRecord.id })
    };

  } catch (error) {
    console.error('Error processing Vapi webhook:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
    };
  }
};
