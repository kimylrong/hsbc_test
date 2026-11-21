export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}