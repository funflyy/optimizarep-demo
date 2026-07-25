-- seed-raee-tariffs.sql
-- Crea categorías de tarifa, tarifas y mapeos para RAEE
-- Usa los SIGs existentes (ReSimple, Giro)

DO $$
DECLARE
  v_rs  UUID; -- ReSimple
  v_gi  UUID; -- Giro
  v_cat UUID;
  v_org UUID;
BEGIN
  SELECT id INTO v_rs  FROM management_systems WHERE name = 'ReSimple';
  SELECT id INTO v_gi  FROM management_systems WHERE name = 'Giro';
  SELECT id INTO v_org FROM organizations LIMIT 1;

  -- ── Cat.1 Aparatos de Intercambio de Temperatura ──

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_rs, 'No Domiciliario', 'RAEE', 'Cat.1 AIT', 'Normal', 'NoDom|Cat1AIT|RS')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 18.5), (gen_random_uuid(), v_cat, 2025, 19.2), (gen_random_uuid(), v_cat, 2026, 20.0);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_rs, 'Cat.1 Aparatos de Intercambio de Temperatura', 'No Domiciliario', false, false, v_cat);

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_gi, 'No Domiciliario', 'RAEE', 'Cat.1 AIT', 'Normal', 'NoDom|Cat1AIT|Gi')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 20.1), (gen_random_uuid(), v_cat, 2025, 20.8), (gen_random_uuid(), v_cat, 2026, 21.5);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_gi, 'Cat.1 Aparatos de Intercambio de Temperatura', 'No Domiciliario', false, false, v_cat);

  -- ── Cat.2 Monitores, Pantallas > 100cm² ──

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_rs, 'No Domiciliario', 'RAEE', 'Cat.2 Monitores', 'Normal', 'NoDom|Cat2Mon|RS')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 15.0), (gen_random_uuid(), v_cat, 2025, 15.8), (gen_random_uuid(), v_cat, 2026, 16.5);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_rs, 'Cat.2 Monitores, Pantallas > 100cm²', 'No Domiciliario', false, false, v_cat);

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_gi, 'No Domiciliario', 'RAEE', 'Cat.2 Monitores', 'Normal', 'NoDom|Cat2Mon|Gi')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 16.2), (gen_random_uuid(), v_cat, 2025, 17.0), (gen_random_uuid(), v_cat, 2026, 17.8);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_gi, 'Cat.2 Monitores, Pantallas > 100cm²', 'No Domiciliario', false, false, v_cat);

  -- ── Cat.3 Lámparas ──

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_rs, 'No Domiciliario', 'RAEE', 'Cat.3 Lámparas', 'Normal', 'NoDom|Cat3Lamp|RS')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 45.0), (gen_random_uuid(), v_cat, 2025, 47.0), (gen_random_uuid(), v_cat, 2026, 49.0);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_rs, 'Cat.3 Lámparas', 'No Domiciliario', false, false, v_cat);

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_gi, 'No Domiciliario', 'RAEE', 'Cat.3 Lámparas', 'Normal', 'NoDom|Cat3Lamp|Gi')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 48.0), (gen_random_uuid(), v_cat, 2025, 50.0), (gen_random_uuid(), v_cat, 2026, 52.0);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_gi, 'Cat.3 Lámparas', 'No Domiciliario', false, false, v_cat);

  -- ── Cat.6 Pequeños Aparatos ──

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_rs, 'No Domiciliario', 'RAEE', 'Cat.6 Pequeños', 'Normal', 'NoDom|Cat6Peq|RS')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 12.0), (gen_random_uuid(), v_cat, 2025, 12.5), (gen_random_uuid(), v_cat, 2026, 13.0);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_rs, 'Cat.6 Pequeños Aparatos', 'No Domiciliario', false, false, v_cat);

  INSERT INTO tariff_categories (id, system_id, segment, material, subcategory, tariff_type, lookup_key)
  VALUES (gen_random_uuid(), v_gi, 'No Domiciliario', 'RAEE', 'Cat.6 Pequeños', 'Normal', 'NoDom|Cat6Peq|Gi')
  RETURNING id INTO v_cat;
  INSERT INTO tariffs VALUES (gen_random_uuid(), v_cat, 2024, 13.5), (gen_random_uuid(), v_cat, 2025, 14.0), (gen_random_uuid(), v_cat, 2026, 14.5);
  INSERT INTO tariff_mappings (id, organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id)
  VALUES (gen_random_uuid(), v_org, v_gi, 'Cat.6 Pequeños Aparatos', 'No Domiciliario', false, false, v_cat);

  RAISE NOTICE '✅ RAEE tariff categories, tariffs and mappings created';
END $$;
