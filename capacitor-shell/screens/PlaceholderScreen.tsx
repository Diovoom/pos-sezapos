// Neutral in-shell placeholder for POS surfaces that haven't been ported to
// the bundled Android app yet. Rendered inside PosShell so the cashier keeps
// the standard navigation, header, and sign-out affordance.
export function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
