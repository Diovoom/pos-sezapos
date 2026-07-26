import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Verify your {siteName} account and start your 14-day free trial</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>SEZA POS</Text>
        </Section>
        <Heading style={h1}>Verify your email</Heading>
        <Text style={text}>
          Welcome to <strong>{siteName}</strong>! You're one click away from your 14-day free trial
          — no credit card required.
        </Text>
        <Text style={text}>
          Please confirm <strong>{recipient}</strong> to activate your account:
        </Text>
        <Section style={{ textAlign: "center" as const, margin: "28px 0" }}>
          <Button style={button} href={confirmationUrl}>
            Verify email &amp; start trial
          </Button>
        </Section>
        <Text style={smallText}>Or paste this link into your browser:</Text>
        <Text style={linkFallback}>
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          This link expires in 24 hours. If you didn't create a {siteName} account, you can safely
          ignore this email.
        </Text>
        <Text style={footer}>
          © {new Date().getFullYear()} SEZA TECHNOLOGIES ·{" "}
          <Link href={siteUrl} style={link}>
            {siteUrl.replace(/^https?:\/\//, "")}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px", margin: "0 auto" };
const brandBar = { padding: "4px 0 20px", borderBottom: "1px solid #e5e7eb", marginBottom: "24px" };
const brandText = {
  fontSize: "18px",
  fontWeight: 700 as const,
  color: "#0f172a",
  margin: 0,
  letterSpacing: "-0.01em",
};
const h1 = { fontSize: "24px", fontWeight: 700 as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const smallText = { fontSize: "13px", color: "#64748b", margin: "18px 0 6px" };
const linkFallback = {
  fontSize: "12px",
  color: "#64748b",
  wordBreak: "break-all" as const,
  margin: "0 0 12px",
};
const link = { color: "#2563eb", textDecoration: "underline" };
const button = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600 as const,
  borderRadius: "8px",
  padding: "13px 24px",
  textDecoration: "none",
  display: "inline-block",
};
const hr = { borderColor: "#e5e7eb", margin: "28px 0 16px" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "6px 0", lineHeight: "1.5" };
