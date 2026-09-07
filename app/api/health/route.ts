export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Deliberately does not touch the database so a
 *  slow migration or a transient DB blip doesn't crash-loop the pod. */
export function GET() {
  return Response.json({ ok: true, service: "rehearsal-room" });
}
