/**
 * STEP 7.8 grain policy self-test. Petro Rabigh case. Does not insert contacts.
 */
import { resolveContactPersistGrain, visibleContactsForCompany, type AccountGroupMember } from "./persist-grain";

const ACCOUNT_ID = "039f7219-431b-4467-9a89-9cdc89b1e226";
const POLYMER_ID = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
const REFINING_ID = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";

const GROUP: AccountGroupMember[] = [
  {
    companyId: ACCOUNT_ID,
    companyName: "Rabigh Refining and Petrochemical Company",
    legalName: "Rabigh Refining and Petrochemical Company",
    entityType: "ACCOUNT",
  },
  {
    companyId: POLYMER_ID,
    companyName: "Petro Rabigh Polymer Operations",
    legalName: "Rabigh Refining and Petrochemical Company (Petro Rabigh)",
    entityType: "FACILITY",
  },
  {
    companyId: REFINING_ID,
    companyName: "Petro Rabigh Refining Operations",
    legalName: "Rabigh Refining and Petrochemical Company (Petro Rabigh)",
    entityType: "FACILITY",
  },
];

export function runPersistGrainSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];

  const corporate = resolveContactPersistGrain({
    captureCompanyId: POLYMER_ID,
    captureCompanyName: "Petro Rabigh Polymer Operations",
    captureEntityType: "FACILITY",
    accountGroupKey: "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226",
    groupMembers: GROUP,
    companyNameOnSource: "Petro Rabigh",
    jobTitle: "Vice President of Engineering and Support",
    evidenceNotes: "Official Executive Management profile. Appointed January 2024 as current role.",
    sourceUrl: "https://www.petrorabigh.com/en/AboutPRC/BoardAndExecutiveManagement/ExecutiveManagement/Pages/Fahad%20AlTherwi.aspx",
    facilityRelationshipProven: false,
  });
  if (!corporate.persistAllowed) failures.push("7.7 corporate VP should be persist-allowed on parent");
  if (corporate.grain !== "ACCOUNT_GROUP_PARENT") failures.push(`expected ACCOUNT_GROUP_PARENT, got ${corporate.grain}`);
  if (corporate.persistCompanyId !== ACCOUNT_ID) failures.push("corporate VP must attach to ACCOUNT parent, not polymer facility");
  if (corporate.displayOnCaptureAs !== "INHERITED_FROM_ACCOUNT") {
    failures.push(`expected inherited display, got ${corporate.displayOnCaptureAs}`);
  }

  const facilityNamed = resolveContactPersistGrain({
    captureCompanyId: POLYMER_ID,
    captureCompanyName: "Petro Rabigh Polymer Operations",
    captureEntityType: "FACILITY",
    accountGroupKey: "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226",
    groupMembers: GROUP,
    companyNameOnSource: "Petro Rabigh Polymer Operations",
    jobTitle: "Laboratory Supervisor",
    evidenceNotes: "Page names Petro Rabigh Polymer Operations laboratory.",
    sourceUrl: "https://www.petrorabigh.com/example-facility-page",
    facilityRelationshipProven: true,
  });
  if (facilityNamed.grain !== "FACILITY" || facilityNamed.persistCompanyId !== POLYMER_ID) {
    failures.push(`facility-named person must attach to polymer facility, got ${facilityNamed.grain} ${facilityNamed.persistCompanyId}`);
  }

  const visible = visibleContactsForCompany(POLYMER_ID, GROUP, [
    { id: "c-parent", companyId: ACCOUNT_ID, fullName: "Parent Person" },
    { id: "c-poly", companyId: POLYMER_ID, fullName: "Facility Person" },
    { id: "c-ref", companyId: REFINING_ID, fullName: "Other Facility Person" },
  ]);
  const ids = visible.map((row) => row.id).sort();
  if (ids.join() !== "c-parent,c-poly") failures.push(`inherit should show parent+own, not sibling: ${ids.join()}`);
  const inherited = visible.find((row) => row.id === "c-parent");
  if (inherited?.displayMode !== "INHERITED_FROM_ACCOUNT") failures.push("parent contact must be inherited, not cloned");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-step-78-self-test")) {
  const result = runPersistGrainSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
