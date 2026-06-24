export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-slate-500">
          Upload a list of rehab center URLs to enrich and find decision-maker
          leads via Apollo.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Centers", value: "—" },
          { label: "Enriched", value: "—" },
          { label: "Leads Found", value: "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold text-brand-500">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
