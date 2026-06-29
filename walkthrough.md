# Walkthrough: Personalización del Agente de Voz y Depuración del Webhook

Hemos implementado las personalizaciones y ajustes específicos solicitados por el usuario sobre el flujo de llamada del Agente B2B.

## Cambios Realizados

1. **Datos del Cliente y Segundo Titular (Bloque 1):**
   * **Saludo Inicial:** Cambiado para preguntar en singular: `"comencemos con los datos del cliente para realizar el scoring..."` (eliminando la frase "cliente o clientes").
   * **Pregunta explícita:** El bot primero toma los datos del primer cliente (nombre y teléfono) y al terminar le consulta explícitamente si hay un segundo cliente o titular.

2. **Número de Pagas Flexible (Bloque 2):**
   * Eliminada la sugerencia de "12 o 14 pagas" en la pregunta del bot para evitar sesgos en el diálogo.
   * Modificado el prompt de sistema para que acepte y valide activamente cualquier número de pagas entre **8 y 14** (inclusive), soportando de esta manera pagas alternativas (ej. 13 pagas).

3. **Préstamos Activos Condicionales (Bloque 3):**
   * El bot preguntará primero si tiene otros préstamos activos de manera general.
   * Si respondes **"Sí"**, procederá a pedir la cuota mensual y el capital pendiente.
   * Si respondes **"No"** (o similar), el bot saltará directamente a preguntarte por los ahorros que aporta a la compra, reduciendo el diálogo innecesario.

4. **Franquiciados en Airtable ([vapi-webhook.js](file:///c:/Proyectos/Hipotecaaqui/netlify/functions/vapi-webhook.js)):**
   * Retirado por completo el guardado y el patch final de la columna `'Franquiciados'` sobre la tabla `'Hipoteca'`.
   * El webhook se limita a persistir el franquiciado únicamente en la tabla `'Contacts'`, permitiendo que el automatismo interno de tu base de Airtable asocie y herede el franquiciado en la tabla `'Hipoteca'`.
