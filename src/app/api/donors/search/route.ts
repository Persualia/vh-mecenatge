import { connection, type NextRequest } from "next/server";
import { container } from "@/tracking/infrastructure/container";
import { errorResponse } from "../../error-response";

/**
 * The refs of the records made with an e-mail. A POST, so the address stays out of URLs and
 * access logs; the answer carries refs only.
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    return Response.json({ refs: await container().searchDonorsByEmail.execute(body?.email, new Date().toISOString().slice(0, 10)) });
  } catch (error) {
    return errorResponse(error);
  }
}
