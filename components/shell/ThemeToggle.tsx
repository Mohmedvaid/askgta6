import { setTheme } from "@/actions/profile";

export function ThemeToggle({ theme }: { theme: "dark" | "light" }) {
  return (
    <form action={setTheme} className="flex items-center gap-3">
      <input type="hidden" name="theme" value={theme === "dark" ? "light" : "dark"} />
      <p className="text-sm text-text-secondary">
        Currently using the {theme} theme.
      </p>
      <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary">
        Switch to {theme === "dark" ? "light" : "dark"}
      </button>
    </form>
  );
}
