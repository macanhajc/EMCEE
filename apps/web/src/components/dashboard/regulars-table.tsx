interface Regular {
  username: string;
  visitCount: number;
  lastSeenAt: Date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RegularsTable({ regulars }: { regulars: Regular[] }) {
  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <h2 className="font-display text-xl text-paper">Regulars</h2>
      <p className="mt-1 text-sm text-dust">
        Concierge&apos;s most frequent visitors over the last 30 days.
      </p>

      {regulars.length === 0 ? (
        <p className="mt-4 text-sm text-dust">
          No regulars yet — guests who come back a few times will show up here.
        </p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-paper/10 text-dust">
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                Username
              </th>
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                Visits
              </th>
              <th className="pb-2 font-ui-mono text-[11px] font-normal tracking-[0.15em] uppercase">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {regulars.map((regular) => (
              <tr key={regular.username} className="border-b border-paper/5 last:border-0">
                <td className="py-2 text-paper">{regular.username}</td>
                <td className="py-2 text-paper">{regular.visitCount}</td>
                <td className="py-2 text-dust">{formatDate(regular.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
