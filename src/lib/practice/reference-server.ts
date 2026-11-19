import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const searchRequest = z.strictObject({ query: z.string().trim().max(200) });

export const listPracticeReferenceFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listPracticeFunctionsFromDisk, listPracticeSectionsFromDisk } =
    await import("./reference.server");
  return {
    functions: listPracticeFunctionsFromDisk(),
    sections: listPracticeSectionsFromDisk(),
  };
});

export const searchPracticeReferenceFn = createServerFn({ method: "POST" })
  .validator((input: { query: string }) => searchRequest.parse(input))
  .handler(async ({ data }) => {
    const { searchPracticeReferenceFromDisk } = await import("./reference.server");
    return searchPracticeReferenceFromDisk(data.query);
  });
