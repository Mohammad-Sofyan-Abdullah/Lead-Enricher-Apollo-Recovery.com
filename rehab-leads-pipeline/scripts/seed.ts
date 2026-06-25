import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const SCRIPTS_DIR = path.resolve(process.cwd(), "scripts");
const SAMPLE_FILE = path.join(SCRIPTS_DIR, "sample_centers.csv");
const OUTPUT_FILE = path.join(SCRIPTS_DIR, "seed_output.csv");

const isClean = process.argv.includes("--clean");

async function main() {
  // Step 1: Read sample centers
  if (!fs.existsSync(SAMPLE_FILE)) {
    console.error(`Sample file not found: ${SAMPLE_FILE}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(SAMPLE_FILE, "utf-8");
  const dataLines = rawText.split("\n").filter((l) => l.trim() && !l.startsWith("name\t"));
  console.log(`=== SEED: Parsed ${dataLines.length} centers ===`);

  // Step 2: Create batch
  const label = `Seed Test ${new Date().toISOString()}`;
  console.log(`\nCreating batch: ${label}`);

  const createRes = await fetch(`${BASE_URL}/api/batches/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, rawText }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({ detail: createRes.statusText }));
    console.error("Batch create failed:", JSON.stringify(err, null, 2));
    process.exit(1);
  }

  const createData = await createRes.json() as {
    batchId: string;
    summary: {
      total: number;
      valid: number;
      skipped: number;
      noWebsite: number;
      skipReasons: Record<string, number>;
    };
  };

  const { batchId, summary } = createData;
  console.log("\nBatch summary:");
  console.log(`  Total:     ${summary.total}`);
  console.log(`  Valid:     ${summary.valid}`);
  console.log(`  Skipped:   ${summary.skipped}`);
  console.log(`  No website:${summary.noWebsite}`);
  if (Object.keys(summary.skipReasons).length > 0) {
    console.log("  Skip reasons:", summary.skipReasons);
  }
  console.log(`  Batch ID:  ${batchId}`);

  // Step 3: Enrich
  console.log(`\nEnriching batch ${batchId}...`);

  const enrichRes = await fetch(`${BASE_URL}/api/batches/${batchId}/enrich`, {
    method: "POST",
  });

  if (!enrichRes.ok) {
    const err = await enrichRes.json().catch(() => ({ detail: enrichRes.statusText }));
    console.error("Enrich failed:", JSON.stringify(err, null, 2));
    if (isClean) await cleanupBatch(batchId);
    process.exit(1);
  }

  const enrichData = await enrichRes.json() as {
    enriched: number;
    notFound: number;
    skipped: number;
    discarded: number;
    duplicates: number;
  };

  console.log("\nEnrich result:");
  console.log(`  Enriched:  ${enrichData.enriched}`);
  console.log(`  Not found: ${enrichData.notFound}`);
  console.log(`  Skipped:   ${enrichData.skipped}`);
  console.log(`  Discarded: ${enrichData.discarded}`);
  console.log(`  Duplicates:${enrichData.duplicates}`);

  // Step 4: Export CSV
  console.log(`\nExporting CSV...`);

  const exportRes = await fetch(`${BASE_URL}/api/batches/${batchId}/export?format=csv`);

  if (!exportRes.ok) {
    const err = await exportRes.text();
    console.error("Export failed:", err);
    if (isClean) await cleanupBatch(batchId);
    process.exit(1);
  }

  const csvContent = await exportRes.text();
  fs.writeFileSync(OUTPUT_FILE, csvContent, "utf-8");
  const rowCount = csvContent.split("\n").filter((l) => l.trim()).length - 1;
  console.log(`  Saved ${rowCount} leads to scripts/seed_output.csv`);

  // Step 5: Clean up if requested
  if (isClean) {
    await cleanupBatch(batchId);
  }

  console.log(`\n=== SEED COMPLETE: output saved to scripts/seed_output.csv ===`);
}

async function cleanupBatch(batchId: string) {
  console.log(`\nCleaning up batch ${batchId}...`);
  const deleteRes = await fetch(`${BASE_URL}/api/batches/${batchId}`, {
    method: "DELETE",
  });
  if (!deleteRes.ok) {
    const err = await deleteRes.json().catch(() => ({ detail: deleteRes.statusText }));
    console.error("Delete failed:", JSON.stringify(err, null, 2));
  } else {
    console.log("Batch deleted.");
  }
}

main().catch((err) => {
  console.error("\nSeed script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
