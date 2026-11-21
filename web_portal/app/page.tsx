import Link from "next/link";

const APPS = [
  {
    href: "/estimator",
    title: "Property Value Estimator",
    description:
      "Estimate the value of a single property with AI, review the dataset price distribution, and compare past estimates.",
  },
  {
    href: "/market",
    title: "Market Analysis",
    description:
      "Explore 50 properties across 7 dimensions with interactive charts, a detail table, CSV/PDF export, and what-if scenarios.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          HSBC Property Intelligence
        </h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          A unified portal for residential property valuation and market
          analysis.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {APPS.map((app) => (
          <Link
            key={app.href}
            href={app.href}
            className="group rounded-xl border border-line bg-surface p-6 transition hover:border-primary hover:shadow-sm"
          >
            <h2 className="text-xl font-semibold transition group-hover:text-primary">
              {app.title}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{app.description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}