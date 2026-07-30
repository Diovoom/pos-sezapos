import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RP_NAME = "SEZA POS";
const RP_ID = process.env.PASSKEY_RP_ID || "sezapos.com";
const EXPECTED_ORIGINS = (process.env.PASSKEY_ORIGINS || "https://dashboard.sezapos.com")
  .split(",").map((v) => v.trim()).filter(Boolean);
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => `\\x${Array.from(bytes).map((b) => b.toString(16).padStart(2,"0")).join("")}`;
const bytes = (value: string) => new Uint8Array((value.startsWith("\\x") ? value.slice(2) : value).match(/.{1,2}/g)?.map((b) => parseInt(b,16)) ?? []);
const sha256 = async (value: string) => Buffer.from(await crypto.subtle.digest("SHA-256", enc.encode(value))).toString("hex");

async function authenticatedUser(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email) throw new Error("Authentication required");
  return data.user;
}

export const beginPasskeyRegistration = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ accessToken: z.string().min(20) }).parse(v))
  .handler(async ({ data }) => {
    const user = await authenticatedUser(data.accessToken);
    const { data: existing } = await (supabaseAdmin as any).from("passkey_credentials").select("credential_id,transports").eq("user_id", user.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID, userID: enc.encode(user.id), userName: user.email!,
      attestationType: "none", timeout: 60000,
      excludeCredentials: ((existing ?? []) as any[]).map((r: any) => ({ id: r.credential_id, transports: (r.transports ?? []) as any })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    const { data: challenge, error } = await (supabaseAdmin as any).from("passkey_challenges").insert({ purpose:"registration", challenge:options.challenge, user_id:user.id, expires_at:new Date(Date.now()+5*60_000).toISOString() }).select("id").single();
    if (error) throw error;
    return { challengeId: challenge.id, options };
  });

export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ accessToken:z.string().min(20), challengeId:z.string().uuid(), name:z.string().trim().min(1).max(60), response:z.any() }).parse(v))
  .handler(async ({ data }) => {
    const user = await authenticatedUser(data.accessToken);
    const { data: row } = await (supabaseAdmin as any).from("passkey_challenges").select("*").eq("id",data.challengeId).eq("user_id",user.id).eq("purpose","registration").is("consumed_at",null).gt("expires_at",new Date().toISOString()).single();
    if (!row) throw new Error("Passkey setup expired. Start again.");
    const verification = await verifyRegistrationResponse({ response:data.response, expectedChallenge:row.challenge, expectedOrigin:EXPECTED_ORIGINS, expectedRPID:RP_ID, requireUserVerification:true });
    if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey verification failed");
    const info = verification.registrationInfo;
    await (supabaseAdmin as any).from("passkey_credentials").insert({ user_id:user.id, credential_id:info.credential.id, public_key:hex(info.credential.publicKey), counter:info.credential.counter, transports:info.credential.transports ?? [], device_type:info.credentialDeviceType, backed_up:info.credentialBackedUp, name:data.name });
    await (supabaseAdmin as any).from("passkey_challenges").update({ consumed_at:new Date().toISOString() }).eq("id",row.id);
    await (supabaseAdmin as any).from("audit_log").insert({ actor_id:user.id, action:"passkey_registered", entity:"account", entity_id:user.id, details:{ name:data.name } });
    return { ok:true };
  });

export const listMyPasskeys = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ accessToken:z.string().min(20) }).parse(v))
  .handler(async ({ data }) => {
    const user = await authenticatedUser(data.accessToken);
    const { data: rows, error } = await (supabaseAdmin as any).from("passkey_credentials").select("id,name,created_at,last_used_at,device_type,backed_up").eq("user_id",user.id).order("created_at",{ascending:false});
    if (error) throw error;
    return rows ?? [];
  });

export const removeMyPasskey = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ accessToken:z.string().min(20), id:z.string().uuid() }).parse(v))
  .handler(async ({ data }) => {
    const user = await authenticatedUser(data.accessToken);
    const { error } = await (supabaseAdmin as any).from("passkey_credentials").delete().eq("id",data.id).eq("user_id",user.id);
    if (error) throw error;
    return { ok:true };
  });

export const beginPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ email:z.string().trim().toLowerCase().email() }).parse(v))
  .handler(async ({ data }) => {
    const request = getRequest();
    const { consumeRateLimit, getClientIp } = await import("@/lib/security/rate-limit.server");
    const allowed = await consumeRateLimit({ scope:"auth.owner.passkey", limit:8, windowSeconds:900, blockSeconds:1800, identifier:`${getClientIp(request)}:${data.email}`, request, durable:true });
    if (!allowed.allowed) throw new Error("Too many attempts. Try again later.");
    const emailHash = await sha256(data.email);
    const { data: profile } = await (supabaseAdmin as any).from("profiles").select("id,email").ilike("email", data.email).maybeSingle();
    const userId = profile?.id as string | undefined;
    const { data: creds } = userId ? await (supabaseAdmin as any).from("passkey_credentials").select("credential_id,transports").eq("user_id",userId) : { data:[] as any[] };
    if (!userId || !creds?.length) throw new Error("No passkey is available for this account.");
    const options = await generateAuthenticationOptions({ rpID:RP_ID, timeout:60000, userVerification:"required", allowCredentials:creds.map((r) => ({ id:r.credential_id, transports:(r.transports ?? []) as any })) });
    const { data: challenge, error } = await (supabaseAdmin as any).from("passkey_challenges").insert({ purpose:"authentication", challenge:options.challenge, user_id:userId, email_hash:emailHash, expires_at:new Date(Date.now()+5*60_000).toISOString() }).select("id").single();
    if (error) throw error;
    return { challengeId:challenge.id, options };
  });

export const finishPasskeyLogin = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ challengeId:z.string().uuid(), response:z.any() }).parse(v))
  .handler(async ({ data }) => {
    const { data: challenge } = await (supabaseAdmin as any).from("passkey_challenges").select("*").eq("id",data.challengeId).eq("purpose","authentication").is("consumed_at",null).gt("expires_at",new Date().toISOString()).single();
    if (!challenge?.user_id) throw new Error("Passkey sign-in expired.");
    const { data: credential } = await (supabaseAdmin as any).from("passkey_credentials").select("*").eq("credential_id",data.response.id).eq("user_id",challenge.user_id).single();
    if (!credential) throw new Error("Passkey not recognized.");
    const verification = await verifyAuthenticationResponse({ response:data.response, expectedChallenge:challenge.challenge, expectedOrigin:EXPECTED_ORIGINS, expectedRPID:RP_ID, credential:{ id:credential.credential_id, publicKey:bytes(credential.public_key as string), counter:Number(credential.counter), transports:(credential.transports ?? []) as any }, requireUserVerification:true });
    if (!verification.verified) throw new Error("Passkey verification failed.");
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(challenge.user_id);
    if (!userData.user?.email || !userData.user.email_confirmed_at) throw new Error("Email verification is required.");
    await (supabaseAdmin as any).from("passkey_credentials").update({ counter:verification.authenticationInfo.newCounter, last_used_at:new Date().toISOString() }).eq("id",credential.id);
    await (supabaseAdmin as any).from("passkey_challenges").update({ consumed_at:new Date().toISOString() }).eq("id",challenge.id);
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type:"magiclink", email:userData.user.email });
    if (error || !link.properties?.hashed_token) throw new Error("Could not create session.");
    await (supabaseAdmin as any).from("audit_log").insert({ actor_id:challenge.user_id, action:"login", entity:"owner", entity_id:challenge.user_id, details:{ method:"passkey", server_verified:true } });
    return { tokenHash:link.properties.hashed_token, email:userData.user.email };
  });
