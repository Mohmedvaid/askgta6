import { vi } from "vitest";

type Result = { data: unknown; error: { message: string; code?: string } | null };

export type Call = { method: string; args: unknown[] };

/**
 * A stand in for the PostgREST query builder. It records the chain and resolves to a
 * result the test supplies, so tests can assert on what the query layer returns
 * rather than on which methods it happened to call.
 */
class FakeBuilder implements PromiseLike<Result> {
  constructor(
    private readonly result: Result,
    readonly calls: Call[],
  ) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select(...args: unknown[]) {
    return this.record("select", args);
  }
  insert(...args: unknown[]) {
    return this.record("insert", args);
  }
  update(...args: unknown[]) {
    return this.record("update", args);
  }
  delete(...args: unknown[]) {
    return this.record("delete", args);
  }
  upsert(...args: unknown[]) {
    return this.record("upsert", args);
  }
  eq(...args: unknown[]) {
    return this.record("eq", args);
  }
  is(...args: unknown[]) {
    return this.record("is", args);
  }
  in(...args: unknown[]) {
    return this.record("in", args);
  }
  ilike(...args: unknown[]) {
    return this.record("ilike", args);
  }
  gte(...args: unknown[]) {
    return this.record("gte", args);
  }
  or(...args: unknown[]) {
    return this.record("or", args);
  }
  order(...args: unknown[]) {
    return this.record("order", args);
  }
  limit(...args: unknown[]) {
    return this.record("limit", args);
  }
  range(...args: unknown[]) {
    return this.record("range", args);
  }
  single() {
    return this.record("single", []);
  }
  maybeSingle() {
    return this.record("maybeSingle", []);
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

export type FakeClientOptions = {
  tables?: Record<string, Result>;
  rpc?: Record<string, Result>;
  storage?: { publicUrl?: string; uploadError?: boolean };
  /** The admin auth surface, used only by the account deletion path. */
  authAdmin?: { deleteError?: boolean; users?: { id: string; email: string | null }[] };
};

export function createFakeClient(options: FakeClientOptions = {}) {
  const calls: Call[] = [];
  const empty: Result = { data: null, error: null };

  return {
    calls,
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return new FakeBuilder(options.tables?.[table] ?? empty, calls);
    },
    rpc(name: string, args: unknown) {
      calls.push({ method: "rpc", args: [name, args] });
      return new FakeBuilder(options.rpc?.[name] ?? empty, calls);
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push({ method: "deleteUser", args: [id] });
          return { data: null, error: options.authAdmin?.deleteError ? { message: "delete failed" } : null };
        },
        listUsers: async () => {
          calls.push({ method: "listUsers", args: [] });
          return { data: { users: options.authAdmin?.users ?? [] }, error: null };
        },
      },
    },
    storage: {
      from() {
        return {
          getPublicUrl: () => ({ data: { publicUrl: options.storage?.publicUrl ?? "https://cdn.test/avatar.png" } }),
          upload: async () => ({
            error: options.storage?.uploadError ? { message: "upload failed" } : null,
          }),
        };
      },
    },
  };
}

export type FakeClient = ReturnType<typeof createFakeClient>;

/** Installs the fake as the module the server code imports. */
export function mockSupabaseServer() {
  const holder: { client: FakeClient } = { client: createFakeClient() };
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => holder.client,
  }));
  return holder;
}
