/**
 * TODO: the Ask box. Take { plan, message }, have the model turn the message into EditOp[]
 * (src/lib/plan/edits.ts), apply them in code, re-run the scheduler with locks kept, and send the
 * validation errors back to the model once if anything fails.
 */
export async function POST() {
  return Response.json({ error: "Editing isn't built yet" }, { status: 501 });
}
