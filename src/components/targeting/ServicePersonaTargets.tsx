import { Table, THead, Th, Td } from "@/components/ui/Table";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { personasForService } from "@/lib/contacts/service-persona-map";

export function ServicePersonaTargets({ serviceCode }: { serviceCode: string }) {
  const rows = [...personasForService(serviceCode)].sort(
    (a, b) => a.priority - b.priority || b.relevanceScore - a.relevanceScore,
  );
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Contact targets"
          description="Department and job-function personas for this service. Not named people."
        />
        <CardBody>
          <p className="text-sm text-steel-500">
            {serviceCode.toUpperCase()} personas are NOT CONFIGURED. PCH is the validated contact-persona reference. No
            named people are invented.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Contact targets"
        description={`${serviceCode} department → job function personas. These are roles to find, not stored contacts.`}
      />
      <CardBody className="overflow-x-auto">
        <Table>
          <THead>
            <Th>Priority</Th>
            <Th>Department</Th>
            <Th>Job function</Th>
            <Th>Buying role</Th>
            <Th>Relevance</Th>
          </THead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.departmentName}-${row.jobFunctionCode}`} className="border-b border-steel-100 last:border-0 align-top">
                <Td className="font-semibold">{row.priority}</Td>
                <Td>{row.departmentName}</Td>
                <Td className="whitespace-normal">
                  <p>{row.jobFunctionName}</p>
                  <p className="text-xs text-steel-500">{row.relevanceReason}</p>
                </Td>
                <Td>{row.buyingRole}</Td>
                <Td>{row.relevanceScore}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}
