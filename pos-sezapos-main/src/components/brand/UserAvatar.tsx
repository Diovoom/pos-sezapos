import { cn } from "@/lib/utils";
import { roleAvatarClass, roleInitials } from "@/lib/role-visual";

/**
 * Employee/cashier avatar. Renders `photoUrl` (or `avatarUrl`) when present,
 * otherwise falls back to initials on the role-tinted circle.
 */
export function UserAvatar({
  name,
  photoUrl,
  role,
  className,
  textClassName,
}: {
  name: string;
  photoUrl?: string | null;
  role?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const initials = roleInitials(name || "?");
  if (photoUrl && photoUrl.trim()) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn("rounded-full object-cover bg-muted", className)}
        draggable={false}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full grid place-items-center text-white font-semibold",
        roleAvatarClass(role ?? undefined),
        className,
        textClassName,
      )}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
