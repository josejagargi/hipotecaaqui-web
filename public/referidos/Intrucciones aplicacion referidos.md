# Especificaciones Técnicas: Sistema de Referidos con Backend en Airtable

## 1. Objetivo del Sistema
Construir una aplicación de referidos que permita a los clientes actuales (Referidores) generar enlaces únicos para captar nuevos contactos (Leads). El sistema debe gestionar el seguimiento de estados, la atribución de recompensas y las notificaciones automáticas utilizando Airtable como base de datos y motor de lógica.

## 2. Arquitectura de Datos (Airtable)

Se deben crear las siguientes tablas con los campos específicos:

### Tabla A: `Clientes` (Referidores)
* **Nombre** (Single line text)
* **Email** (Email) - *Campo único*
* **Código_Referido** (Formula/ID) - Generar un código único alfanumérico.
* **URL_Personalizada** (Formula) - `https://app.cliente.com/ref/` + `{Código_Referido}`
* **Puntos_Acumulados** (Rollup) - Suma de puntos de la tabla Recompensas.
* **Leads_Totales** (Count) - Número de registros enlazados en la tabla Leads.

### Tabla B: `Leads` (Referidos)
* **Nombre** (Single line text)
* **Email** (Email)
* **Teléfono** (Phone)
* **Referidor** (Link to Clientes) - Relación obligatoria.
* **Estado** (Single Select) - Opciones: `Pendiente`, `Contactado`, `Cerrado`, `Rechazado`.
* **Fecha_Registro** (Created Time)

### Tabla C: `Recompensas` (Histórico)
* **Lead** (Link to Leads)
* **Cliente** (Link to Clientes)
* **Valor_Puntos** (Number)
* **Fecha_Asignación** (Created Time)

## 3. Lógica de Automatizaciones (Airtable Automations)

### Automatización 1: Bienvenida al Lead
* **Trigger:** Cuando se crea un registro en la tabla `Leads`.
* **Acción:** Enviar email al `Lead` confirmando que sus datos han sido recibidos y mencionando que viene de parte de `{Referidor.Nombre}`.

### Automatización 2: Notificación de Conversión y Recompensa
* **Trigger:** Cuando el campo `Estado` en la tabla `Leads` cambia a `Cerrado`.
* **Acción 1:** Crear un nuevo registro en la tabla `Recompensas` vinculado al `Lead` y al `Referidor` con el valor de puntos correspondiente.
* **Acción 2:** Enviar email al `Referidor` notificando que su amigo ha completado la acción y que ha ganado puntos/premios.

## 4. Requerimientos del Frontend (App de Usuario)

La interfaz debe ser sencilla y funcional:
1.  **Login/Registro:** Identificación por email del cliente actual.
2.  **Dashboard del Referidor:**
    * Visualización del enlace personal para copiar y compartir.
    * Contador de puntos actuales.
    * Lista de referidos enviados y su estado actual (sin mostrar datos privados sensibles del lead, solo nombre y estado).
3.  **Landing de Captación (Pública):**
    * Formulario simple: Nombre, Email, Teléfono.
    * Debe capturar el parámetro `ref` de la URL para asociarlo al referidor en Airtable.

## 5. Instrucciones de Seguridad y API (Crítico)

**REGLA DE ORO:** El agente de IA no debe exponer la `AIRTABLE_API_KEY` en el código del lado del cliente (Frontend).
* Se debe implementar un **Backend Proxy** (vía Next.js API Routes, funciones serverless o un pequeño script en Python/FastAPI).
* El flujo de datos debe ser: `Frontend` -> `Tu Servidor (Proxy)` -> `Airtable API`.
* Cualquier petición de escritura en la tabla `Leads` debe ser validada en el servidor para evitar spam.

## 6. Flujo de Desarrollo Sugerido
1.  Configurar la estructura de base en Airtable.
2.  Desarrollar el Backend Proxy para comunicación segura.
3.  Construir la interfaz de usuario (Dashboard y Formulario).
4.  Configurar las automatizaciones nativas de Airtable para el cierre del ciclo de feedback.