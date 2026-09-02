import { createInvite } from "@/actions/groups";
import { CopyField } from "./CopyField";
import type { GroupRow } from "@/lib/queries/groups";

type Invite = { id: string; code: string; expires_at: string | null };

export function InvitePanel({ group, invites }: { group: GroupRow; invites: Invite[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">Invite links</h2>
        <form action={createInvite}>
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="slug" value={group.slug} />
          <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary">
            Generate a link
          </button>
        </form>
      </div>

      {invites.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No links yet. Generate one to invite somebody.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {invites.map((invite) => (
            <li key={invite.id}>
              <CopyField value={`/g/join/${invite.code}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
