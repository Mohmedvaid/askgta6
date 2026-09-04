import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "./harness";

/**
 * Just enough of the PostgREST client to run the importer's table calls against
 * pglite.
 *
 * The point is to test the shipped functions rather than a copy of them in SQL.
 * It covers select, insert, upsert, update, and the eq and in filters, which is
 * everything supabase/seed/import.ts asks a table for, and nothing else: an
 * unsupported call throws rather than quietly returning the wrong thing.
 */

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };

type Op =
  | { kind: "select"; columns: string }
  | { kind: "write"; rows: Row[]; conflict: string[] | null }
  | { kind: "update"; values: Row };

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

class Request implements PromiseLike<Result> {
  private readonly filters: [string, "eq" | "in", unknown][] = [];

  constructor(
    private readonly db: Db,
    private readonly table: string,
    private readonly op: Op,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push([column, "eq", value]);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.filters.push([column, "in", values]);
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private where(params: unknown[]): string {
    if (this.filters.length === 0) return "";

    const parts = this.filters.map(([column, op, value]) => {
      if (op === "eq") {
        params.push(value);
        return `${quote(column)} = $${params.length}`;
      }
      const list = (value as unknown[]).map((item) => {
        params.push(item);
        return `$${params.length}`;
      });
      return list.length === 0 ? "false" : `${quote(column)} in (${list.join(", ")})`;
    });

    return ` where ${parts.join(" and ")}`;
  }

  private async run(): Promise<Result> {
    const params: unknown[] = [];

    try {
      if (this.op.kind === "select") {
        const where = this.where(params);
        const result = await this.db.query<Row>(`select ${this.op.columns} from public.${this.table}${where}`, params);
        return { data: result.rows, error: null };
      }

      if (this.op.kind === "update") {
        const sets = Object.entries(this.op.values).map(([column, value]) => {
          params.push(value);
          return `${quote(column)} = $${params.length}`;
        });
        const where = this.where(params);
        await this.db.query(`update public.${this.table} set ${sets.join(", ")}${where}`, params);
        return { data: null, error: null };
      }

      const columns = [...new Set(this.op.rows.flatMap((row) => Object.keys(row)))];
      const values = this.op.rows.map(
        (row) =>
          `(${columns
            .map((column) => {
              params.push(row[column] ?? null);
              return `$${params.length}`;
            })
            .join(", ")})`,
      );

      const conflict = this.op.conflict;
      const updates = conflict
        ? columns.filter((column) => !conflict.includes(column)).map((column) => `${quote(column)} = excluded.${quote(column)}`)
        : [];
      const onConflict = !conflict
        ? ""
        : updates.length === 0
          ? ` on conflict (${conflict.map(quote).join(", ")}) do nothing`
          : ` on conflict (${conflict.map(quote).join(", ")}) do update set ${updates.join(", ")}`;

      await this.db.query(
        `insert into public.${this.table} (${columns.map(quote).join(", ")}) values ${values.join(", ")}${onConflict}`,
        params,
      );
      return { data: null, error: null };
    } catch (error) {
      return { data: null, error: { message: (error as Error).message } };
    }
  }
}

/** A client the importer can be handed in a test. Only .from() is wired up. */
export function postgrest(db: Db): SupabaseClient {
  const client = {
    from(table: string) {
      return {
        select: (columns: string) => new Request(db, table, { kind: "select", columns }),
        insert: (rows: Row | Row[]) =>
          new Request(db, table, { kind: "write", rows: Array.isArray(rows) ? rows : [rows], conflict: null }),
        upsert: (rows: Row | Row[], options?: { onConflict?: string }) =>
          new Request(db, table, {
            kind: "write",
            rows: Array.isArray(rows) ? rows : [rows],
            conflict: (options?.onConflict ?? "id").split(",").map((column) => column.trim()),
          }),
        update: (values: Row) => new Request(db, table, { kind: "update", values }),
      };
    },
  };

  return client as unknown as SupabaseClient;
}
