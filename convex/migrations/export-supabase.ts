/**
 * Supabase Data Export Script
 *
 * Exports data from Supabase PostgreSQL for migration to Convex.
 * Run with: npx ts-node convex/migrations/export-supabase.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const OUTPUT_DIR = path.join(__dirname, "exports");

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Tables to export
const TABLES_TO_EXPORT = [
  // Core tables
  "users",
  "cards",
  "crypto_wallets",
  "wallet_sessions",

  // Transaction tables
  "authorization_transactions",
  "authorization_holds",
  "funding_transactions",
  "crypto_transactions",

  // Fraud & Security
  "fraud_events",
  "fraud_detection_logs",

  // DeFi
  "defi_positions",

  // Compliance
  "kyc_records",
  "compliance_events",

  // Rates
  "crypto_rates",

  // Card details
  "visa_card_details",
];

interface ExportResult {
  table: string;
  count: number;
  success: boolean;
  error?: string;
}

/**
 * Export a single table
 */
async function exportTable(tableName: string): Promise<ExportResult> {
  console.log(`Exporting ${tableName}...`);

  try {
    // Fetch all data from table
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return {
        table: tableName,
        count: 0,
        success: false,
        error: error.message,
      };
    }

    // Write to JSON file
    const outputPath = path.join(OUTPUT_DIR, `${tableName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`  Exported ${data?.length || 0} records to ${outputPath}`);

    return {
      table: tableName,
      count: data?.length || 0,
      success: true,
    };
  } catch (err) {
    return {
      table: tableName,
      count: 0,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Export relationship data (foreign keys)
 */
async function exportRelationships(): Promise<void> {
  console.log("\nExporting relationships...");

  // User -> Cards relationship
  const { data: userCards } = await supabase
    .from("cards")
    .select("id, user_id, card_id")
    .order("user_id");

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_rel_user_cards.json"),
    JSON.stringify(userCards, null, 2)
  );

  // User -> Wallets relationship
  const { data: userWallets } = await supabase
    .from("crypto_wallets")
    .select("id, user_id, wallet_id")
    .order("user_id");

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_rel_user_wallets.json"),
    JSON.stringify(userWallets, null, 2)
  );

  // Card -> Authorizations relationship
  const { data: cardAuths } = await supabase
    .from("authorization_transactions")
    .select("authorization_id, card_context")
    .order("card_context");

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_rel_card_auths.json"),
    JSON.stringify(cardAuths, null, 2)
  );

  console.log("  Relationships exported");
}

/**
 * Export metadata for migration verification
 */
async function exportMetadata(): Promise<void> {
  console.log("\nExporting metadata...");

  const metadata: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    tables: {},
  };

  // Get row counts for all tables
  for (const table of TABLES_TO_EXPORT) {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    metadata.tables[table] = { count };
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "_metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  console.log("  Metadata exported");
}

/**
 * Main export function
 */
async function main(): Promise<void> {
  console.log("=== Supabase Data Export ===\n");
  console.log(`Source: ${SUPABASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Export all tables
  const results: ExportResult[] = [];
  for (const table of TABLES_TO_EXPORT) {
    const result = await exportTable(table);
    results.push(result);
  }

  // Export relationships
  await exportRelationships();

  // Export metadata
  await exportMetadata();

  // Print summary
  console.log("\n=== Export Summary ===\n");
  let totalRecords = 0;
  let failedTables = 0;

  for (const result of results) {
    const status = result.success ? "OK" : "FAILED";
    console.log(`${result.table}: ${result.count} records [${status}]`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.success) {
      totalRecords += result.count;
    } else {
      failedTables++;
    }
  }

  console.log(`\nTotal: ${totalRecords} records exported`);
  if (failedTables > 0) {
    console.log(`Warning: ${failedTables} tables failed to export`);
  }

  console.log("\nExport complete. Run transform-data.ts next.");
}

// Run export
main().catch(console.error);
