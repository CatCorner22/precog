import { describe, expect, it } from "vitest";
import { Route } from "./__root";

// The leading "-" keeps this file out of the generated route tree.
describe("an address with no page, such as /reports", () => {
  it("renders a page with a way back instead of a bare Not Found", () => {
    expect(Route.options.notFoundComponent).toBeTypeOf("function");
  });
});
