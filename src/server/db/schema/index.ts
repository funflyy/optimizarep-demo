import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  decimal,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  real,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "enterprise_admin",
  "analyst",
  "viewer",
]);

export const packagingTypeEnum = pgEnum("packaging_type", [
  "primary",    // Primario
  "secondary",  // Secundario
  "tertiary",   // Terciario
]);

export const wasteTypeEnum = pgEnum("waste_type", [
  "recyclable",     // Reciclable
  "non_recyclable", // Irreciclable
]);

export const segmentEnum = pgEnum("segment", [
  "domiciliary",     // Domiciliario
  "non_domiciliary", // No Domiciliario
]);

export const productTypeEnum = pgEnum("product_type", [
  "envases_embalajes",      // Envases y Embalajes
  "raee",                   // Aparatos Eléctricos y Electrónicos
  "neumaticos",             // Neumáticos
  "aceites_lubricantes",    // Aceites Lubricantes
  "baterias",               // Baterías
  "pilas",                  // Pilas
  "textil",                 // Textil
]);

// ═══════════════════════════════════════════════════════════════
// Enterprises — Top-level tenant (el "buyer" de la plataforma)
// Una enterprise agrupa N organizations (los clientes del buyer)
// ═══════════════════════════════════════════════════════════════

export const enterprises = pgTable("enterprises", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  rut: varchar("rut", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Organizations — Multi-tenant base (clientes del buyer)
// Una organization pertenece a una enterprise.
// ═══════════════════════════════════════════════════════════════

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  enterpriseId: uuid("enterprise_id").references(() => enterprises.id, {
    onDelete: "restrict",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  rut: varchar("rut", { length: 20 }),
  clerkOrgId: varchar("clerk_org_id", { length: 255 }).unique(),
  /** Campos custom definidos por cada empresa (flexibilización) */
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Users
// ═══════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: userRoleEnum("role").default("viewer").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  /** Equivale a "superadmin" — controla toda la plataforma, ignora tenant */
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Products — SKU del productor
// ═══════════════════════════════════════════════════════════════

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    brand: varchar("brand", { length: 255 }),
    category: varchar("category", { length: 255 }),
    subcategory: varchar("subcategory", { length: 255 }),
    /** Tipo de Producto Prioritario REP (legacy — migrar a priorityProductId) */
    productType: productTypeEnum("product_type").default("envases_embalajes").notNull(),
    /** Producto Prioritario REP (texto libre legacy) */
    priorityProduct: varchar("priority_product", { length: 255 }),
    /** Producto Prioritario (catálogo dinámico) */
    priorityProductId: uuid("priority_product_id").references(
      () => priorityProducts.id
    ),
    observations: text("observations"),
    /** Campos custom por empresa (flexibilización) */
    customData: jsonb("custom_data").$type<Record<string, unknown>>(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("products_org_idx").on(table.organizationId),
    uniqueIndex("products_org_sku_idx").on(table.organizationId, table.sku),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Product Pieces — Piezas/componentes de cada envase
// Un SKU puede tener N piezas (botella + tapa + etiqueta)
// ═══════════════════════════════════════════════════════════════

export const productPieces = pgTable(
  "product_pieces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    /** Nombre de la pieza: Botella, Tapa, Etiqueta, Film, Caja... */
    pieceName: varchar("piece_name", { length: 255 }).notNull(),
    /** Primario / Secundario / Terciario */
    packagingType: packagingTypeEnum("packaging_type").notNull(),
    /** ¿Es domiciliario? Determina el segmento de tarifa */
    isDomiciliary: boolean("is_domiciliary").default(true).notNull(),
    /** Clasificación general: Plástico, Metal, Celulosa, Vidrio, Otros */
    materialClass: varchar("material_class", { length: 100 }).notNull(),
    /** Reciclable / Irreciclable */
    wasteType: wasteTypeEnum("waste_type").default("recyclable").notNull(),
    /** Clasificación detallada: PET, HDPE, PP Rígido, Cartón... */
    materialDetail: varchar("material_detail", { length: 255 }).notNull(),
    /** Peso de la pieza en gramos (legacy envases — usar weightValue + weightUnit para multi-producto) */
    weightGrams: real("weight_grams").notNull(),
    /** Valor numérico del peso (multi-producto) */
    weightValue: real("weight_value"),
    /** Unidad de peso: 'g' | 'kg' | 'L' */
    weightUnit: varchar("weight_unit", { length: 10 }).default("g").notNull(),
    /** Clasificación genérica nivel 1 (ej: "Plástico" o "Cat.1 Intercambio Temperatura") */
    categoryLevel1: varchar("category_level1", { length: 255 }),
    /** Clasificación genérica nivel 2 (ej: "PET" o "AIT CFC, HCFC") */
    categoryLevel2: varchar("category_level2", { length: 255 }),
    /** Campos específicos por tipo de producto (JSONB flexible) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** ¿Tiene presencia de grasa? Afecta la tarifa */
    hasGrease: boolean("has_grease").default(false).notNull(),
    /** ¿Es peligroso? Afecta la tarifa */
    isHazardous: boolean("is_hazardous").default(false).notNull(),
    /** Característica plástico: Transparente / Color (solo plásticos) */
    plasticCharacteristic: varchar("plastic_characteristic", { length: 50 }),
    /** ¿Es réplica de otro SKU? */
    isReplica: boolean("is_replica").default(false).notNull(),
    originalSku: varchar("original_sku", { length: 100 }),
    /** Categoría legal REP (A/B, DOM/NO DOM, Cat.1-6, AIT/PFV...) */
    repCategoryId: uuid("rep_category_id").references(() => repCategories.id),
    /** Categoría homologada de red (para tarifas y drill-down) */
    homologatedCategoryId: uuid("homologated_category_id").references(
      () => homologatedCategories.id
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pieces_product_idx").on(table.productId)]
);

// ═══════════════════════════════════════════════════════════════
// Sales Records — Ventas por período
// El peso total se calcula: units_sold × Σ(peso_piezas)
// ═══════════════════════════════════════════════════════════════

export const salesRecords = pgTable(
  "sales_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    year: integer("year").notNull(),
    /** Mes del período: 0 = anual, 1-12 = mensual (la MAESTRA declara mensual) */
    month: integer("month").default(0).notNull(),
    /**
     * Segmento al que aplican estas unidades: 'Domiciliario' | 'No Domiciliario'.
     *
     * En un mismo mes un SKU tiene dos cifras distintas: las unidades de venta
     * al detalle (172.066 botellas) y los pallets o cajas que las transportan
     * (8.000). Sin este campo había una sola fila por mes y las unidades del
     * detalle se aplicaban también a los pallets, inflando el tonelaje NO
     * DOMICILIARIO unas 150 veces.
     */
    segment: varchar("segment", { length: 50 })
      .default("Domiciliario")
      .notNull(),
    /** Unidades vendidas en el período */
    unitsSold: integer("units_sold").notNull(),
    /** Unidad de la cantidad: 'unidades' | 'litros' (aceites lubricantes) */
    unit: varchar("unit", { length: 20 }).default("unidades").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sales_product_period_idx").on(
      table.productId,
      table.year,
      table.month,
      table.segment
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Management Systems — Catálogo dinámico de SIG
// ReSimple, Giro, COREIGN, ProREP, Chilerecicla, etc.
// Se agregan nuevos SIG sin cambiar código
// ═══════════════════════════════════════════════════════════════

export const managementSystems = pgTable("management_systems", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  /** Producto Prioritario que cubre este SIG (legacy texto) */
  priorityProduct: varchar("priority_product", { length: 255 }).notNull(),
  /** Producto Prioritario (catálogo dinámico) */
  priorityProductId: uuid("priority_product_id").references(
    () => priorityProducts.id
  ),
  tariffUrl: varchar("tariff_url", { length: 500 }),
  hasDomiciliary: boolean("has_domiciliary").default(true).notNull(),
  hasNonDomiciliary: boolean("has_non_domiciliary").default(false).notNull(),
  observations: text("observations"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Tariff Categories — Nomenclatura propia de cada SIG
// Cada SIG clasifica materiales de forma diferente
// ═══════════════════════════════════════════════════════════════

export const tariffCategories = pgTable(
  "tariff_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    systemId: uuid("system_id")
      .references(() => managementSystems.id, { onDelete: "cascade" })
      .notNull(),
    /** Domiciliario / No Domiciliario */
    segment: varchar("segment", { length: 50 }).notNull(),
    /** Material según nomenclatura del SIG */
    material: varchar("material", { length: 255 }).notNull(),
    /** Subcategoría según nomenclatura del SIG */
    subcategory: varchar("subcategory", { length: 255 }).notNull(),
    /** Tipo de tarifa: Normal, Sin Grasa, Con Grasa, Peligroso */
    tariffType: varchar("tariff_type", { length: 100 }).notNull(),
    /** Clave de lookup compuesta: "Domiciliario|Botellas PET|Sin Grasa" */
    lookupKey: varchar("lookup_key", { length: 500 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tariff_cat_system_idx").on(table.systemId),
    uniqueIndex("tariff_cat_lookup_idx").on(table.systemId, table.lookupKey),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Tariffs — Tarifas vigentes (UF/Ton por año)
// ═══════════════════════════════════════════════════════════════

export const tariffs = pgTable(
  "tariffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .references(() => tariffCategories.id, { onDelete: "cascade" })
      .notNull(),
    year: integer("year").notNull(),
    /** Tarifa en UF por tonelada (0 si el SIG cobra en otra modalidad) */
    rateUfPerTon: decimal("rate_uf_per_ton", {
      precision: 12,
      scale: 4,
    }).notNull(),
    /** Valor de la tarifa en su modalidad nativa */
    rateValue: decimal("rate_value", { precision: 14, scale: 4 }),
    /** Modalidad: 'UF/ton' (envases) | 'CLP/kg' (neumáticos) */
    rateUnit: varchar("rate_unit", { length: 20 }).default("UF/ton").notNull(),
    /** true si la tarifa publicada es + IVA */
    plusIva: boolean("plus_iva").default(false).notNull(),
    source: varchar("source", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tariffs_cat_year_idx").on(table.categoryId, table.year),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Tariff Mappings — Mapeo pieza → categoría tarifa (UI editable)
// Permite que el usuario configure cómo su material_detail
// se traduce a la nomenclatura de cada SIG
// ═══════════════════════════════════════════════════════════════

export const tariffMappings = pgTable(
  "tariff_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    systemId: uuid("system_id")
      .references(() => managementSystems.id)
      .notNull(),
    /** Clasificación del producto (ej: "PET", "HDPE") */
    materialDetail: varchar("material_detail", { length: 255 }).notNull(),
    /** Segmento: domiciliario / no domiciliario */
    segment: varchar("segment", { length: 50 }).notNull(),
    /** Indica si tiene grasa (afecta qué categoría de tarifa aplica) */
    hasGrease: boolean("has_grease").default(false).notNull(),
    /** Indica si es peligroso */
    isHazardous: boolean("is_hazardous").default(false).notNull(),
    /** Categoría de tarifa a la que mapea */
    tariffCategoryId: uuid("tariff_category_id")
      .references(() => tariffCategories.id)
      .notNull(),
    /** Configurado por el usuario desde la UI */
    isManual: boolean("is_manual").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mapping_org_system_idx").on(table.organizationId, table.systemId),
    uniqueIndex("mapping_unique_idx").on(
      table.organizationId,
      table.systemId,
      table.materialDetail,
      table.segment,
      table.hasGrease,
      table.isHazardous
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Priority Products — Catálogo dinámico de Productos Prioritarios
// Neumáticos, Envases, RAEE, Aceites, Pilas+AEE... (extensible)
// ═══════════════════════════════════════════════════════════════

export const priorityProducts = pgTable("priority_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Código estable: 'neumaticos', 'envases_embalajes', 'raee'... */
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Decreto: 'D.S. 8/2019', 'D.S. 12/2020', 'D.S. 47/2023', 'D.S. 22/2025' */
  decree: varchar("decree", { length: 100 }),
  legalBasis: text("legal_basis"),
  /** Unidad nativa de peso/volumen: 'g' | 'kg' | 'L' */
  nativeUnit: varchar("native_unit", { length: 10 }).default("g").notNull(),
  /** Año calendario desde el que rigen las metas (2027 aceites, 2028 pilas) */
  goalsEffectiveFrom: integer("goals_effective_from"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Organization Priority Products — Qué productos prioritarios
// maneja cada empresa (pantalla de selección al entrar)
// ═══════════════════════════════════════════════════════════════

export const organizationPriorityProducts = pgTable(
  "organization_priority_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    priorityProductId: uuid("priority_product_id")
      .references(() => priorityProducts.id)
      .notNull(),
    /** SIG que la empresa declara usar para este producto prioritario */
    activeSystemId: uuid("active_system_id").references(
      () => managementSystems.id
    ),
    /** Exención legal: <300 kg (ENV), ≤66 L/año (ALU), microempresa */
    isExempt: boolean("is_exempt").default(false).notNull(),
    exemptionReason: varchar("exemption_reason", { length: 255 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("org_pp_unique_idx").on(
      table.organizationId,
      table.priorityProductId
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// REP Categories — Taxonomía legal por producto prioritario
// NEU: A/B/3/4 (+FD) · ENV: DOM/NO DOM × subcategoría · RAEE: Cat.1-6
// ALU: Recuperable/No recuperable · P+RAEE: AIT/PFV/Otros/Pila
// ═══════════════════════════════════════════════════════════════

export const repCategories = pgTable(
  "rep_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityProductId: uuid("priority_product_id")
      .references(() => priorityProducts.id, { onDelete: "cascade" })
      .notNull(),
    /** Código legal: 'A', 'B', 'DOM', 'NO DOM', 'Cat.1', 'AIT', 'recuperable'... */
    code: varchar("code", { length: 50 }).notNull(),
    /** Subcategoría legal: 'Plástico', 'Papel y cartón', 'AIT CFC/HCFC'... */
    subcategory: varchar("subcategory", { length: 255 }).default("").notNull(),
    description: text("description"),
    /** Factor de desgaste (neumáticos: A=0.84, B=0.75) u otro factor legal */
    wearFactor: decimal("wear_factor", { precision: 6, scale: 4 }),
    /** false = exento del régimen (NEU cat. 3/4, ALU no recuperable) */
    subjectToRep: boolean("subject_to_rep").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("rep_cat_unique_idx").on(
      table.priorityProductId,
      table.code,
      table.subcategory
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Compliance Goals — Metas legales por decreto/categoría/año
// Las fórmulas (Pi, PDi, promedio 3 años) se calculan en el server
// ═══════════════════════════════════════════════════════════════

export const complianceGoals = pgTable(
  "compliance_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityProductId: uuid("priority_product_id")
      .references(() => priorityProducts.id, { onDelete: "cascade" })
      .notNull(),
    /** Meta específica por categoría/subcategoría (null = meta general) */
    repCategoryId: uuid("rep_category_id").references(() => repCategories.id),
    /** 'recoleccion' | 'valorizacion' | 'general' | 'especifica' */
    goalType: varchar("goal_type", { length: 50 }).notNull(),
    /** Año de régimen (1..N desde vigencia del decreto) */
    regimeYear: integer("regime_year").notNull(),
    /** Año calendario equivalente, si se conoce */
    calendarYear: integer("calendar_year"),
    percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
    /** Referencia legal: 'art. 20', 'art. 21'... */
    legalRef: varchar("legal_ref", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("goals_pp_idx").on(table.priorityProductId)]
);

// ═══════════════════════════════════════════════════════════════
// Homologated Categories — La "sábana grande" de la reunión 11-jul
// Categoría única de red por producto prioritario; los gráficos y
// el drill-down usan esta nomenclatura (Papel y Cartón, no "celulosa")
// ═══════════════════════════════════════════════════════════════

export const homologatedCategories = pgTable(
  "homologated_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    priorityProductId: uuid("priority_product_id")
      .references(() => priorityProducts.id, { onDelete: "cascade" })
      .notNull(),
    /** 'domiciliario' | 'no_domiciliario' | 'unico' (NEU, ALU) */
    segment: varchar("segment", { length: 50 }).notNull(),
    /** Material nivel red: 'Plásticos', 'Papel y Cartón', 'Metales'... */
    material: varchar("material", { length: 255 }).notNull(),
    /** Subcategoría nivel red: 'Botellas PET', 'Cartón para Bebidas'... */
    subcategory: varchar("subcategory", { length: 255 }).notNull(),
    /** 'Normal' | 'Sin Grasa' | 'Con Grasa' | 'Peligroso' */
    tariffType: varchar("tariff_type", { length: 100 })
      .default("Normal")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("homolog_cat_unique_idx").on(
      table.priorityProductId,
      table.segment,
      table.material,
      table.subcategory,
      table.tariffType
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Tariff Category Homologations — Cruce sábana × SIG
// Donde el SIG no tiene la categoría, se iguala el precio
// (is_price_equalized + source). Editable por administradores.
// ═══════════════════════════════════════════════════════════════

export const tariffCategoryHomologations = pgTable(
  "tariff_category_homologations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    homologatedCategoryId: uuid("homologated_category_id")
      .references(() => homologatedCategories.id, { onDelete: "cascade" })
      .notNull(),
    systemId: uuid("system_id")
      .references(() => managementSystems.id, { onDelete: "cascade" })
      .notNull(),
    /** Categoría de tarifa del SIG que aplica (null = no aplica en este SIG) */
    tariffCategoryId: uuid("tariff_category_id").references(
      () => tariffCategories.id
    ),
    /** true = el SIG no tenía esta categoría; el precio se igualó */
    isPriceEqualized: boolean("is_price_equalized").default(false).notNull(),
    /** Categoría desde la que se tomó el precio igualado */
    sourceTariffCategoryId: uuid("source_tariff_category_id").references(
      () => tariffCategories.id
    ),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("homolog_sig_unique_idx").on(
      table.homologatedCategoryId,
      table.systemId
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// Custom Field Definitions — Columnas dinámicas por organización
// (categorías internas del cliente: marca propia, procedencia...)
// Los valores viven en products.custom_data (JSONB)
// ═══════════════════════════════════════════════════════════════

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    /** Clave en products.custom_data */
    fieldKey: varchar("field_key", { length: 100 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    /** 'text' | 'number' | 'select' */
    fieldType: varchar("field_type", { length: 20 }).default("text").notNull(),
    /** Opciones para tipo 'select' */
    options: jsonb("options").$type<string[]>(),
    /** Visible como filtro/columna en el dashboard (máx. ~7 — regla en app) */
    showInDashboard: boolean("show_in_dashboard").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("custom_field_unique_idx").on(
      table.organizationId,
      table.fieldKey
    ),
  ]
);

// ═══════════════════════════════════════════════════════════════
// UF Values — Valor UF diario (CLP) para doble visualización
// El costo se mantiene en UF; CLP es referencial con fecha visible
// ═══════════════════════════════════════════════════════════════

export const ufValues = pgTable("uf_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull().unique(),
  valueClp: decimal("value_clp", { precision: 12, scale: 2 }).notNull(),
  source: varchar("source", { length: 100 }).default("mindicador.cl").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Declarations — Declaraciones RETC / SISREP / SINADER
// Recordatorios: 8 días hábiles antes del vencimiento
// ═══════════════════════════════════════════════════════════════

export const declarations = pgTable(
  "declarations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    priorityProductId: uuid("priority_product_id")
      .references(() => priorityProducts.id)
      .notNull(),
    /** 'RETC' | 'SISREP' | 'SINADER' */
    targetSystem: varchar("target_system", { length: 50 })
      .default("RETC")
      .notNull(),
    periodYear: integer("period_year").notNull(),
    /** 0 = anual, 1-12 = mensual */
    periodMonth: integer("period_month").default(0).notNull(),
    /** 'draft' | 'ready' | 'sent' */
    status: varchar("status", { length: 50 }).default("draft").notNull(),
    dueDate: timestamp("due_date"),
    sentAt: timestamp("sent_at"),
    totalTons: decimal("total_tons", { precision: 14, scale: 4 }),
    /** Snapshot de los datos declarados */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("declarations_org_idx").on(table.organizationId)]
);

// ═══════════════════════════════════════════════════════════════
// Audit Log — Trazabilidad de cambios (auditoría de datos cargados)
// ═══════════════════════════════════════════════════════════════

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    userId: uuid("user_id").references(() => users.id),
    /** Tabla/entidad afectada: 'products', 'tariffs', 'import'... */
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    /** 'create' | 'update' | 'delete' | 'import' */
    action: varchar("action", { length: 20 }).notNull(),
    /** Diff o datos del cambio */
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("audit_org_entity_idx").on(table.organizationId, table.entity)]
);

// ═══════════════════════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════════════════════

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  enterprise: one(enterprises, {
    fields: [organizations.enterpriseId],
    references: [enterprises.id],
  }),
  users: many(users),
  products: many(products),
  tariffMappings: many(tariffMappings),
}));

export const enterprisesRelations = relations(enterprises, ({ many }) => ({
  organizations: many(organizations),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.organizationId],
    references: [organizations.id],
  }),
  pieces: many(productPieces),
  salesRecords: many(salesRecords),
}));

export const productPiecesRelations = relations(productPieces, ({ one }) => ({
  product: one(products, {
    fields: [productPieces.productId],
    references: [products.id],
  }),
}));

export const salesRecordsRelations = relations(salesRecords, ({ one }) => ({
  product: one(products, {
    fields: [salesRecords.productId],
    references: [products.id],
  }),
  creator: one(users, {
    fields: [salesRecords.createdBy],
    references: [users.id],
  }),
}));

export const managementSystemsRelations = relations(
  managementSystems,
  ({ many }) => ({
    tariffCategories: many(tariffCategories),
    tariffMappings: many(tariffMappings),
  })
);

export const tariffCategoriesRelations = relations(
  tariffCategories,
  ({ one, many }) => ({
    system: one(managementSystems, {
      fields: [tariffCategories.systemId],
      references: [managementSystems.id],
    }),
    tariffs: many(tariffs),
    mappings: many(tariffMappings),
  })
);

export const tariffsRelations = relations(tariffs, ({ one }) => ({
  category: one(tariffCategories, {
    fields: [tariffs.categoryId],
    references: [tariffCategories.id],
  }),
}));

export const tariffMappingsRelations = relations(
  tariffMappings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [tariffMappings.organizationId],
      references: [organizations.id],
    }),
    system: one(managementSystems, {
      fields: [tariffMappings.systemId],
      references: [managementSystems.id],
    }),
    tariffCategory: one(tariffCategories, {
      fields: [tariffMappings.tariffCategoryId],
      references: [tariffCategories.id],
    }),
    createdByUser: one(users, {
      fields: [tariffMappings.createdBy],
      references: [users.id],
    }),
  })
);

export const priorityProductsRelations = relations(
  priorityProducts,
  ({ many }) => ({
    organizationLinks: many(organizationPriorityProducts),
    repCategories: many(repCategories),
    complianceGoals: many(complianceGoals),
    homologatedCategories: many(homologatedCategories),
    products: many(products),
    managementSystems: many(managementSystems),
    declarations: many(declarations),
  })
);

export const organizationPriorityProductsRelations = relations(
  organizationPriorityProducts,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationPriorityProducts.organizationId],
      references: [organizations.id],
    }),
    priorityProduct: one(priorityProducts, {
      fields: [organizationPriorityProducts.priorityProductId],
      references: [priorityProducts.id],
    }),
    activeSystem: one(managementSystems, {
      fields: [organizationPriorityProducts.activeSystemId],
      references: [managementSystems.id],
    }),
  })
);

export const repCategoriesRelations = relations(
  repCategories,
  ({ one, many }) => ({
    priorityProduct: one(priorityProducts, {
      fields: [repCategories.priorityProductId],
      references: [priorityProducts.id],
    }),
    complianceGoals: many(complianceGoals),
  })
);

export const complianceGoalsRelations = relations(
  complianceGoals,
  ({ one }) => ({
    priorityProduct: one(priorityProducts, {
      fields: [complianceGoals.priorityProductId],
      references: [priorityProducts.id],
    }),
    repCategory: one(repCategories, {
      fields: [complianceGoals.repCategoryId],
      references: [repCategories.id],
    }),
  })
);

export const homologatedCategoriesRelations = relations(
  homologatedCategories,
  ({ one, many }) => ({
    priorityProduct: one(priorityProducts, {
      fields: [homologatedCategories.priorityProductId],
      references: [priorityProducts.id],
    }),
    homologations: many(tariffCategoryHomologations),
  })
);

export const tariffCategoryHomologationsRelations = relations(
  tariffCategoryHomologations,
  ({ one }) => ({
    homologatedCategory: one(homologatedCategories, {
      fields: [tariffCategoryHomologations.homologatedCategoryId],
      references: [homologatedCategories.id],
    }),
    system: one(managementSystems, {
      fields: [tariffCategoryHomologations.systemId],
      references: [managementSystems.id],
    }),
    tariffCategory: one(tariffCategories, {
      fields: [tariffCategoryHomologations.tariffCategoryId],
      references: [tariffCategories.id],
    }),
    sourceTariffCategory: one(tariffCategories, {
      fields: [tariffCategoryHomologations.sourceTariffCategoryId],
      references: [tariffCategories.id],
    }),
  })
);

export const customFieldDefinitionsRelations = relations(
  customFieldDefinitions,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [customFieldDefinitions.organizationId],
      references: [organizations.id],
    }),
  })
);

export const declarationsRelations = relations(declarations, ({ one }) => ({
  organization: one(organizations, {
    fields: [declarations.organizationId],
    references: [organizations.id],
  }),
  priorityProduct: one(priorityProducts, {
    fields: [declarations.priorityProductId],
    references: [priorityProducts.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLog.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}));

export * from "./dashboard";
