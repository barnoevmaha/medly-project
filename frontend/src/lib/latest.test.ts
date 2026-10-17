import { describe, expect, it } from "vitest";
import { createLatestGuard } from "./latest";

describe("createLatestGuard", () => {
  it("only the newest request is current", () => {
    const begin = createLatestGuard();
    const first = begin();
    const second = begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("a slow earlier response cannot overwrite a newer one", async () => {
    const begin = createLatestGuard();
    let shown = "";
    const search = async (query: string, delay: number) => {
      const isCurrent = begin();
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (isCurrent()) shown = query;
    };
    await Promise.all([search("card", 30), search("cardio", 5)]);
    expect(shown).toBe("cardio");
  });

  it("guards are independent", () => {
    const a = createLatestGuard();
    const b = createLatestGuard();
    const fromA = a();
    b();
    expect(fromA()).toBe(true);
  });
});
