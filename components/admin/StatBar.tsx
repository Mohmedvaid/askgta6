/**
 * Thirty days of counts as bars made of divs.
 *
 * No charting library: this is three numbers a day for a month, and a dependency
 * that ships a rendering engine to draw thirty rectangles is not worth the bytes
 * or the upgrade treadmill. The table underneath carries the same numbers for
 * anyone reading with a screen reader, which a canvas chart would not.
 */
export function StatBar({
  label,
  days,
}: {
  label: string;
  days: readonly { day: string; value: number }[];
}) {
  const peak = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-semibold tracking-widest text-text-muted uppercase">{label}</h2>
        <span className="text-sm text-text-secondary">
          {total} in 30 days, peak {peak}
        </span>
      </div>

      <div aria-hidden className="mt-4 flex h-24 items-end gap-1">
        {days.map((day) => (
          <div
            key={day.day}
            title={`${day.day}: ${day.value}`}
            className="flex-1 rounded-sm bg-accent-bg"
            style={{ height: `${Math.max(2, (day.value / peak) * 100)}%` }}
          />
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-text-muted">Show the numbers</summary>
        <table className="mt-3 w-full text-left text-xs">
          <caption className="sr-only">{label} per day for the last 30 days</caption>
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="py-1 font-medium">
                Day
              </th>
              <th scope="col" className="py-1 font-medium">
                {label}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day} className="text-text-secondary">
                <td className="py-1">{day.day}</td>
                <td className="py-1">{day.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
