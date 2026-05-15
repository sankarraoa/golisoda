import { describe, expect, it } from "vitest";

import { applyTheme } from "./applyTheme";

describe("applyTheme", () => {
  it("sets css vars for tokens and legacy aliases", () => {
    applyTheme({
      "color.brand.primary": "#ff0000",
      "spacing.page": "30px",
    });

    expect(document.documentElement.style.getPropertyValue("--color-brand-primary")).toBe("#ff0000");
    expect(document.documentElement.style.getPropertyValue("--color-tenant-primary")).toBe("#ff0000");
    expect(document.documentElement.style.getPropertyValue("--spacing-page")).toBe("30px");
  });

  it("does not unset variables for missing tokens", () => {
    document.documentElement.style.setProperty("--color-brand-primary", "#00ff00");
    applyTheme({});
    expect(document.documentElement.style.getPropertyValue("--color-brand-primary")).toBe("#00ff00");
  });

  it("sets variables on a provided element instead of documentElement", () => {
    const el = document.createElement("div");
    applyTheme({ "color.brand.primary": "#abc" }, el);
    expect(el.style.getPropertyValue("--color-brand-primary")).toBe("#abc");
    expect(el.style.getPropertyValue("--color-tenant-primary")).toBe("#abc");
  });
});

