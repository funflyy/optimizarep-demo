-- Mapeos completos para todos los materialDetail de las piezas existentes
-- Hacia ReSimple y Giro

DELETE FROM tariff_mappings;

-- ReSimple mappings
INSERT INTO tariff_mappings (organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id, is_manual, created_at, updated_at)
SELECT 
  o.id, ms.id, m.mat, 'Domiciliario', false, false, tc.id, false, NOW(), NOW()
FROM 
  (VALUES ('PET'), ('HDPE'), ('PP Rígido'), ('LDPE'), ('PS'), ('PVC'), ('Otros Plásticos'), ('Lámina de aluminio'), ('Papel/PET')) AS m(mat),
  (SELECT id FROM organizations LIMIT 1) o,
  management_systems ms,
  tariff_categories tc
WHERE ms.name = 'ReSimple'
  AND tc.system_id = ms.id
  AND tc.lookup_key = CASE m.mat
    WHEN 'PET' THEN 'Domiciliario|Botellas PET|Sin Grasa'
    WHEN 'HDPE' THEN 'Domiciliario|PEAD rígido|Sin Grasa'
    WHEN 'PP Rígido' THEN 'Domiciliario|PP sin grasa|Normal'
    WHEN 'LDPE' THEN 'Domiciliario|PEBD sin grasa|Normal'
    WHEN 'PS' THEN 'Domiciliario|PS sin grasa|Normal'
    WHEN 'PVC' THEN 'Domiciliario|PVC|Normal'
    WHEN 'Otros Plásticos' THEN 'Domiciliario|Otros|Normal'
    WHEN 'Lámina de aluminio' THEN 'Domiciliario|Aluminio (latas)|Normal'
    WHEN 'Papel/PET' THEN 'Domiciliario|Otro Papel Compuesto|Normal'
  END
ON CONFLICT DO NOTHING;

-- Giro mappings
INSERT INTO tariff_mappings (organization_id, system_id, material_detail, segment, has_grease, is_hazardous, tariff_category_id, is_manual, created_at, updated_at)
SELECT 
  o.id, ms.id, m.mat, 'Domiciliario', false, false, tc.id, false, NOW(), NOW()
FROM 
  (VALUES ('PET'), ('HDPE'), ('PP Rígido'), ('LDPE'), ('PS'), ('PVC'), ('Otros Plásticos'), ('Lámina de aluminio'), ('Papel/PET')) AS m(mat),
  (SELECT id FROM organizations LIMIT 1) o,
  management_systems ms,
  tariff_categories tc
WHERE ms.name = 'Giro'
  AND tc.system_id = ms.id
  AND tc.lookup_key = CASE m.mat
    WHEN 'PET' THEN 'Domiciliario|Botellas PET|Sin Grasa'
    WHEN 'HDPE' THEN 'Domiciliario|PEAD rígido|Sin Grasa'
    WHEN 'PP Rígido' THEN 'Domiciliario|PP rígido|Sin Grasa'
    WHEN 'LDPE' THEN 'Domiciliario|PEBD flexible|Sin Grasa'
    WHEN 'PS' THEN 'Domiciliario|PS rígido|Sin Grasa'
    WHEN 'PVC' THEN 'Domiciliario|PVC rígido|Sin Grasa'
    WHEN 'Otros Plásticos' THEN 'Domiciliario|Plástico 7|Sin Grasa'
    WHEN 'Lámina de aluminio' THEN 'Domiciliario|Aluminio (Latas)|Sin Grasa'
    WHEN 'Papel/PET' THEN 'Domiciliario|Otro Papel Compuesto|Sin Grasa'
  END
ON CONFLICT DO NOTHING;

SELECT COUNT(*) as total_mappings FROM tariff_mappings;
