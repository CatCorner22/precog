import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const evidenceModuleRequest = z.strictObject({
  id: z.string().min(1).max(100),
});

export const listEvidenceModules = createServerFn({ method: "GET" }).handler(async () => {
  const { listEvidenceModulesFromBundle } = await import("./reference.server");
  return listEvidenceModulesFromBundle();
});

export const getEvidenceModule = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => evidenceModuleRequest.parse(input))
  .handler(async ({ data }) => {
    const { getEvidenceModuleFromBundle } = await import("./reference.server");
    return getEvidenceModuleFromBundle(data.id);
  });

export const listBenchmarkStudies = createServerFn({ method: "GET" }).handler(async () => {
  const { listBenchmarkStudiesFromBundle } = await import("./reference.server");
  return listBenchmarkStudiesFromBundle();
});
