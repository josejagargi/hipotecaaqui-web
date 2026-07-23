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

---

## 🎁 Documento y Sección Web: Sistema de Referidos

1. **Documento PDF Explicativo Ajustado a 1 Página:**
   * **Archivo:** [borrador_pdf_referidos.html](file:///c:/Proyectos/Hipotecaaqui/referidos/borrador_pdf_referidos.html)
   * Reducidos márgenes y altura del encabezado para asegurar ajuste perfecto en **1 única página A4**.
   * Incorporado el logotipo de la marca de Hipoteca Aquí y paleta corporativa (`#33475b` y `#ff5a5f`).
   * Incluidos los logos en tamaño compacto de las 5 marcas de vales regalo: **Amazon, Zara, IKEA, MediaMarkt y El Corte Inglés**.

2. **Sección Explicativa en la Web:**
   * **Landing pública de referidos:** [public/referidos/index.html](file:///c:/Proyectos/Hipotecaaqui/public/referidos/index.html#L438-L478) - Añadido bloque explicativo con el flujo en 3 pasos, los logos de las tiendas de vales regalo y enlace directo para descargar/ver el PDF.
   * **Panel privado del cliente (Dashboard):** [public/referidos/dashboard.html](file:///c:/Proyectos/Hipotecaaqui/public/referidos/dashboard.html#L364-L403) - Incorporada tarjeta explicativa con el funcionamiento del sistema, marcas de vales regalo y acceso al PDF.
