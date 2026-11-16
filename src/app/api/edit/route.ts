import { z } from "zod";
import { EditUnavailableError, editPlan } from "@/lib/ai/edit";
import { PlanSchema } from "@/lib/plan/plan-schema";
import { allow, clientKey } from "@/lib/rate-limit";

const Body = z.object({
  plan: PlanSchema,
  message: z.string().trim().min(1).max(300),
  /** Set when the traveller is answering the agent's question about `message`. */
  answer: z.object({ question: z.string().max(200), option: z.string().max(60) }).optional(),
});

/**
 * The Ask box. Takes { plan, message }; the model turns the message into edit ops, code applies them and re-runs
 * the scheduler on the day they touch. Answers with the new plan, a question, or the reason nothing changed.
 */
export async function POST(request: Request) {
  // Counted apart from planning, so editing a trip doesn't use up the allowance for planning one.
  const allowance = allow(`edit:${clientKey(request)}`, 20);
  if (!allowance.ok) {
    const seconds = allowance.retryAfterSeconds;
    return Response.json(
      { error: "Too many changes at once", retryAfterSeconds: seconds },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const { plan, message, answer } = body.data;

  try {
    return Response.json(await editPlan(plan, message, answer));
  } catch (error) {
    console.error("editPlan failed", error);
    const status = error instanceof EditUnavailableError ? 503 : 502;
    return Response.json({ error: "The planner didn't answer" }, { status });
  }
}
