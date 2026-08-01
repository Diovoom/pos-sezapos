import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/errors/user-facing";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { beginPasskeyRegistration, finishPasskeyRegistration, listMyPasskeys, removeMyPasskey } from "@/lib/auth/passkeys.functions";

export function PasskeyPanel() {
  const begin = useServerFn(beginPasskeyRegistration); const finish = useServerFn(finishPasskeyRegistration);
  const list = useServerFn(listMyPasskeys); const remove = useServerFn(removeMyPasskey);
  const [rows,setRows]=useState<any[]>([]); const [busy,setBusy]=useState(false);
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;
  const refresh = async () => { const t=await token(); if(t) setRows(await list({data:{accessToken:t}})); };
  useEffect(()=>{ void refresh(); },[]);
  const add = async () => { setBusy(true); try { const t=await token(); if(!t) throw new Error("Sign in again."); const started=await begin({data:{accessToken:t}}); const response=await startRegistration({optionsJSON:started.options as any}); await finish({data:{accessToken:t,challengeId:started.challengeId,name:"My passkey",response}}); toast.success("Passkey added"); await refresh(); } catch(e:any){ toast.error(userFacingError(e, "Could not add passkey")); } finally { setBusy(false); } };
  const del = async (id:string) => { const t=await token(); if(!t)return; await remove({data:{accessToken:t,id}}); toast.success("Passkey removed"); await refresh(); };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="size-5"/>Passkeys</CardTitle><CardDescription>Use Face ID, Touch ID, Android fingerprint, Windows Hello, or your device PIN to sign in.</CardDescription></CardHeader><CardContent className="space-y-3"><Button onClick={add} disabled={busy}>{busy?<Loader2 className="mr-2 size-4 animate-spin"/>:<Plus className="mr-2 size-4"/>}Add passkey</Button>{rows.length===0?<p className="text-sm text-muted-foreground">No passkeys registered yet. Keep your password as a recovery method.</p>:<div className="space-y-2">{rows.map((r)=><div key={r.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">Added {new Date(r.created_at).toLocaleDateString()}{r.last_used_at?` · Last used ${new Date(r.last_used_at).toLocaleDateString()}`:""}</p></div><Button variant="ghost" size="icon" onClick={()=>del(r.id)} aria-label="Remove passkey"><Trash2 className="size-4"/></Button></div>)}</div>}</CardContent></Card>;
}
