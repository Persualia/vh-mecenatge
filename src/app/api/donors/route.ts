import { connection, type NextRequest } from "next/server";
import { container } from "@/tracking/infrastructure/container";
import { errorResponse } from "../error-response";

/** Saves one record's hand corrections and returns every correction, so the board can redraw. */
export async function PUT(request: NextRequest) {
  await connection();
  try {
    const body = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return errorResponse(new Error("Cos de la petició buit."));
    const { ref, override } = body as { ref?: unknown; override?: unknown };
    return Response.json({ overrides: await container().saveDonorOverride.execute(ref, override ?? {}) });
  } catch (error) {
    return errorResponse(error);
  }
}
