import { createServerFn } from "@tanstack/react-start";

export const listLicenseReferencesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listLicenseReferencesFromDisk } = await import("./reference.server");
  return listLicenseReferencesFromDisk();
});
