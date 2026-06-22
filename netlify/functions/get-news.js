const fetch = require('node-fetch');

const CRM_BASE_ID = process.env.CRM_BASE_ID || 'appdpPB3CK0d5R2oI';
const CRM_TOKEN = process.env.CRM_TOKEN || 'patapt61z0HwTUIDH.655a5a30d9af22ff222bfb5b53b427613dce343bff42e188665f34e8d5ff5171';
const CONTENT_TABLE = 'Content';

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    // Fetch channels to map their IDs to names
    const channelsUrl = `https://api.airtable.com/v0/${CRM_BASE_ID}/Canales?fields[]=Name`;
    const channelsRes = await fetch(channelsUrl, {
      headers: { Authorization: `Bearer ${CRM_TOKEN}` }
    });
    const channelMap = {};
    if (channelsRes.ok) {
      const channelsData = await channelsRes.json();
      (channelsData.records || []).forEach(c => {
        channelMap[c.id] = c.fields.Name;
      });
    }

    const url = `https://api.airtable.com/v0/${CRM_BASE_ID}/${encodeURIComponent(CONTENT_TABLE)}?sort[0][field]=Fecha&sort[0][direction]=desc&maxRecords=20`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CRM_TOKEN}`
      }
    });

    if (!response.ok) {
      const errTxt = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Airtable error', details: errTxt })
      };
    }

    const data = await response.json();
    // Clean and return records
    const records = data.records
      .filter(r => r.fields.Titulo)
      .map(r => ({
        id: r.id,
        titulo: r.fields.Titulo,
        url: r.fields.URL || '',
        detalles: r.fields.Detalles || '',
        duracion: r.fields.Duracion || null,
        fecha: r.fields.Fecha || null,
        grupo: r.fields.Grupo || [],
        imagen: r.fields.imagen || null,
        canal: (r.fields.Canales && r.fields.Canales.length > 0) ? (channelMap[r.fields.Canales[0]] || null) : null
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ records })
    };
  } catch (error) {
    console.error('Error fetching news:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
    };
  }
};
