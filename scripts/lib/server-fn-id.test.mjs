import { describe, expect, it } from "vitest";
import { serverFunctionId, serverFunctionIdOf } from "./server-fn-id.mjs";

describe("server function ids", () => {
  it("match the ids TanStack Start's default gave the compiled build", () => {
    // Read from a production build before vite.config.ts took over the scheme.
    expect(serverFunctionIdOf("src/lib/precog/profile-server.ts", "saveBusinessProfile")).toBe(
      "24564b6e975ab453340542f84b412687c3e372c5735c46c5ddad219ed6120435",
    );
    expect(serverFunctionIdOf("src/lib/precog/profile-server.ts", "loadBusinessProfile")).toBe(
      "512c02bc87fca3431653cafaec2977f1906a38ff0439fedc4b03ac17a057ab95",
    );
  });

  it("differ by file and by export", () => {
    const save = serverFunctionId({
      filename: "src/a.ts",
      functionName: "save_createServerFn_handler",
    });
    expect(serverFunctionIdOf("src/a.ts", "save")).toBe(save);
    expect(serverFunctionIdOf("src/b.ts", "save")).not.toBe(save);
    expect(serverFunctionIdOf("src/a.ts", "load")).not.toBe(save);
  });
});
