# Diseño de la Base de Datos Definitiva — ImpactaREP

> Fuentes: `MAESTRA BBDD REP_VF2.0.xlsx` (reunión 11-jul), `Plataforma REP_Línea Base.xlsx`,
> transcripción reunión 10-jul-2026 (Luis Droguett ↔ Cristian Godoy) y `correo.txt`.
> Estado: estructura aplicada a la BD `impactarep`. **Seed definitivo pendiente** (a cargar
> cuando se valide el modelo con el cliente).

## Principios de diseño (derivados de las observaciones)

1. **Extensible sin desarrollo**: nuevos productos prioritarios, sistemas de gestión,
   materiales y tarifas anuales se agregan como *datos*, nunca como código
   (requisito explícito del correo y la reunión). Por eso los catálogos son tablas,
   no enums.
2. **Producto prioritario como eje**: una empresa puede tener varios productos
   prioritarios (RAEE + Envases). Cada uno tiene SIG y costos propios que **no se
   mezclan**. La pantalla intermedia de selección se alimenta de
   `organization_priority_products`.
3. **Homologación de tarifas** ("sábana grande"): tabla única de categorías
   homologadas por producto prioritario; cada SIG se mapea contra ella. Donde un
   SIG no tiene la categoría, se marca `is_price_equalized` y se referencia de qué
   categoría se tomó el precio (regla "se iguala el precio, no se inventa").
4. **Unidades nativas heterogéneas**: Envases en gramos, Neumáticos/RAEE/Pilas en
   kg, Aceites en litros (+ densidad). Se guarda valor + unidad y se convierte a
   toneladas en el cálculo.
5. **Nomenclatura "red" en la capa de análisis**: los gráficos usan las
   subcategorías homologadas (Papel y Cartón, no "celulosa"); el drill-down baja
   de material → subcategoría → clasificación detallada.
6. **Columnas base vs dinámicas**: las columnas base son las del modelo físico;
   las categorías internas del cliente (marca propia, procedencia, etc.) viven en
   `custom_field_definitions` + `products.custom_data` (JSONB), con selector de
   visibilidad (máx. ~7 en dashboard).
7. **UF fija, CLP referencial**: los costos se calculan y persisten en UF; la
   conversión a CLP usa `uf_values` (valor del día + fecha visible en footer).
8. **Cumplimiento normativo por decreto**: metas y factores (FD 0,84/0,75,
   metas 2027/2028, etc.) son datos en `rep_categories` y `compliance_goals`;
   las fórmulas (Pi, PDi, promedio 3 años) se calculan en el servidor, no se
   almacenan.
9. **Auditoría**: `audit_log` registra cambios; los productos sin clasificar se
   detectan por consulta (piezas sin `homologated_category_id`).

## Mapa de tablas

### Existentes (se mantienen, con columnas nuevas)

| Tabla | Cambios |
|---|---|
| `organizations` | sin cambios |
| `users` | sin cambios |
| `products` | + `priority_product_id` FK → `priority_products` |
| `product_pieces` | + `rep_category_id` FK, + `homologated_category_id` FK |
| `sales_records` | + `month` (0 = anual; 1-12 mensual, la MAESTRA es mensual), + `unit` (unidades / litros), unique pasa a (product, year, month) |
| `management_systems` | + `priority_product_id` FK (reemplaza gradualmente el varchar `priority_product`) |
| `tariff_categories` | sin cambios (nomenclatura propia de cada SIG) |
| `tariffs` | sin cambios (ya versionadas por año, UF/ton) |
| `tariff_mappings` | sin cambios (mapeo pieza→categoría por organización) |

### Nuevas

| Tabla | Propósito | Fuente |
|---|---|---|
| `priority_products` | Catálogo dinámico: Neumáticos (D.S. 8/2019), Envases (D.S. 12/2020), RAEE (Guía MMA), Aceites (D.S. 47/2023, metas 2027), Pilas+AEE (D.S. 22/2025, metas 2028). Unidad nativa por producto. | Portada MAESTRA |
| `organization_priority_products` | Qué productos prioritarios maneja cada empresa (pantalla de selección, añadir/quitar), SIG activo declarado, exenciones (<300 kg ENV, ≤66 L ALU, microempresa). | Reunión punto B |
| `rep_categories` | Taxonomía legal por producto prioritario: NEU A/B/3/4 con FD; ENV DOM/NO DOM × 6 subcategorías; RAEE Cat.1-6; ALU Recuperable/No; P+RAEE AIT/PFV/Otros/Pila. `subject_to_rep=false` para exentos. | Hojas "Listas REP" |
| `compliance_goals` | Metas por decreto/categoría/tipo (recolección, valorización, general, específica) y año de régimen/calendario. | Hojas Cumplimiento |
| `homologated_categories` | La "sábana grande": categoría única de red por producto prioritario (segmento × material × subcategoría × tipo tarifa). Alimenta gráficos y drill-down. | Reunión punto C/D |
| `tariff_category_homologations` | Cruce categoría homologada × SIG → categoría de tarifa del SIG. `is_price_equalized` + `source_tariff_category_id` cuando el precio se igualó. Editable por administradores. | Reunión punto C |
| `custom_field_definitions` | Columnas dinámicas por organización (clave, etiqueta, tipo, opciones, visible en dashboard, orden). Los valores van en `products.custom_data`. | Reunión punto E |
| `uf_values` | Valor UF diario en CLP (fuente mindicador.cl / Banco Central) con fecha de obtención. | Reunión punto F |
| `declarations` | Declaraciones RETC/SISREP/SINADER: período, estado (borrador/lista/enviada), fecha envío, vencimiento (recordatorio 8 días hábiles), total ton, payload. | RAEE·Cumplimiento + propuesta v2.0 |
| `audit_log` | Trazabilidad de cambios (entidad, acción, diff JSONB, usuario). | Reunión punto K |

## Flujo de cálculo (referencia)

```
toneladas = Σ_piezas (peso_nativo → ton) × unidades_vendidas
          (ENV: g/1e6 · NEU/RAEE: kg/1000 · ALU: L × densidad / 1000)
costo_SIG = toneladas × tarifa(UF/ton) del año, vía:
  pieza → homologated_category → tariff_category_homologations(SIG) → tariff(año)
cumplimiento = fórmula del decreto (Pi = NGi×100 / (NCi-1×FD), PDi, promedio 3 años)
CLP referencial = UF × uf_values(fecha)
```

## Pendientes de decisión con el cliente

- Confirmar columnas BASE definitivas vs dinámicas (reunión del lunes).
- Visibilidad de "Oportunidades" (interna vs cliente final) → se resolverá con roles.
- Validar la sábana de homologación inicial (ReSimple 122 × Giro 75 × ProREP)
  antes de sembrarla.

## Plan de seed definitivo (NO ejecutado aún, por instrucción del 13-jul)

1. `priority_products` + `rep_categories` + `compliance_goals` desde hojas
   "Listas REP" y "Cumplimiento" de la MAESTRA v2.0.
2. `management_systems` (ReSimple, Giro, ProREP, NEUVOL, VALORA+, SIGRA,
   Chilerecicla, Individual) ligados a su producto prioritario.
3. `tariff_categories` + `tariffs` 2026 desde las hojas de tarifas.
4. `homologated_categories` + homologaciones (proponer sábana, validar con
   Cristian).
5. Datos demo (Empresa X/Y, RAEE) solo para el ambiente de demo comercial.
