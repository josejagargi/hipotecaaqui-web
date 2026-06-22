const fetch = require('node-fetch');
require('dotenv').config();

const SPOKI_API_KEY = process.env.SPOKI_API_KEY || "7d705362-84d3-45c6-a450-b3fa1f4d39ac@serviceuser.spoki.com";
const BASE_URL = "https://api.spoki.com/api/1";

/**
 * Envia un mensaje de plantilla de Spoki a un número de teléfono específico.
 * @param {string} phone - Teléfono con prefijo (ej: "+34600123456")
 * @param {string} firstName - Nombre del cliente
 * @param {number} templateId - ID de la plantilla creada en Spoki con el enlace de autoinicio
 */
async function sendSpokiTemplate(phone, firstName, templateId) {
  const payload = {
    receiver: {
      phone: phone,
      first_name: firstName
    },
    template: {
      id: templateId,
      language: "es"
    }
  };

  console.log(`[Spoki API] Enviando plantilla ${templateId} a ${phone}...`);
  
  try {
    const response = await fetch(`${BASE_URL}/messages/`, {
      method: 'POST',
      headers: {
        'X-Spoki-Api-Key': SPOKI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const data = await response.json();

    if (response.ok) {
      console.log(`[Spoki API] Mensaje enviado con éxito. ID:`, data.id);
      return { success: true, id: data.id };
    } else {
      console.error(`[Spoki API] Error (${status}):`, data);
      return { success: false, error: data };
    }
  } catch (error) {
    console.error(`[Spoki API] Excepción al conectar con Spoki:`, error);
    return { success: false, error: error.message };
  }
}

// Ejemplo de uso:
// sendSpokiTemplate("+34657322288", "Javier", 12345);

module.exports = { sendSpokiTemplate };
