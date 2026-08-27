import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { CONTACT_PERSIST_GRAIN_VERSION } from "@/lib/contacts/persist-grain";

export function ContactPersistGrainPolicyCard() {
  return (
    <Card>
      <CardHeader
        title="Contact persist grain"
        description={`${CONTACT_PERSIST_GRAIN_VERSION} · One person, one company_id. Facilities inherit account/parent contacts in the UI. Nothing is inserted yet.`}
      />
      <CardBody className="space-y-3 text-sm text-steel-700">
        <p>
          Attach an ACCEPT contact to FACILITY, ACCOUNT, or the account-group PARENT. A corporate executive is not stored
          on a facility unless the source names that facility.
        </p>
        <Table>
          <THead>
            <Th>Grain</Th>
            <Th>Attach company_id</Th>
            <Th>UI on a related facility</Th>
          </THead>
          <tbody>
            <tr className="border-b border-steel-100">
              <Td>FACILITY</Td>
              <Td>The named facility only</Td>
              <Td>Owned on that facility. Not copied to siblings or parent.</Td>
            </tr>
            <tr className="border-b border-steel-100">
              <Td>ACCOUNT</Td>
              <Td>The group ACCOUNT legal company</Td>
              <Td>Owned on the account page. Inherited (not cloned) on facilities.</Td>
            </tr>
            <tr>
              <Td>ACCOUNT_GROUP_PARENT</Td>
              <Td>Same ACCOUNT company while capturing from a facility</Td>
              <Td>Shown here as inherited from parent. Persist row stays on the parent.</Td>
            </tr>
          </tbody>
        </Table>
        <p>
          Service relevance stays on the person. Optional STP link must match the persist company_id, not a different
          ranked facility row.
        </p>
      </CardBody>
    </Card>
  );
}
