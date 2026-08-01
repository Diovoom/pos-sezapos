import { createFileRoute, Link } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { PageHeader } from "@/components/pos/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/brand/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Building2, CalendarDays, Clock, CreditCard, KeyRound, Mail, Phone, Shield, UserRound } from "lucide-react";

export const Route = createFileRoute("/_dashboard/profile")({
  head: () => ({ meta: [{ title: "My Profile - SEZA POS" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: me, isLoading } = useMe();
  const profile = me?.profile;
  const role = me?.roles?.[0] ?? "owner";
  const fullName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || me?.user?.email || "SEZA user";

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your personal identity, employee access, and account security" />
      <div className="space-y-5 p-4 md:p-6">
        {isLoading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading your profile…</CardContent></Card> : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <UserAvatar name={fullName} photoUrl={profile?.avatar_url ?? profile?.photo_url} role={role} className="size-20 text-xl" />
                <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-semibold">{fullName}</h2><p className="truncate text-sm text-muted-foreground">{me?.user?.email}</p><div className="mt-2 flex flex-wrap gap-2"><Badge>{role}</Badge><Badge variant="outline">{profile?.status || "active"}</Badge></div></div>
                <Button asChild variant="outline"><Link to="/settings" search={{ section: "account_profile" }}>Edit profile</Link></Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ProfileField icon={CreditCard} label="Employee ID" value={profile?.employee_id || "Not assigned"} mono />
              <ProfileField icon={KeyRound} label="Quick sign-in PIN" value={profile?.pin_hash ? "•••••• · Set" : "Not set"} action="Change PIN" actionTo="account_pin" />
              <ProfileField icon={Shield} label="Access role" value={role} />
              <ProfileField icon={Building2} label="Business" value={me?.store?.name || "No store assigned"} />
              <ProfileField icon={Mail} label="Email" value={profile?.email || me?.user?.email || "Not provided"} />
              <ProfileField icon={Phone} label="Phone" value={profile?.phone || "Not provided"} />
              <ProfileField icon={CalendarDays} label="Hire date" value={profile?.hire_date ? new Date(profile.hire_date).toLocaleDateString() : "Not provided"} />
              <ProfileField icon={Clock} label="Scheduled hours" value={profile?.scheduled_start_time && profile?.scheduled_end_time ? `${profile.scheduled_start_time} - ${profile.scheduled_end_time}` : "Not scheduled"} />
              <ProfileField icon={UserRound} label="Account created" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "Unavailable"} />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Account and security</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button asChild variant="outline"><Link to="/settings" search={{ section: "account_password" }}>Change password</Link></Button>
                <Button asChild variant="outline"><Link to="/settings" search={{ section: "security" }}>Security and passkeys</Link></Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function ProfileField({ icon: Icon, label, value, mono, action, actionTo }: any) {
  return <Card><CardContent className="p-4"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Icon className="size-4" />{label}</div><div className={mono ? "font-mono text-lg font-semibold" : "text-lg font-semibold capitalize"}>{value}</div>{action && <Button asChild variant="link" className="mt-2 h-auto p-0"><Link to="/settings" search={{ section: actionTo }}>{action}</Link></Button>}</CardContent></Card>;
}
