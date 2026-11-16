import type { Pace } from "./types";

/**
 * The only things the "Ask" box can do to a plan. The model returns a list of these; code applies each,
 * re-runs the scheduler with locks kept, and rejects anything that fails validation.
 *
 * TODO: implement applyEdit(plan, op) with one handler per case, and wire it to /api/edit.
 */
export type EditOp =
  | { op: "remove"; stopKey: string }
  | { op: "add"; placeId: string; day: number }
  | { op: "swap"; stopKey: string; placeId: string }
  | { op: "lock"; stopKey: string }
  | { op: "setPace"; day: number; pace: Pace }
  /** The model needs one answer before it can act: a question with button options. */
  | { op: "ask"; question: string; options: string[] };
