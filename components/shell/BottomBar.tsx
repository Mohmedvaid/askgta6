import Link from "next/link";

const ITEMS = [
  { href: "/feed", label: "Feed" },
  { href: "/g", label: "Groups" },
  { href: "/new", label: "Post" },
  { href: "/settings", label: "You" },
];

/** The rail becomes this on small screens. Four items, nothing else. */
export function BottomBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface-1 lg:hidden"
    >
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="px-2 py-3 text-center text-xs font-semibold text-text-secondary"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
