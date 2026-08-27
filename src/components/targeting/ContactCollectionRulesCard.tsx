import { Table, THead, Th, Td } from "@/components/ui/Table";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  CONTACT_COLLECTION_METHOD,
  CONTACT_COLLECTION_RULES_VERSION,
  CONTACT_SOURCE_RULES,
} from "@/lib/contacts/collection-rules";

export function ContactCollectionRulesCard() {
  const rows = [...CONTACT_SOURCE_RULES].sort((a, b) => a.collectionPriority - b.collectionPriority);
  return (
    <Card>
      <CardHeader
        title="Contact collection rules"
        description={`${CONTACT_COLLECTION_RULES_VERSION} · ${CONTACT_COLLECTION_METHOD} Persist only ACCEPT candidates via the controlled writer.`}
      />
      <CardBody className="space-y-3">
        <p className="text-sm text-steel-700">
          Accept a person only from a reliable public source that names them in a current role at this ranked company
          and maps to a PCH department / job function. Do not invent names, emails, or phones.
        </p>
        <Table>
          <THead>
            <Th>Priority</Th>
            <Th>Source</Th>
            <Th>Tier</Th>
            <Th>Persist</Th>
            <Th>Verified alone</Th>
          </THead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.evidenceType} className="border-b border-steel-100 last:border-0">
                <Td>{row.collectionPriority}</Td>
                <Td>{row.evidenceType}</Td>
                <Td>{row.tier}</Td>
                <Td>{row.persistAllowed ? "Yes" : "No"}</Td>
                <Td>{row.canSupportVerifiedAlone ? "Yes" : "No"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}
