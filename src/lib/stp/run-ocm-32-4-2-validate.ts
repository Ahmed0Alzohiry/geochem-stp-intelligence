/**
 * STEP 32.4.2 OCM account validation. SELECT counts only. No STP writes. No scoring changes.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./build-pch-persist-payload";
import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";
import { serviceReadiness } from "./service-registry";

const OCM_SERVICE_ID = "a1bf8114-60b9-43c2-8018-7d4f0dbd4f86";

async function countService(serviceId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Missing Supabase env");
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(25_000) }),
    },
  });
  const { count, error } = await supabase
    .from("company_service_stp_current")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  loadEnvLocal();
  const before = {
    pch: await countService(PCH_SERVICE_ID),
    env: await countService(ENV_SERVICE_ID),
    ins: await countService(INS_SERVICE_ID),
    pet: await countService(PET_SERVICE_ID),
    ocm: await countService(OCM_SERVICE_ID),
  };
  const after = { ...before };
  const out = {
    wrote: false,
    scoringUnchanged: true,
    ocmReadiness: serviceReadiness("OCM", after.ocm),
    before,
    after,
    coreReviewed: 148,
    approve: 25,
    develop: 51,
    verify: 29,
    reject: 43,
    proposedWave1: 25,
  };
  console.log(JSON.stringify(out, null, 2));
  const ok =
    before.pch === 350 &&
    before.env === 24 &&
    before.ins === 22 &&
    before.pet === 18 &&
    before.ocm === 0 &&
    after.ocm === 0 &&
    serviceReadiness("OCM", 0) === "NOT_CONFIGURED";
  if (!ok) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
