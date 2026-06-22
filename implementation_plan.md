# Plan de Implementación: Sincronización Automática de Documentos a Google Drive

Este plan detalla el diseño y la implementación de la Netlify Function `sync-docs-to-drive` que se activará mediante la automatización de Airtable cuando el campo tipo check `Documentacion` sea marcado. El proceso descargará en memoria todos los archivos adjuntos del contacto y los subirá de forma organizada a una carpeta específica en Google Drive.

---

## User Review Required

> [!IMPORTANT]
> ### 1. Credenciales de Google Drive
> Para conectarnos a Google Drive de forma segura y eficiente desde la Netlify Function sin dependencias externas pesadas, usaremos `node-fetch`. Necesitamos que nos indiques cuál de las siguientes opciones prefieres para la autenticación:
> - **Opción A (Recomendada - Cuenta de Servicio):** Creas una Cuenta de Servicio en Google Cloud, descargas el archivo JSON de la clave y configuramos las variables de entorno `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY` en Netlify. Luego solo debes compartir la carpeta destino de Google Drive con ese email de la cuenta de servicio.
> - **Opción B (OAuth con Refresh Token):** Usamos tu cuenta de Google Workspace personal. Necesitaremos configurar las variables de entorno `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN` en Netlify.
> 
> *Nota: Por favor, confírmanos cuál prefieres para configurar las variables correctas.*

> [!IMPORTANT]
> ### 2. Carpeta Destino Raíz
> Necesitaremos la variable de entorno `GOOGLE_DRIVE_ROOT_FOLDER_ID` en Netlify, la cual contendrá el ID de la carpeta principal de Google Drive donde se crearán las carpetas individuales para cada contacto.

---

## Proposed Changes

### Netlify Functions

#### [NEW] [sync-docs-to-drive.js](file:///c:/Proyectos/Hipotecaaqui/netlify/functions/sync-docs-to-drive.js)
Crearemos una nueva función de Netlify que realizará las siguientes tareas:
1. **Recibir el webhook de Airtable:** Esperar una petición POST con el `contactId` enviado por la automatización de Airtable.
2. **Obtener el contacto y sus adjuntos:** Hacer una petición GET a la API de Airtable para obtener el nombre del contacto (`Nombre y apellidos`) y todos sus campos de adjuntos (`NIF`, `Nominas`, `Renta`, `Vida laboral`, `Extractos bancarios`, `Otros adjuntos`, `Cuotas prestamos`).
3. **Autenticación con Google API:** Obtener un Access Token de Google en tiempo real utilizando la Cuenta de Servicio o el Refresh Token.
4. **Crear o buscar la carpeta del cliente en Google Drive:**
   - Buscar si ya existe una carpeta llamada `Nombre_y_apellidos [ID_CONTACTO]`.
   - Si no existe, crearla bajo la carpeta raíz `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
5. **Descargar y subir los archivos adjuntos:**
   - Iterar sobre todos los campos de archivos adjuntos habitados.
   - Para cada archivo, descargarlo en buffer binario desde la URL temporal de Airtable.
   - Subirlo directamente a la carpeta del cliente en Google Drive utilizando la API de carga multipart de Google.
   - Evitar duplicar archivos comprobando si ya existe un archivo con el mismo nombre en la carpeta de Drive del cliente.
6. **Actualizar el check en Airtable:** Una vez completado con éxito, desmarcar automáticamente el check `Documentacion` en Airtable (o actualizar un campo de estado como `Estado Drive` a "Sincronizado") para evitar bucles de ejecución y notificar visualmente al usuario.

---

## Plan de Verificación

### Pruebas Automatizadas y Scripts
1. **Script de simulación local:** Crearemos un script de prueba bajo `scratch/test_sync_drive.js` para ejecutar el flujo de forma aislada y verificar la autenticación y subida de un archivo mockup sin necesidad de pasar por Airtable.
2. **Prueba local de la Netlify Function:** Utilizaremos `netlify dev` para levantar las funciones localmente y enviar peticiones POST simuladas utilizando `curl` o un script.

### Verificación Manual
1. **Trigger desde Airtable:** Marcar manualmente el check `Documentacion` en un contacto de prueba que tenga archivos cargados en Airtable.
2. **Confirmación en Google Drive:** Verificar que se crea correctamente la carpeta del cliente con el nombre adecuado y que todos sus documentos se suben sin alteración.
3. **Reset del Trigger:** Confirmar que el check `Documentacion` se desmarca automáticamente en Airtable una vez finalizado el proceso.
