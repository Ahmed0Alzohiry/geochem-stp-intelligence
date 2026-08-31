import { NextResponse } from "next/server";
import { promoteDiscoveryToCurrent } from "@/lib/stp/run-full-database-targeting";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      service?: string;
      companyIds?: string[];
      allEligible?: boolean;
    };
    const result = await promoteDiscoveryToCurrent({
      serviceCode: body.service ?? "",
      companyIds: body.companyIds ?? [],
      allEligible: Boolean(body.allEligible),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to promote" }, { status: 500 });
  }
}
