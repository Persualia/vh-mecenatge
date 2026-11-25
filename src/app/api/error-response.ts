import { InvalidRequestError } from "@/tracking/application/load-tracking-board";

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconegut";
  return Response.json({ error: message }, { status: error instanceof InvalidRequestError ? 400 : 502 });
}
