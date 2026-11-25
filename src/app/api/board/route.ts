import { connection, type NextRequest } from "next/server";
import { container } from "@/tracking/infrastructure/container";
import { errorResponse } from "../error-response";

/** Everything the board needs, in one read. */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const today = params.get("today") || new Date().toISOString().slice(0, 10);
  try {
    return Response.json(await container().loadTrackingBoard.execute(today, { fresh: params.get("fresh") === "1" }));
  } catch (error) {
    return errorResponse(error);
  }
}
