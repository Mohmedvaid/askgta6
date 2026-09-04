import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIO_MAX_LENGTH,
  USERNAME_COOLDOWN_DAYS,
  usernameCooldownEndsAt,
  usernameCooldownError,
} from "@/lib/profile-rules";
import { isValidUsername, normalizeUsername } from "@/lib/username";
import { profileSchema } from "@/lib/validation";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe("the username cooldown", () => {
  it("is thirty days", () => {
    expect(USERNAME_COOLDOWN_DAYS).toBe(30);
  });

  it("is over for a change made thirty one days ago", () => {
    expect(usernameCooldownEndsAt(daysAgo(31))).toBeNull();
  });

  it("still holds twenty nine days in", () => {
    const endsAt = usernameCooldownEndsAt(daysAgo(29));
    expect(endsAt).toBeInstanceOf(Date);
    expect(endsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not apply to an account that has never changed its name", () => {
    expect(usernameCooldownEndsAt(null)).toBeNull();
    expect(usernameCooldownEndsAt(undefined)).toBeNull();
  });

  it("says how long is left, rounded up, in a sentence a person can act on", () => {
    const message = usernameCooldownError(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

    expect(message).toContain("once every 30 days");
    expect(message).toContain("3 days");
  });

  it("says one day rather than zero on the last day", () => {
    expect(usernameCooldownError(new Date(Date.now() + 1000))).toContain("1 day");
  });
});

describe("username rules", () => {
  it("accepts three to twenty lowercase letters, digits, and underscores", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a_1234567890123456789")).toBe(false);
    expect(isValidUsername("mara_99")).toBe(true);
  });

  it("refuses anything shorter, longer, uppercase, or punctuated", () => {
    for (const bad of ["ab", "a".repeat(21), "Mara", "mara-99", "mara 99", "maré"]) {
      expect(isValidUsername(bad), bad).toBe(false);
    }
  });

  it("cleans up what someone typed rather than just refusing it", () => {
    expect(normalizeUsername("  Mara-99! ")).toBe("mara99");
    expect(normalizeUsername("A".repeat(30))).toHaveLength(20);
  });

  it("is lowercased by the schema, so casing is never a duplicate", () => {
    const parsed = profileSchema.safeParse({ username: "  MARA_99 " });
    expect(parsed.success && parsed.data.username).toBe("mara_99");
  });
});

describe("the bio", () => {
  it("is capped at 200 characters", () => {
    expect(BIO_MAX_LENGTH).toBe(200);

    const ok = profileSchema.safeParse({ username: "mara", bio: "a".repeat(200) });
    expect(ok.success).toBe(true);

    const tooLong = profileSchema.safeParse({ username: "mara", bio: "a".repeat(201) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.success === false && tooLong.error.issues[0]!.message).toBe("Bio is capped at 200 characters.");
  });

  it("is optional, so an empty profile is valid", () => {
    expect(profileSchema.safeParse({ username: "mara" }).success).toBe(true);
  });

  it("matches the check constraint the migration writes", () => {
    const sql = readFileSync(`${process.cwd()}/supabase/migrations/0013_spam_and_profiles.sql`, "utf8");
    expect(sql).toContain("char_length(bio) <= 200");
  });
});

/**
 * The rule is that a person cannot change the address on their account, so the
 * check is that no action anywhere sends one. A form with no email field would be
 * easy to add one back to; this fails if anybody does.
 */
describe("email cannot be changed", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) files.push(full);
    }
  };
  ["app", "actions", "components", "lib"].forEach(walk);

  it("is never passed to updateUser anywhere in the app", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/updateUser\(\s*\{([^}]*)\}/g)) {
        expect(match[1], `${path} calls updateUser with an email`).not.toContain("email");
      }
    }
  });

  it("has no email input on any form", () => {
    const settings = files.filter((path) => path.includes("settings") || path.includes("ProfileForm"));
    expect(settings.length).toBeGreaterThan(0);

    for (const path of settings) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} renders an email field`).not.toMatch(/name="email"/);
      expect(source, `${path} renders an email input`).not.toMatch(/type="email"/);
    }
  });

  it("does not read an email out of the profile form data", () => {
    const source = readFileSync(`${process.cwd()}/actions/profile.ts`, "utf8");
    expect(source).not.toContain('formData.get("email")');
  });
});
