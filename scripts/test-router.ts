async function run() {
  const url = "http://localhost:3000/api/trpc/costs.summary?input=" + encodeURIComponent(JSON.stringify({
    "json": {
      "productType": "envases_embalajes"
    }
  }));

  console.log("Fetching:", url);
  try {
    const res = await fetch(url);
    const data = await res.text();
    console.log("Status:", res.status);
    console.log("Data:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
