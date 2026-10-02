import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppErrorComponent } from "./error-component";
import { CLEAR_LOCAL_CONFIRM } from "./precog/recovery-copy";

const render = () =>
  renderToStaticMarkup(
    <AppErrorComponent error={new Error("Boom")} reset={() => undefined} info={undefined} />,
  );

describe("the crash screen", () => {
  it("offers the recovery download before clearing this browser's data", () => {
    const html = render();
    const download = html.indexOf("Download a recovery copy");
    const clear = html.indexOf("Clear the saved data on this device and reload");
    expect(download).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(download);
    expect(html).toContain("Boom");
  });

  it("warns, before clearing, that clearing is final", () => {
    expect(CLEAR_LOCAL_CONFIRM.endsWith("You cannot undo this.")).toBe(true);
    expect(CLEAR_LOCAL_CONFIRM).toContain("recovery copy");
  });
});
