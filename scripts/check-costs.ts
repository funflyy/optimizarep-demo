import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/optimizarep";
const sql = postgres(DATABASE_URL);

async function check() {
  const sr = await sql`
    SELECT year, count(*)
    FROM sales_records
    GROUP BY year
  `;
  console.log("Sales Records:");
  console.log(sr);
  
  const tr = await sql`
    SELECT year, count(*)
    FROM tariffs
    GROUP BY year
  `;
  console.log("Tariffs:");
  console.log(tr);
  
  process.exit(0);
}

check();

check();
