// @polsia:user-owned

export default function AdminPage() {
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Admin dashboard</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Overview</h1>
      </div>
      <section className="grid gap-2 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-card-foreground">Administration</h2>
        <p className="text-sm text-muted-foreground">Owner and operations workflows.</p>
        <p className="text-sm text-muted-foreground">
          Add your administration tools here and link them from the admin navigation.
        </p>
      </section>
    </div>
  );
}
