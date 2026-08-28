/**
 * STEP 32.6.4 MCT Wave-1 persist writer (designed in 32.6.3).
 * INSERT into company_service_stp_scores for MCT only when --write is passed.
 * Does not UPDATE/DELETE PCH, ENV, INS, PET, OCM, or LAB rows.
 * Default (no --write) is dry-run only. Do not pass --write in Step 32.6.3.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { buildMctWave1PersistPayload } from "./build-mct-wave1-payload";
import { planMctWave1Persist } from "./mct-wave1-gates";
import { ENV_SERVICE_ID, PCH_EXPECTED_CURRENT_COUNT, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { ENV_EXPECTED_CURRENT_COUNT, INS_SERVICE_ID, INS_WAVE1_EXPECTED_COUNT } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID, LAB_WAVE1_EXPECTED_COUNT } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID, OCM_WAVE1_EXPECTED_COUNT, PET_EXPECTED_CURRENT_COUNT } from "./ocm-wave1-manifest";
import {
  MCT_SERVICE_ID,
  MCT_WAVE1_ACCOUNTS,
  MCT_WAVE1_COMPANY_IDS,
  MCT_WAVE1_EXPECTED_COUNT,
  assertMctWave1ManifestIntegrity,
} from "./mct-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { SERVICE_STP_CURRENT_VIEW, SERVICE_STP_TABLE } from "./persistence-readiness";
import { SERVICE_FIRST_MODEL_VERSION } from "./types";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function timedClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(180_000) }),
    },
  });
}

async function countEq(table: string, column: string, value: string) {
  const supabase = timedClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return { count: error ? null : (count ?? 0), error: error?.message ?? null };
}

async function currentCompanyIds(serviceId: string): Promise<string[]> {
  const supabase = timedClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(SERVICE_STP_CURRENT_VIEW)
      .select("company_id")
      .eq("service_id", serviceId)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    ids.push(...batch.map((row) => String(row.company_id)));
    if (batch.length < 1000) break;
  }
  return ids;
}

function idHash(ids: string[]): string {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex");
}

async function main() {
  loadEnvLocal();
  const write = hasFlag("--write");
  const integrity = assertMctWave1ManifestIntegrity();
  if (!integrity.ok) throw new Error(integrity.errors.join(" | "));
  const scoredAt = new Date().toISOString();
  const { service, payload, mctUniverseEligible, mctUniverse } = await buildMctWave1PersistPayload(scoredAt);
  const pchBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  const envBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  const insBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  const petBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PET_SERVICE_ID);
  const ocmBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", OCM_SERVICE_ID);
  const labBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", LAB_SERVICE_ID);
  const mctBefore = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", MCT_SERVICE_ID);
  const mctIds = await currentCompanyIds(MCT_SERVICE_ID);
  const pchIdsBefore = await currentCompanyIds(PCH_SERVICE_ID);
  const envIdsBefore = await currentCompanyIds(ENV_SERVICE_ID);
  const insIdsBefore = await currentCompanyIds(INS_SERVICE_ID);
  const petIdsBefore = await currentCompanyIds(PET_SERVICE_ID);
  const ocmIdsBefore = await currentCompanyIds(OCM_SERVICE_ID);
  const labIdsBefore = await currentCompanyIds(LAB_SERVICE_ID);
  const hashesBefore = {
    pch: idHash(pchIdsBefore),
    env: idHash(envIdsBefore),
    ins: idHash(insIdsBefore),
    pet: idHash(petIdsBefore),
    ocm: idHash(ocmIdsBefore),
    lab: idHash(labIdsBefore),
  };
  const plan = planMctWave1Persist({
    pchCurrentCount: pchBefore.count,
    envCurrentCount: envBefore.count,
    insCurrentCount: insBefore.count,
    petCurrentCount: petBefore.count,
    ocmCurrentCount: ocmBefore.count,
    labCurrentCount: labBefore.count,
    mctCurrentCount: mctBefore.count,
    mctCurrentCompanyIds: mctIds,
    payload,
  });

  let written = 0;
  let writeError: string | null = null;
  let rolledBack = false;
  if (write) {
    if (!plan.ok || plan.action === "abort") {
      writeError = plan.errors.join(" | ");
    } else if (plan.action === "insert") {
      const chunkSize = 5;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await timedClient().from(SERVICE_STP_TABLE).insert(chunk);
        if (error) {
          writeError = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
          break;
        }
        written += chunk.length;
      }
    }
  }

  let pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
  let envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
  let insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
  let petAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PET_SERVICE_ID);
  let ocmAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", OCM_SERVICE_ID);
  let labAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", LAB_SERVICE_ID);
  let mctAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", MCT_SERVICE_ID);
  const mctIdsAfter = write ? await currentCompanyIds(MCT_SERVICE_ID) : mctIds;
  const hashesAfter = {
    pch: idHash(write ? await currentCompanyIds(PCH_SERVICE_ID) : pchIdsBefore),
    env: idHash(write ? await currentCompanyIds(ENV_SERVICE_ID) : envIdsBefore),
    ins: idHash(write ? await currentCompanyIds(INS_SERVICE_ID) : insIdsBefore),
    pet: idHash(write ? await currentCompanyIds(PET_SERVICE_ID) : petIdsBefore),
    ocm: idHash(write ? await currentCompanyIds(OCM_SERVICE_ID) : ocmIdsBefore),
    lab: idHash(write ? await currentCompanyIds(LAB_SERVICE_ID) : labIdsBefore),
  };
  const otherServicesUnchanged =
    hashesBefore.pch === hashesAfter.pch &&
    hashesBefore.env === hashesAfter.env &&
    hashesBefore.ins === hashesAfter.ins &&
    hashesBefore.pet === hashesAfter.pet &&
    hashesBefore.ocm === hashesAfter.ocm &&
    hashesBefore.lab === hashesAfter.lab;
  const unexpectedMct = mctIdsAfter.filter((id) => !MCT_WAVE1_COMPANY_IDS.includes(id));
  const missingMct = MCT_WAVE1_COMPANY_IDS.filter((id) => !mctIdsAfter.includes(id));
  let pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
  let envSafe = envAfter.count === ENV_EXPECTED_CURRENT_COUNT;
  let insSafe = insAfter.count === INS_WAVE1_EXPECTED_COUNT;
  let petSafe = petAfter.count === PET_EXPECTED_CURRENT_COUNT;
  let ocmSafe = ocmAfter.count === OCM_WAVE1_EXPECTED_COUNT;
  let labSafe = labAfter.count === LAB_WAVE1_EXPECTED_COUNT;
  const mctOk =
    mctAfter.count === (write && plan.action === "insert" && !writeError ? MCT_WAVE1_EXPECTED_COUNT : mctBefore.count) &&
    unexpectedMct.length === 0 &&
    (write && plan.action === "insert" && !writeError ? missingMct.length === 0 : true);

  if (
    write &&
    plan.action === "insert" &&
    written > 0 &&
    (!pchSafe || !envSafe || !insSafe || !petSafe || !ocmSafe || !labSafe || !mctOk)
  ) {
    const { error: rollbackError } = await timedClient()
      .from(SERVICE_STP_TABLE)
      .delete()
      .eq("service_id", MCT_SERVICE_ID)
      .in("company_id", [...MCT_WAVE1_COMPANY_IDS]);
    rolledBack = !rollbackError;
    writeError = [
      writeError,
      `MCT persist verification failed (PCH ${pchAfter.count} ENV ${envAfter.count} INS ${insAfter.count} PET ${petAfter.count} OCM ${ocmAfter.count} LAB ${labAfter.count} MCT ${mctAfter.count}); rollback ${rolledBack ? "ok" : rollbackError?.message}`,
    ]
      .filter(Boolean)
      .join(" | ");
    pchAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PCH_SERVICE_ID);
    envAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", ENV_SERVICE_ID);
    insAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", INS_SERVICE_ID);
    petAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", PET_SERVICE_ID);
    ocmAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", OCM_SERVICE_ID);
    labAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", LAB_SERVICE_ID);
    mctAfter = await countEq(SERVICE_STP_CURRENT_VIEW, "service_id", MCT_SERVICE_ID);
    pchSafe = pchAfter.count === PCH_EXPECTED_CURRENT_COUNT;
    envSafe = envAfter.count === ENV_EXPECTED_CURRENT_COUNT;
    insSafe = insAfter.count === INS_WAVE1_EXPECTED_COUNT;
    petSafe = petAfter.count === PET_EXPECTED_CURRENT_COUNT;
    ocmSafe = ocmAfter.count === OCM_WAVE1_EXPECTED_COUNT;
    labSafe = labAfter.count === LAB_WAVE1_EXPECTED_COUNT;
  }

  const report = {
    step: write ? "32.6.4" : "32.6.3",
    writeFlag: write,
    wrote: Boolean(write && !writeError && (plan.action === "noop" || written === MCT_WAVE1_EXPECTED_COUNT)),
    persisted: write && !writeError && (plan.action === "noop" || written === MCT_WAVE1_EXPECTED_COUNT),
    idempotentNoop: plan.action === "noop",
    modelVersion: SERVICE_FIRST_MODEL_VERSION,
    mctService: service,
    mctUniverse,
    mctUniverseEligible,
    payloadRows: payload.length,
    expectedMctRowsAfterFuturePersist: MCT_WAVE1_EXPECTED_COUNT,
    plan,
    written,
    rolledBack,
    writeError,
    hashesBefore,
    hashesAfter,
    otherServicesUnchanged,
    pchBefore: pchBefore.count,
    envBefore: envBefore.count,
    insBefore: insBefore.count,
    petBefore: petBefore.count,
    ocmBefore: ocmBefore.count,
    labBefore: labBefore.count,
    mctBefore: mctBefore.count,
    pchAfter: pchAfter.count,
    envAfter: envAfter.count,
    insAfter: insAfter.count,
    petAfter: petAfter.count,
    ocmAfter: ocmAfter.count,
    labAfter: labAfter.count,
    mctAfter: mctAfter.count,
    pchProtected: pchSafe,
    envProtected: envSafe,
    insProtected: insSafe,
    petProtected: petSafe,
    ocmProtected: ocmSafe,
    labProtected: labSafe,
    petroRabigh:
      "Refining and Polymer both remain frozen Wave-1 company_ids. Persist uses facility-scoped account_group_key so both can be current MCT representatives.",
    rows: payload.map((row, index) => {
      const frozen = MCT_WAVE1_ACCOUNTS[index];
      return {
        rank: frozen.rank,
        account: frozen.companyName,
        company_id: row.company_id,
        facility: frozen.entityGrain,
        location: frozen.locationLabel,
        industry: frozen.industry,
        subsector: frozen.subsector,
        useCase: frozen.useCase,
        primaryApp: frozen.primaryApp,
        overlap: frozen.overlap,
        eligibility: row.eligibility,
        application_fit: row.application_fit,
        commercial_score: row.commercial_score,
        data_confidence_band: row.data_confidence_band,
        data_confidence_score: row.data_confidence_score,
        tier: row.tier,
        ranking_eligible: row.ranking_eligible,
        entity_type: row.entity_type,
        account_group_key: row.account_group_key,
        service_id: row.service_id,
        positioning_statement: row.positioning_statement,
        recommended_contact_roles: row.recommended_contact_roles,
        recommended_departments: row.recommended_departments,
        targeting_reason: row.targeting_reason,
        validationSource: frozen.validationSource,
      };
    }),
  };
  if (!write) {
    writeFileSync("mct-32-6-3-design-out.json", JSON.stringify(report, null, 2), "utf8");
  } else {
    writeFileSync("mct-32-6-4-persist-out.json", JSON.stringify(report, null, 2), "utf8");
  }
  console.log(JSON.stringify(report, null, 2));

  if (!plan.ok || (write && writeError) || !pchSafe || !envSafe || !insSafe || !petSafe || !ocmSafe || !labSafe) {
    process.exitCode = 1;
  }
  if (write && !otherServicesUnchanged) process.exitCode = 1;
  if (write && !writeError && plan.action === "insert" && written !== MCT_WAVE1_EXPECTED_COUNT) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
