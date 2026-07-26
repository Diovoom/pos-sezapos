export type UserRole = string | undefined | null;

function normalize(role: UserRole): "owner" | "admin" | "manager" | "cashier" | "user" {
  const r = (role ?? "").toLowerCase();
  if (r === "owner" || r === "admin" || r === "manager" || r === "cashier") return r;
  return "user";
}

export function roleAvatarClass(role: UserRole): string {
  const r = normalize(role);
  switch (r) {
    case "owner":
      return "bg-blue-600";
    case "admin":
      return "bg-indigo-600";
    case "manager":
      return "bg-purple-600";
    case "cashier":
      return "bg-emerald-600";
    default:
      return "bg-slate-500";
  }
}

export function roleDotClass(role: UserRole): string {
  const r = normalize(role);
  switch (r) {
    case "owner":
      return "bg-blue-500";
    case "admin":
      return "bg-indigo-500";
    case "manager":
      return "bg-purple-500";
    case "cashier":
      return "bg-emerald-500";
    default:
      return "bg-slate-400";
  }
}

export function roleTextClass(role: UserRole): string {
  const r = normalize(role);
  switch (r) {
    case "owner":
      return "text-blue-600";
    case "admin":
      return "text-indigo-600";
    case "manager":
      return "text-purple-600";
    case "cashier":
      return "text-emerald-600";
    default:
      return "text-muted-foreground";
  }
}

export function roleInitials(nameOrEmail: string): string {
  const s = (nameOrEmail || "?").trim();
  if (!s) return "?";
  const at = s.indexOf("@");
  const base = at > 0 ? s.slice(0, at) : s;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return s.charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
