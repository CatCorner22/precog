import { z } from "zod";
import {
  cliff,
  cliffInput,
  leave,
  leaveInput,
  policy,
  policyInput,
  price,
  priceInput,
  skim,
  skimInput,
} from "../controlguard-checks";
import { sod, sodInput, triage, triageInput, type Signoff } from "../sod/controlguard-risk";
import {
  controlguardToolInfo,
  controlguardToolNames,
  type ControlGuardTool,
} from "./controlguard-tool-info";

function check<T extends z.ZodType, R>(
  schema: T,
  run: (args: z.output<T>, signoff?: Signoff) => R,
) {
  return {
    schema,
    run: (args: unknown, signoff?: Signoff) => run(schema.parse(args), signoff),
  };
}

export const controlguardTools = {
  triage: check(triageInput, triage),
  sod: check(sodInput, sod),
  price: check(priceInput, price),
  skim: check(skimInput, skim),
  cliff: check(cliffInput, cliff),
  leave: check(leaveInput, leave),
  policy: check(policyInput, policy),
};

export type ControlGuardResult = ReturnType<(typeof controlguardTools)[ControlGuardTool]["run"]>;

export const controlguardModelTools = controlguardToolNames.map((name) => {
  const { schema } = controlguardTools[name];
  const { description } = controlguardToolInfo[name];
  return { type: "function", function: { name, description, parameters: z.toJSONSchema(schema) } };
});
