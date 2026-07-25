-- ═══════════════════════════════════════════════════════════════
-- Seed OptimizaREP — Datos del Excel BBDD RAEE_LEY REP (20.920)
-- Fuente: Hojas "📦 Inventario AEE", "📊 Resultados RETC", "📚 Listas"
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_org_id UUID;
  v_prod_id UUID;
BEGIN
  -- Usar la organización demo existente
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No hay organizaciones. Crea una primero.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AEE-001: Refrigerador No Frost 350L
  -- Cat.1 Aparatos de Intercambio de Temperatura
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO products (organization_id, sku, name, brand, category, subcategory, product_type, priority_product, is_active)
  VALUES (v_org_id, 'AEE-001', 'Refrigerador No Frost 350L', 'Samsung', 'Grandes Aparatos Domésticos', 'Refrigeradores', 'raee', 'Aparatos Eléctricos y Electrónicos', true)
  ON CONFLICT (organization_id, sku) DO NOTHING
  RETURNING id INTO v_prod_id;

  IF v_prod_id IS NOT NULL THEN
    INSERT INTO product_pieces (
      product_id, piece_name, packaging_type, is_domiciliary,
      material_class, waste_type, material_detail,
      weight_grams, weight_value, weight_unit,
      category_level1, category_level2, metadata
    ) VALUES (
      v_prod_id, 'Refrigerador No Frost 350L', 'primary', false,
      'RAEE', 'non_recyclable', 'Cat.1 Aparatos de Intercambio de Temperatura',
      71000, 71.0, 'kg',
      'Cat.1 Aparatos de Intercambio de Temperatura',
      'AIT CFC, HCFC, HFC, HC',
      '{
        "modelo": "RF350",
        "tipoFamilia": "Grandes Aparatos Domésticos",
        "añoDeclaracion": 2026,
        "periodoDeclarado": "2025",
        "arbolDecision": "Posee gases refrigerantes → Cat.1",
        "dimensions": {"height": 178, "width": 72, "depth": 60, "diameter": 0, "dimExteriorMayor": 178},
        "fuentePeso": 1,
        "tienePilaBateria": false,
        "extraibleUsuario": false,
        "pesoPilaBateriaKg": 0,
        "observaciones": "Posee gases refrigerantes HCFC. Declarar separado de embalajes."
      }'::jsonb
    );
    INSERT INTO sales_records (product_id, year, units_sold) VALUES (v_prod_id, 2025, 30000);
    RAISE NOTICE 'AEE-001 insertado: Refrigerador No Frost 350L';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AEE-002: Plancha Ropa 1800W
  -- Cat.6 Pequeños Aparatos (dim. ≤ 50cm)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO products (organization_id, sku, name, brand, category, subcategory, product_type, priority_product, is_active)
  VALUES (v_org_id, 'AEE-002', 'Plancha Ropa 1800W', 'Philips', 'Pequeños Electrodomésticos', 'Planchas', 'raee', 'Aparatos Eléctricos y Electrónicos', true)
  ON CONFLICT (organization_id, sku) DO NOTHING
  RETURNING id INTO v_prod_id;

  IF v_prod_id IS NOT NULL THEN
    INSERT INTO product_pieces (
      product_id, piece_name, packaging_type, is_domiciliary,
      material_class, waste_type, material_detail,
      weight_grams, weight_value, weight_unit,
      category_level1, category_level2, metadata
    ) VALUES (
      v_prod_id, 'Plancha Ropa 1800W', 'primary', false,
      'RAEE', 'non_recyclable', 'Cat.6 Pequeños Aparatos',
      1520, 1.52, 'kg',
      'Cat.6 Pequeños Aparatos (dim. ≤ 50cm)',
      'Otros pequeños aparatos',
      '{
        "modelo": "PL1800",
        "tipoFamilia": "Pequeños Electrodomésticos",
        "añoDeclaracion": 2026,
        "periodoDeclarado": "2025",
        "arbolDecision": "Sin pila extraíble. Dim. mayor ≤50cm → Cat.6",
        "dimensions": {"height": 14, "width": 12, "depth": 28, "diameter": 0, "dimExteriorMayor": 28},
        "fuentePeso": 1,
        "tienePilaBateria": false,
        "extraibleUsuario": false,
        "pesoPilaBateriaKg": 0,
        "observaciones": "Sin características especiales."
      }'::jsonb
    );
    INSERT INTO sales_records (product_id, year, units_sold) VALUES (v_prod_id, 2025, 100000);
    RAISE NOTICE 'AEE-002 insertado: Plancha Ropa 1800W';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AEE-003: Televisor LED 55"
  -- Cat.2 Monitores, Pantallas y Aparatos con Pantallas > 100cm²
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO products (organization_id, sku, name, brand, category, subcategory, product_type, priority_product, is_active)
  VALUES (v_org_id, 'AEE-003', 'Televisor LED 55"', 'LG', 'Monitores y Pantallas', 'Televisores', 'raee', 'Aparatos Eléctricos y Electrónicos', true)
  ON CONFLICT (organization_id, sku) DO NOTHING
  RETURNING id INTO v_prod_id;

  IF v_prod_id IS NOT NULL THEN
    INSERT INTO product_pieces (
      product_id, piece_name, packaging_type, is_domiciliary,
      material_class, waste_type, material_detail,
      weight_grams, weight_value, weight_unit,
      category_level1, category_level2, metadata
    ) VALUES (
      v_prod_id, 'Televisor LED 55"', 'primary', false,
      'RAEE', 'non_recyclable', 'Cat.2 Monitores, Pantallas > 100cm²',
      8000, 8.0, 'kg',
      'Cat.2 Monitores, Pantallas y Aparatos con Pantallas > 100cm²',
      'Monitores y pantallas planas',
      '{
        "modelo": "TV55LED",
        "tipoFamilia": "Monitores y Pantallas",
        "añoDeclaracion": 2026,
        "periodoDeclarado": "2025",
        "arbolDecision": "Pantalla > 100 cm²; batería no extraíble → Cat.2",
        "dimensions": {"height": 57.2, "width": 97.3, "depth": 8.5, "diameter": 0, "dimExteriorMayor": 97.3},
        "fuentePeso": 1,
        "tienePilaBateria": true,
        "extraibleUsuario": false,
        "pesoPilaBateriaKg": 0.5,
        "observaciones": "Batería incorporada no extraíble por el usuario. Se declara con el peso del AEE."
      }'::jsonb
    );
    INSERT INTO sales_records (product_id, year, units_sold) VALUES (v_prod_id, 2025, 200000);
    RAISE NOTICE 'AEE-003 insertado: Televisor LED 55"';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AEE-004: Notebook 14"
  -- Cat.2 Monitores, Pantallas y Aparatos con Pantallas > 100cm²
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO products (organization_id, sku, name, brand, category, subcategory, product_type, priority_product, is_active)
  VALUES (v_org_id, 'AEE-004', 'Notebook 14"', 'HP', 'Informática', 'Notebooks', 'raee', 'Aparatos Eléctricos y Electrónicos', true)
  ON CONFLICT (organization_id, sku) DO NOTHING
  RETURNING id INTO v_prod_id;

  IF v_prod_id IS NOT NULL THEN
    INSERT INTO product_pieces (
      product_id, piece_name, packaging_type, is_domiciliary,
      material_class, waste_type, material_detail,
      weight_grams, weight_value, weight_unit,
      category_level1, category_level2, metadata
    ) VALUES (
      v_prod_id, 'Notebook 14"', 'primary', false,
      'RAEE', 'non_recyclable', 'Cat.2 Monitores, Pantallas > 100cm²',
      1500, 1.5, 'kg',
      'Cat.2 Monitores, Pantallas y Aparatos con Pantallas > 100cm²',
      'Monitores y pantallas planas',
      '{
        "modelo": "NB14",
        "tipoFamilia": "Informática",
        "añoDeclaracion": 2026,
        "periodoDeclarado": "2025",
        "arbolDecision": "Pantalla portátil > 100 cm². → Cat.2",
        "dimensions": {"height": 2, "width": 33, "depth": 25, "diameter": 0, "dimExteriorMayor": 33},
        "fuentePeso": 2,
        "tienePilaBateria": true,
        "extraibleUsuario": false,
        "pesoPilaBateriaKg": 0.4,
        "observaciones": "Batería interna no extraíble."
      }'::jsonb
    );
    INSERT INTO sales_records (product_id, year, units_sold) VALUES (v_prod_id, 2025, 6000);
    RAISE NOTICE 'AEE-004 insertado: Notebook 14"';
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- AEE-005: Lámpara LED 12W
  -- Cat.3 Lámparas
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO products (organization_id, sku, name, brand, category, subcategory, product_type, priority_product, is_active)
  VALUES (v_org_id, 'AEE-005', 'Lámpara LED 12W', 'Philips', 'Lámparas', 'Lámparas LED', 'raee', 'Aparatos Eléctricos y Electrónicos', true)
  ON CONFLICT (organization_id, sku) DO NOTHING
  RETURNING id INTO v_prod_id;

  IF v_prod_id IS NOT NULL THEN
    INSERT INTO product_pieces (
      product_id, piece_name, packaging_type, is_domiciliary,
      material_class, waste_type, material_detail,
      weight_grams, weight_value, weight_unit,
      category_level1, category_level2, metadata
    ) VALUES (
      v_prod_id, 'Lámpara LED 12W', 'primary', false,
      'RAEE', 'non_recyclable', 'Cat.3 Lámparas',
      42, 0.042, 'kg',
      'Cat.3 Lámparas',
      'Lámparas LED',
      '{
        "modelo": "LED12W",
        "tipoFamilia": "Lámparas",
        "añoDeclaracion": 2026,
        "periodoDeclarado": "2025",
        "arbolDecision": "No AIT, no pantalla, es lámpara → Cat.3",
        "dimensions": {"height": 0, "width": 0, "depth": 0, "diameter": 5.4, "dimExteriorMayor": 5.4},
        "fuentePeso": 1,
        "tienePilaBateria": false,
        "extraibleUsuario": false,
        "pesoPilaBateriaKg": 0,
        "observaciones": "Producto redondo: usar diámetro."
      }'::jsonb
    );
    INSERT INTO sales_records (product_id, year, units_sold) VALUES (v_prod_id, 2025, 20000);
    RAISE NOTICE 'AEE-005 insertado: Lámpara LED 12W';
  END IF;

  RAISE NOTICE '✅ Seed RAEE completado — 5 productos de EMP-001, período 2025';
END $$;
