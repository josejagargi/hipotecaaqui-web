# Plan de Implementación: Redefinición de KPIs y Gráficos de Proceso ("Etapa" y "Viabilidad")

Este plan detalla los cambios requeridos para actualizar la vista de "Mi Actividad" en el portal de asociados, eliminando las métricas estáticas de "En Proceso" y "Aprobados", y sustituyéndolas por dos widgets de gráficos dinámicos que representen la distribución de la **Etapa** (funnel del proceso) y la **Viabilidad** (scoring de riesgo) de todos los estudios del asociado.

---

## User Review Required

> [!IMPORTANT]
> - **Rediseño de KPIs:** El diseño conservará la métrica general de `Total Estudios` y convertirá las otras dos tarjetas de KPI en widgets gráficos interactivos que se integran de forma natural en el grid del dashboard.
> - **Cero Dependencias Externas:** Para maximizar el rendimiento, tiempos de carga instantáneos e inmunidad a bloqueos de red o scripts externos, implementaremos gráficos personalizados premium usando HTML5, CSS semántico (flexbox, gradientes, sombras) y SVG en lugar de pesadas librerías de terceros (como Chart.js).
> - **Compatibilidad de Datos:** El proceso leerá de forma 100% dinámica los campos de Airtable `{Etapa}` y `{Viabilidad}` de todos los registros del usuario, auto-ajustando las barras y porcentajes según los datos reales en tiempo real.

---

## Proposed Changes

### Interfaz de Usuario (Frontend)

#### [MODIFY] [dashboard.html](file:///c:/Proyectos/Hipotecaaqui/public/dashboard.html)
- Modificar la sección `.stats-overview` para rediseñar las tres tarjetas:
  1. **Tarjeta 1 (Total Estudios):** Se mantiene como un contador numérico de alto impacto visual con diseño premium.
  2. **Tarjeta 2 (Estado por Etapa):** Cambiar de un simple contador a un contenedor de gráfico de barras de progreso horizontales con ID `etapaChartContainer`.
  3. **Tarjeta 3 (Distribución de Viabilidad):** Cambiar de un simple contador a un contenedor de barra apilada de color/semáforo dinámico con ID `viabilidadChartContainer` (Verde para *Viable*, Rojo para *No Viable*, Gris para *Sin analizar*).

#### [MODIFY] [portal-dashboard.js](file:///c:/Proyectos/Hipotecaaqui/public/js/portal-dashboard.js)
- Eliminar las asignaciones y referencias obsoletas a `pendingRecords` y `approvedRecords`.
- Implementar la función `renderProcessGraphics(records)` que:
  - Agrupe y cuente la cantidad de expedientes en cada valor único de `{Etapa}` (ej: "Estudio de viabilidad", "Presentado a bancos", etc.), ordenándolos de mayor a menor y calculando su porcentaje.
  - Agrupe y cuente la cantidad de expedientes por `{Viabilidad}` (filtrando por cadenas que contengan "viable", "no viable" o vacías/sin analizar).
  - Inyecte dinámicamente en el HTML los micro-gráficos interactivos con barras animadas, leyendas de colores, contadores exactos y porcentajes de distribución.
- Actualizar la función `loadDashboardData()` para invocar a `renderProcessGraphics(data.records)`.

---

## Plan de Verificación

### Pruebas Manuales
1. **Comportamiento Visual:** Iniciar sesión en el portal y comprobar que la sección de KPIs muestra el contador de total y los dos nuevos widgets gráficos integrados elegantemente.
2. **Dinamicidad de Datos:** Crear o editar un estudio de prueba cambiando su etapa o su viabilidad (por ejemplo, de "Sin analizar" a "Viable") y confirmar que los gráficos se actualizan de forma inmediata y automática al guardar.
3. **Responsividad:** Redimensionar la pantalla a formatos tablet y móvil para comprobar que las barras y leyendas del gráfico se reajustan perfectamente sin romper el diseño del portal.
