# Airtable Schema - Hipoteca Aquí

Este archivo sirve como referencia para el mapeo de campos entre el formulario web y Airtable.

## Tabla: Contacts
Utilizada para almacenar la información de contacto inicial.

| Campo Web (name) | Campo Airtable | Tipo |
| :--- | :--- | :--- |
| `Nombre y apellidos` | `Nombre y apellidos` | Single line text |
| `Email` | `Email` | Email |
| `Telefono` | `Telefono` | Phone |

## Tabla: Hipoteca
Utilizada para los datos de la simulación de viabilidad.

| Campo Web (name) | Campo Airtable | Tipo |
| :--- | :--- | :--- |
| `Tipo de inmueble` | `Tipo de inmueble` | Single select |
| `Estado del inmueble` | `Estado del inmueble` | Single select |
| `Precio de compra` | `Precio de compra` | Currency |
| `Aportación` | `Aportación` | Currency |
| `Finalidad` | `Finalidad` | Single select |
| `Provincia` | `Provincia` | Single select |
| `Ingresos mensuales` | `Ingresos mensuales` | Currency |
| `Tipo de contrato` | `Tipo de contrato` | Single select |

> [!IMPORTANT]
> Los nombres de los campos en el HTML (atributo `name`) deben coincidir EXACTAMENTE con los nombres en Airtable.
