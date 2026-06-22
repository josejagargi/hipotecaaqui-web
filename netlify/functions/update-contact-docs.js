// update-contact-docs.js
// Netlify Function to add or delete attachments in Airtable Contacts fields
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

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Airtable configuration missing in environment variables.' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { c: contactId, field, action = 'add', fileName, fileUrl, fileId } = data;

    if (!contactId || !field) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Missing required parameters: contact ID (c) and field are required.' }) 
      };
    }

    // Validate field name matches the Airtable fields
    const validFields = ['NIF', 'Nominas', 'Vida laboral', 'Renta', 'Cuotas prestamos', 'Extractos bancarios', 'Otros adjuntos', 'Aceptacion LOPD'];
    if (!validFields.includes(field)) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: `Invalid field name. Must be one of: ${validFields.join(', ')}` }) 
      };
    }

    console.log(`[DEBUG] Update doc. Action: ${action}, Contact: ${contactId}, Field: ${field}`);

    const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/Contacts/${contactId}`;

    // ── Direct processing for LOPD Consent Boolean Checkbox ────────────────
    if (field === 'Aceptacion LOPD') {
      const consentValue = (action === 'add' || action === true || action === 'true');
      console.log(`[DEBUG] Updating LOPD consent for Contact ${contactId} to ${consentValue}`);
      
      const patchRes = await fetch(airtableUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Aceptacion LOPD': consentValue
          }
        })
      });
      
      const patchData = await patchRes.json();
      if (!patchRes.ok) {
        console.error(`[ERROR] Failed to update LOPD consent:`, patchData);
        return {
          statusCode: patchRes.status,
          headers,
          body: JSON.stringify({ error: patchData.error?.message || 'Error updating LOPD consent' })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Consent updated successfully', aceptacionLOPD: consentValue })
      };
    }

    // ── 1. Fetch current attachments from Airtable ───────────────────────
    const getRes = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      }
    });

    if (!getRes.ok) {
      const getErr = await getRes.json();
      console.error(`[ERROR] Failed to fetch contact ${contactId}:`, getErr);
      return { 
        statusCode: getRes.status, 
        headers, 
        body: JSON.stringify({ error: getErr.error?.message || 'Error fetching contact' }) 
      };
    }

    const contactData = await getRes.json();
    const currentAttachments = contactData.fields[field] || [];

    let updatedAttachments = [];

    if (action === 'add') {
      if (!fileName || !fileUrl) {
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify({ error: 'fileName and fileUrl are required for add action.' }) 
        };
      }

      // Check if duplicate file already exists by URL
      const exists = currentAttachments.some(att => att.url === fileUrl);
      if (exists) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: 'File already exists', attachments: currentAttachments })
        };
      }

      // ── VERIFICACIÓN AUTOMÁTICA CON GEMINI ──
      const validacion = await verificarDocumentoConGemini(fileUrl, field, fileName);
      if (!validacion.valido) {
        console.warn(`[VALIDATION FAILED] Document for ${field} rejected: ${validacion.motivo}`);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'validation_failed',
            message: validacion.motivo || 'El documento subido no coincide con el campo seleccionado.'
          })
        };
      }

      // Format for Airtable's attachment field ingestion:
      // Airtable accepts: { "url": "...", "filename": "..." } and will download and store it!
      updatedAttachments = [
        ...currentAttachments.map(att => ({ id: att.id })), // Keep existing ones by ID to avoid re-uploading them
        { url: fileUrl, filename: fileName }
      ];
    } else if (action === 'delete') {
      if (!fileId) {
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify({ error: 'fileId is required for delete action.' }) 
        };
      }

      // Filter out the file with specified ID
      updatedAttachments = currentAttachments
        .filter(att => att.id !== fileId)
        .map(att => ({ id: att.id })); // Keep remaining ones by ID
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid action: ${action}` }) };
    }

    // ── 2. PATCH the contact record ──────────────────────────────────────
    const patchRes = await fetch(airtableUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          [field]: updatedAttachments
        }
      })
    });

    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      console.error(`[ERROR] Failed to patch contact ${contactId}:`, patchData);
      return { 
        statusCode: patchRes.status, 
        headers, 
        body: JSON.stringify({ error: patchData.error?.message || 'Error updating contact attachments' }) 
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: action === 'add' ? 'File uploaded and linked successfully' : 'File deleted successfully',
        attachments: patchData.fields[field] || []
      })
    };

  } catch (error) {
    console.error('[ERROR] update-contact-docs error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

/**
 * Utilidad para verificar si un documento coincide con el campo mediante la API de Gemini
 */
async function verificarDocumentoConGemini(fileUrl, field, fileName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[WARN] GEMINI_API_KEY no configurada. Saltando verificación automática.');
    return { valido: true };
  }

  // Mapeo de campos a descripción legible para el prompt de validación
  const mapeoCampos = {
    'NIF': 'DNI / NIE / Pasaporte',
    'Nominas': 'Nómina / Recibo de salarios / Justificante de ingresos mensuales',
    'Renta': 'Declaración de la renta (Modelo 100) o certificado de retenciones',
    'Vida laboral': 'Informe de Vida Laboral de la Seguridad Social'
  };

  const tipoEsperado = mapeoCampos[field];
  if (!tipoEsperado) {
    // Si es un campo no mapeado o no crítico (ej. Otros adjuntos, Cuotas préstamos), se aprueba por defecto
    return { valido: true };
  }

  try {
    console.log(`[DEBUG] Iniciando verificación con Gemini para el campo "${field}" (${tipoEsperado})`);
    
    // Descargar el archivo desde Storage para enviarlo directamente como Base64
    const responseFile = await fetch(fileUrl);
    if (!responseFile.ok) {
      throw new Error(`Error al descargar archivo desde Storage: ${responseFile.statusText}`);
    }
    const arrayBuffer = await responseFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // Determinar MIME type aproximado a partir del nombre de archivo (fileName)
    let mimeType = 'application/pdf';
    const lowerName = fileName ? fileName.toLowerCase() : '';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (lowerName.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (lowerName.endsWith('.webp')) {
      mimeType = 'image/webp';
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const prompt = `Analiza este documento y determina si se corresponde con un documento de tipo "${tipoEsperado}".
Toma en cuenta que los usuarios pueden subir fotos tomadas con el móvil (a veces algo borrosas o torcidas) o archivos PDF oficiales.
Devuelve EXCLUSIVAMENTE un objeto JSON válido con este formato, sin bloques de código markdown ni texto adicional:
{
  "valido": true o false,
  "motivo": "explicación corta en español si valido es false, indicando amigablemente qué documento se esperaba y qué parece ser el archivo subido"
}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }],
      generation_config: {
        response_mime_type: 'application/json'
      }
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API respondió con código ${geminiResponse.status}: ${errorText}`);
    }

    const result = await geminiResponse.json();
    const textResult = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) {
      throw new Error('Respuesta de Gemini vacía');
    }

    const verification = JSON.parse(textResult.trim());
    console.log(`[DEBUG] Resultado validación Gemini para ${field}:`, verification);
    return verification;

  } catch (error) {
    console.error('[ERROR] Error durante la validación con Gemini:', error);
    // En caso de fallo técnico, dejamos pasar para no bloquear la experiencia de usuario (fail-open)
    return { valido: true };
  }
}

