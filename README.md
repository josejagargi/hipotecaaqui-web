# Hipoteca Aquí - Web

Repositorio profesional para el sitio web de Hipoteca Aquí.

## Estructura del Proyecto
- `public/`: Contiene los archivos estáticos (HTML, CSS, JS, imágenes) que se despliegan en Netlify.
- `netlify/functions/`: Funciones serverless para la integración con Airtable.
- `AIRTABLE_SCHEMA.md`: Documentación del mapeo de campos.

## Despliegue
El sitio se despliega automáticamente en Netlify cada vez que se hace un `push` a la rama `main`.
URL: https://hipotecaaqui.com

## Desarrollo Local
Para probar localmente las funciones de Netlify:
```bash
netlify dev
```
