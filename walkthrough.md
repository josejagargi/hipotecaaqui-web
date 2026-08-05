# Walkthrough: Sistema de Envíos de Informes de Viabilidad y Automatizaciones

## 📧 Envío Automático de Informes de Viabilidad (Google Cloud OAuth2 & Gmail API)

Hemos implementado e integrado el sistema automático de generación y envío de **Informes de Viabilidad Hipotecaria** directamente desde la cuenta oficial `gerente@hipotecaaqui.com` utilizando la API de Google Cloud (OAuth 2.0).

### 🛠️ Detalles de la Implementación:

1. **Netlify Function ([sendViabilityReport.js](file:///c:/Proyectos/Hipotecaaqui/netlify/functions/sendViabilityReport.js)):**
   * Recibe el `studyId` o `recordId` del estudio de Airtable desde la automatización.
   * Obtiene la información financiera del estudio y los datos de contacto del cliente.
   * Genera dinámicamente el documento HTML y lo convierte en **PDF A4 oficial** utilizando Chromium headless (`@sparticuz/chromium` + `puppeteer-core`).
   * **Enlace al Portal del Cliente:** Actualizado a `https://hipotecaaqui.com/login.html?portal=cliente` para que el botón de la plantilla redirija correctamente al área de login de cliente.
   * Envía el correo electrónico con el archivo PDF adjunto (`Informe_Viabilidad_Hipotecaria_[Nombre].pdf`) de forma **nativa** desde `gerente@hipotecaaqui.com` a través del transporte OAuth2 de Nodemailer con Google Cloud.
   * Al finalizar el envío, actualiza automáticamente el campo `'Estado envio informe'` en Airtable a `"Enviado por Email"`.

2. **Autenticación Enterprise sin Contraseñas:**
   * Configurado proyecto en Google Cloud Console (`hipotecaaqui`) con la **Gmail API** habilitada.
   * Generadas credenciales de cliente OAuth 2.0 y obtenido el **Refresh Token** para `gerente@hipotecaaqui.com`.
   * Variables de entorno configuradas en el entorno local (`.env`):
     * `GMAIL_CLIENT_ID`
     * `GMAIL_CLIENT_SECRET`
     * `GMAIL_REFRESH_TOKEN`
     * `SENDER_EMAIL=gerente@hipotecaaqui.com`

3. **Disparador en Airtable (Automation Trigger):**
   * **Tabla:** `Hipoteca`
   * **Condiciones:** 
     * `Enviar scoring` está marcado (`checked`) **O** `Viabilidad` es `🟢Viable` / `🔴No Viable`.
     * **Y** `Estado envio informe` está vacío (`is empty`).
   * **Acción:** Ejecuta el script de llamada `POST` a la Netlify Function `send-viability-report`.

---

## 🎙️ Personalización del Agente de Voz y Depuración del Webhook

1. **Datos del Cliente y Segundo Titular (Bloque 1):**
   * **Saludo Inicial:** Cambiado para preguntar en singular: `"comencemos con los datos del cliente para realizar el scoring..."`.
   * **Pregunta explícita:** El bot consulta explícitamente si hay un segundo cliente o titular tras recopilar el primero.

2. **Número de Pagas Flexible (Bloque 2):**
   * Acepta y valida activamente cualquier número de pagas entre **8 y 14** (inclusive).

3. **Préstamos Activos Condicionales (Bloque 3):**
   * Si la respuesta es "No", se salta la cuota y capital pendiente para agilizar el flujo.

4. **Franquiciados en Airtable ([vapi-webhook.js](file:///c:/Proyectos/Hipotecaaqui/netlify/functions/vapi-webhook.js)):**
   * Persistencia de franquiciados acoplada únicamente a la tabla `'Contacts'`.

---

## 🎁 Sistema de Referidos

1. **Documento PDF Explicativo:** [borrador_pdf_referidos.html](file:///c:/Proyectos/Hipotecaaqui/referidos/borrador_pdf_referidos.html) ajustado a 1 página A4 con logos de marcas.
2. **Landing y Dashboard:** [index.html](file:///c:/Proyectos/Hipotecaaqui/public/referidos/index.html) y [dashboard.html](file:///c:/Proyectos/Hipotecaaqui/public/referidos/dashboard.html).
