import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, honeypotTripped } from "@/lib/honeypot";

function form(entries: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("honeypotTripped", () => {
  it("is not tripped by a form a person filled in", () => {
    expect(honeypotTripped(form({ email: "a@b.test", password: "12345678" }))).toBe(false);
  });

  it("is not tripped by the field being present and empty", () => {
    expect(honeypotTripped(form({ [HONEYPOT_FIELD]: "" }))).toBe(false);
    expect(honeypotTripped(form({ [HONEYPOT_FIELD]: "   " }))).toBe(false);
  });

  it("is tripped by anything written into it", () => {
    expect(honeypotTripped(form({ [HONEYPOT_FIELD]: "https://buy-followers.example" }))).toBe(true);
  });

  it("is named something worth filling in", () => {
    expect(HONEYPOT_FIELD).toBe("website");
  });
});
