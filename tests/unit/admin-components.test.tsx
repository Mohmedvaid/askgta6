import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setBanned = vi.fn();
const deleteAccount = vi.fn();
const moderate = vi.fn();
const editBlockList = vi.fn();
const adminEditProfile = vi.fn();

vi.mock("@/actions/admin", () => ({ setBanned, deleteAccount, moderate, editBlockList, adminEditProfile }));

const { StatBar } = await import("@/components/admin/StatBar");
const { BanControl } = await import("@/components/admin/BanControl");
const { DeleteAccountControl } = await import("@/components/admin/DeleteAccountControl");
const { Turnstile } = await import("@/components/form/Turnstile");
const { BlockListEditor } = await import("@/components/admin/BlockListEditor");
const { ProfileControl } = await import("@/components/admin/ProfileControl");

const DAYS = [
  { day: "2026-09-01", value: 0 },
  { day: "2026-09-02", value: 5 },
  { day: "2026-09-03", value: 10 },
];

describe("StatBar", () => {
  it("reports the total and the peak, and draws one bar per day", () => {
    const { container } = render(<StatBar label="Signups" days={DAYS} />);

    expect(screen.getByText("15 in 30 days, peak 10")).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);
  });

  it("carries the same numbers as a table, which a canvas chart could not", () => {
    render(<StatBar label="Posts" days={DAYS} />);

    // The bars are aria-hidden, so this table is the accessible copy.
    const table = screen.getByRole("table", { name: /Posts per day/ });
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2026-09-02" })).toBeInTheDocument();
  });

  it("survives a month with nothing in it, rather than dividing by zero", () => {
    render(<StatBar label="Replies" days={[{ day: "2026-09-01", value: 0 }]} />);
    expect(screen.getByText("0 in 30 days, peak 1")).toBeInTheDocument();
  });
});

describe("BanControl", () => {
  it("asks for a reason when banning, and does not when lifting one", () => {
    const { unmount } = render(<BanControl userId="user-1" banned={false} />);
    expect(screen.getByPlaceholderText("Reason, for the audit log")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ban author" })).toBeInTheDocument();
    unmount();

    render(<BanControl userId="user-1" banned />);
    expect(screen.queryByPlaceholderText("Reason, for the audit log")).toBeNull();
    expect(screen.getByRole("button", { name: "Unban" })).toBeInTheDocument();
  });

  it("sends the id and the direction the server needs", () => {
    const { container } = render(<BanControl userId="user-1" banned={false} />);

    expect(container.querySelector('input[name="userId"]')).toHaveValue("user-1");
    expect(container.querySelector('input[name="action"]')).toHaveValue("ban");
  });
});

describe("DeleteAccountControl", () => {
  it("hides behind a disclosure and asks for the username, because there is no undo", async () => {
    render(<DeleteAccountControl userId="user-1" username="dex" />);

    await userEvent.click(screen.getByText("Delete this account"));
    expect(screen.getByLabelText(/Type/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeInTheDocument();
  });

  it("reports a refusal from the server", async () => {
    deleteAccount.mockResolvedValue({ ok: false, error: "That username does not match." });

    render(<DeleteAccountControl userId="user-1" username="dex" />);
    await userEvent.click(screen.getByText("Delete this account"));
    await userEvent.type(screen.getByLabelText(/Type/), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  });
});

describe("Turnstile", () => {
  it("renders nothing at all while the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_ENABLED", "false");
    const { container } = render(<Turnstile />);

    // No widget, and no script tag either, so the flag really is the whole switch.
    expect(container.innerHTML).toBe("");
    vi.unstubAllEnvs();
  });

  it("renders nothing when it is on but no site key was given", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");

    expect(render(<Turnstile />).container.innerHTML).toBe("");
    vi.unstubAllEnvs();
  });

  it("renders a holder for the widget once both are set", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x000000");

    const { container } = render(<Turnstile />);
    expect(container.querySelector('div[id^="turnstile-"]')).not.toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("BlockListEditor", () => {
  const entries = [
    { id: "1", value: "bit.ly", note: "shortener" },
    { id: "2", value: "pastebin.com", note: null },
  ];

  it("lists what is blocked and offers a remove for each", () => {
    render(<BlockListEditor list="domain" title="Blocked domains" hint="Paste a link." entries={entries} />);

    expect(screen.getByText("bit.ly")).toBeInTheDocument();
    expect(screen.getByText("shortener")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
  });

  it("says so rather than showing an empty list", () => {
    render(<BlockListEditor list="phrase" title="Blocked phrases" hint="Keep them specific." entries={[]} />);

    expect(screen.getByText("Nothing on this list.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("sends which list it is editing, so one action serves both", () => {
    const { container } = render(
      <BlockListEditor list="phrase" title="Blocked phrases" hint="h" entries={entries} />,
    );

    expect(container.querySelector('input[name="list"]')).toHaveValue("phrase");
    expect(container.querySelector('input[name="action"]')).toHaveValue("add");
  });

  it("reports a refusal from the server", async () => {
    editBlockList.mockResolvedValue({ ok: false, error: "That is already on the list." });

    render(<BlockListEditor list="domain" title="Blocked domains" hint="h" entries={[]} />);
    await userEvent.type(screen.getByLabelText("Add to Blocked domains"), "bit.ly");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already on the list");
  });
});

describe("ProfileControl", () => {
  it("offers a rename prefilled with the current name", () => {
    render(<ProfileControl userId="user-1" username="dex" hasBio={false} />);

    expect(screen.getByLabelText("Rename")).toHaveValue("dex");
    expect(screen.getByRole("button", { name: "Save name" })).toBeInTheDocument();
  });

  it("offers to clear a bio only when there is one", () => {
    const { unmount } = render(<ProfileControl userId="user-1" username="dex" hasBio={false} />);
    expect(screen.queryByRole("button", { name: "Clear bio" })).toBeNull();
    unmount();

    render(<ProfileControl userId="user-1" username="dex" hasBio />);
    expect(screen.getByRole("button", { name: "Clear bio" })).toBeInTheDocument();
  });

  it("reports a taken username", async () => {
    adminEditProfile.mockResolvedValue({ ok: false, error: "That username is taken." });

    render(<ProfileControl userId="user-1" username="dex" hasBio={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("taken");
  });
});
