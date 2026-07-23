export function PlanOption({
  id,
  value,
  label,
  price,
  period,
  reference,
  badge,
  defaultChecked,
}: {
  id: string;
  value: "monthly" | "annual";
  label: string;
  price: string;
  period: string;
  reference: string;
  badge?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="radio"
        name="plan"
        id={id}
        value={value}
        defaultChecked={defaultChecked}
        required
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="block cursor-pointer rounded-2xl border border-paper/10 bg-ink/40 p-5 transition-colors peer-checked:border-marquee peer-checked:bg-panel-2/60 peer-focus-visible:ring-2 peer-focus-visible:ring-marquee/50"
      >
        {badge && (
          <span className="absolute top-4 right-4 rounded-full bg-spotlight px-2.5 py-0.5 font-ui-mono text-[10px] text-ink">
            {badge}
          </span>
        )}
        <p className="font-display text-xs tracking-wide text-dust uppercase">{label}</p>
        <p className="mt-2 font-display text-2xl text-paper">
          {price}
          <span className="font-ui-mono text-sm text-dust">{period}</span>
        </p>
        <p className="mt-1 font-ui-mono text-[11px] text-dust">{reference}</p>
      </label>
    </div>
  );
}
