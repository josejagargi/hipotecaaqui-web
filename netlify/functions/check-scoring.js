const Airtable = require('airtable');

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const { id } = event.queryStringParameters || {};
  if (!id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'El ID del registro es obligatorio' }),
    };
  }

  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_PAT || !BASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Configuración de Airtable no encontrada en el servidor' }),
    };
  }

  try {
    const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(BASE_ID);
    const record = await base('Hipoteca').find(id);

    if (!record) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Registro no encontrado' }),
      };
    }

    const fields = record.fields;
    
    // El scoring está "listo" cuando el campo 'Viabilidad' tiene un valor
    const viabilidad = fields['Viabilidad'];
    let ready = false;
    
    if (viabilidad) {
      const isViable = viabilidad.toLowerCase().includes('viable') && !viabilidad.toLowerCase().includes('no viable');
      if (isViable) {
        // Si es viable, esperamos a que al menos una cuota esté propagada/calculada en Airtable
        const hasCuotas = (Array.isArray(fields['Mejor cuota Fija']) && fields['Mejor cuota Fija'].length > 0) || 
                          (Array.isArray(fields['Mejor cuota Mixta']) && fields['Mejor cuota Mixta'].length > 0) || 
                          (Array.isArray(fields['Mejor cuota Variable']) && fields['Mejor cuota Variable'].length > 0) ||
                          fields['Mejor cuota Fija'] || fields['Mejor cuota Mixta'] || fields['Mejor cuota Variable'];
        ready = !!hasCuotas;
      } else {
        // Si es no viable o requiere estudio, no habrá cuotas, por lo que está listo de inmediato
        ready = true;
      }

      if (ready) {
        // Generar la cabecera de viabilidad en formato Markdown para el correo
        const formatEuro = (val) => {
          if (val === null || val === undefined || isNaN(val)) return '--';
          return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
        };

        let scoringHeader = '';
        if (isViable) {
          const cuotaFija = Array.isArray(fields['Mejor cuota Fija']) ? fields['Mejor cuota Fija'][0] : fields['Mejor cuota Fija'] || null;
          const cuotaMixta = Array.isArray(fields['Mejor cuota Mixta']) ? fields['Mejor cuota Mixta'][0] : fields['Mejor cuota Mixta'] || null;
          const cuotaVariable = Array.isArray(fields['Mejor cuota Variable']) ? fields['Mejor cuota Variable'][0] : fields['Mejor cuota Variable'] || null;
          const numViables = fields['Nº viables'] !== undefined ? fields['Nº viables'] : null;

          scoringHeader = `### 🎉 ¡Tu estudio es Viable!\n\n` +
            `El scoring automático ha pre-aprobado tu solicitud${numViables ? ` con **${numViables}** ofertas bancarias viables` : ''}. Aquí tienes las mejores cuotas estimadas:\n` +
            `- Mejor cuota Fija: **${formatEuro(cuotaFija)}**\n` +
            `- Mejor cuota Mixta: **${formatEuro(cuotaMixta)}**\n` +
            `- Mejor cuota Variable: **${formatEuro(cuotaVariable)}**\n\n` +
            `---\n\n`;
        } else {
          scoringHeader = `### 📋 Estado de tu solicitud: En Estudio Manual\n\n` +
            `El scoring automático requiere una revisión detallada de tu perfil por parte de nuestro equipo. Nos pondremos en contacto contigo lo antes posible para indicarte la viabilidad de la operación.\n\n` +
            `---\n\n`;
        }

        const currentHtml = fields['html'] || '';
        // Prevenir duplicación en caso de múltiples consultas
        if (currentHtml && !currentHtml.includes('¡Tu estudio es Viable!') && !currentHtml.includes('En Estudio Manual')) {
          const updatedHtml = scoringHeader + currentHtml;
          try {
            await base('Hipoteca').update(id, { 'html': updatedHtml });
            console.log(`Updated HTML field for record ${id} with scoring results`);
          } catch (err) {
            console.error(`Failed to update HTML field for record ${id}:`, err);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ready,
        viabilidad: viabilidad || null,
        numViables: fields['Nº viables'] !== undefined ? fields['Nº viables'] : null,
        numEstudiar: fields['Nº estudiar'] !== undefined ? fields['Nº estudiar'] : null,
        cuotaFija: Array.isArray(fields['Mejor cuota Fija']) ? fields['Mejor cuota Fija'][0] : fields['Mejor cuota Fija'] || null,
        cuotaMixta: Array.isArray(fields['Mejor cuota Mixta']) ? fields['Mejor cuota Mixta'][0] : fields['Mejor cuota Mixta'] || null,
        cuotaVariable: Array.isArray(fields['Mejor cuota Variable']) ? fields['Mejor cuota Variable'][0] : fields['Mejor cuota Variable'] || null,
        numComparado: fields['Nº comparado'] !== undefined ? fields['Nº comparado'] : null,
        semaforoEstabilidad: fields['SemaforoEstabilidad'] || null,
        semaforoEsfuerzo: fields['SemaforoEsfuerzo'] || null,
        semaforo20masgastos: fields['Semafor20masgatos'] || null,
      }),
    };
  } catch (error) {
    console.error('Error fetching record from Airtable:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Error al consultar la viabilidad',
        message: error.message,
      }),
    };
  }
};
