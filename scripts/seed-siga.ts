import { db } from "@/server/db";
import { managementSystems, tariffCategories, tariffs } from "@/server/db/schema";

async function main() {
  const ppId = "777b2d39-68d9-4791-af47-3c4fac4b76a4";

  const [sys] = await db.insert(managementSystems).values({
    name: "SIGA",
    priorityProduct: "Neumáticos",
    priorityProductId: ppId,
    hasDomiciliary: false,
    hasNonDomiciliary: true,
    observations: "Tarifa única CLP/kg",
    isActive: true,
  }).returning();

  console.log("Created system:", sys.id, sys.name);

  const [cat] = await db.insert(tariffCategories).values({
    systemId: sys.id,
    segment: "Único",
    material: "Neumáticos",
    subcategory: "Tarifa única por kilo",
    tariffType: "Normal",
    lookupKey: "Único|Neumáticos|Normal",
  }).returning();

  console.log("Created category:", cat.id);

  const [tariff] = await db.insert(tariffs).values({
    categoryId: cat.id,
    year: 2026,
    rateUfPerTon: "0",
    rateValue: "260",
    rateUnit: "CLP/kg",
    plusIva: true,
  }).returning();

  console.log("Created tariff:", tariff.id, "260 CLP/kg +IVA");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
