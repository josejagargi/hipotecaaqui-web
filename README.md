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

USERS:

2 TYPE OF USERS:

1. CLIENTES: Pueden ver el estado de su hipoteca en tiempo real.
- No cliente registrado: deben ser invitados por la web a realizar un scoring, para asi registrarse
2. ASOCIADOS: Pueden ver el estado de sus hipotecas y las de sus clientes.
- No asociado registrado: deben ser invitados a ser asociados, para una vez ser asociados, poder utilizar los servicios. 