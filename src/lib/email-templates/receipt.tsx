import * as React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface ReceiptLineData {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptEmailData {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  currency?: string;
  receiptNumber?: string | number;
  transactionId?: string;
  cashierName?: string | null;
  customerName?: string | null;
  createdAt?: string;
  lines?: ReceiptLineData[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  paymentMethod?: string;
  cardBrand?: string | null;
  last4?: string | null;
  amountTendered?: number | null;
  changeDue?: number | null;
  returnPolicy?: string | null;
  thankYou?: string | null;
}

function fmt(n: number | undefined | null, currency = "USD") {
  if (n == null || Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

const ReceiptEmail = (props: ReceiptEmailData) => {
  const currency = props.currency ?? "USD";
  const lines = props.lines ?? [];
  const dt = props.createdAt ? new Date(props.createdAt) : new Date();
  const storeName = props.storeName ?? "Your Store";

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Your receipt from {storeName} — {fmt(props.total, currency)}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>{storeName}</Heading>
            {props.storeAddress ? <Text style={muted}>{props.storeAddress}</Text> : null}
            {props.storePhone ? <Text style={muted}>{props.storePhone}</Text> : null}
          </Section>

          <Section style={{ padding: "0 24px" }}>
            <Text style={heading2}>Receipt</Text>
            <Row>
              <Column>
                <Text style={metaLabel}>Receipt #</Text>
                <Text style={metaValue}>{String(props.receiptNumber ?? "—")}</Text>
              </Column>
              <Column>
                <Text style={metaLabel}>Date</Text>
                <Text style={metaValue}>
                  {dt.toLocaleDateString()} {dt.toLocaleTimeString()}
                </Text>
              </Column>
            </Row>
            {props.cashierName ? (
              <Text style={muted}>Cashier: {props.cashierName}</Text>
            ) : null}
            {props.customerName ? (
              <Text style={muted}>Customer: {props.customerName}</Text>
            ) : null}
          </Section>

          <Hr style={hr} />

          <Section style={{ padding: "0 24px" }}>
            {lines.map((l, i) => (
              <Row key={i} style={{ marginBottom: 8 }}>
                <Column style={{ width: "60%" }}>
                  <Text style={itemName}>{l.name}</Text>
                  <Text style={itemMeta}>
                    {l.qty} × {fmt(l.unit_price, currency)}
                  </Text>
                </Column>
                <Column style={{ width: "40%", textAlign: "right" }}>
                  <Text style={itemTotal}>{fmt(l.line_total, currency)}</Text>
                </Column>
              </Row>
            ))}
          </Section>

          <Hr style={hr} />

          <Section style={{ padding: "0 24px" }}>
            <TotalsRow label="Subtotal" value={fmt(props.subtotal, currency)} />
            {props.discount ? (
              <TotalsRow label="Discount" value={`-${fmt(props.discount, currency)}`} />
            ) : null}
            <TotalsRow label="Tax" value={fmt(props.tax, currency)} />
            <Row style={{ marginTop: 8 }}>
              <Column>
                <Text style={grandLabel}>TOTAL</Text>
              </Column>
              <Column style={{ textAlign: "right" }}>
                <Text style={grandValue}>{fmt(props.total, currency)}</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={hr} />

          <Section style={{ padding: "0 24px" }}>
            <TotalsRow
              label="Payment"
              value={(props.paymentMethod ?? "cash").replace(/_/g, " ").toUpperCase()}
            />
            {props.cardBrand && props.last4 ? (
              <TotalsRow label="Card" value={`${props.cardBrand} ••${props.last4}`} />
            ) : null}
            {props.amountTendered != null ? (
              <TotalsRow label="Tendered" value={fmt(props.amountTendered, currency)} />
            ) : null}
            {props.changeDue != null && props.changeDue > 0 ? (
              <TotalsRow label="Change" value={fmt(props.changeDue, currency)} />
            ) : null}
          </Section>

          {props.returnPolicy ? (
            <>
              <Hr style={hr} />
              <Section style={{ padding: "0 24px" }}>
                <Text style={policy}>{props.returnPolicy}</Text>
              </Section>
            </>
          ) : null}

          {props.thankYou ? (
            <Section style={{ padding: "0 24px" }}>
              <Text style={thanks}>{props.thankYou}</Text>
            </Section>
          ) : (
            <Section style={{ padding: "0 24px" }}>
              <Text style={thanks}>Thank you for your business!</Text>
            </Section>
          )}

          <Text style={footer}>
            Transaction {props.transactionId ?? ""}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={metaValue}>{label}</Text>
      </Column>
      <Column style={{ textAlign: "right" }}>
        <Text style={metaValue}>{value}</Text>
      </Column>
    </Row>
  );
}

export const template = {
  component: ReceiptEmail,
  subject: (data: Record<string, any>) =>
    `Your receipt from ${data.storeName ?? "our store"}`,
  displayName: "Customer receipt",
  previewData: {
    storeName: "Corner Market",
    storeAddress: "123 Main St, Springfield",
    storePhone: "(555) 555-0100",
    currency: "USD",
    receiptNumber: 1042,
    transactionId: "abc12345-6789",
    cashierName: "Jane Doe",
    customerName: "Alex Buyer",
    createdAt: new Date().toISOString(),
    lines: [
      { name: "Coca-Cola 12oz", qty: 2, unit_price: 1.5, line_total: 3.0 },
      { name: "Chips", qty: 1, unit_price: 2.25, line_total: 2.25 },
    ],
    subtotal: 5.25,
    tax: 0.43,
    discount: 0,
    total: 5.68,
    paymentMethod: "card",
    cardBrand: "VISA",
    last4: "4242",
    returnPolicy: "Returns accepted within 14 days with receipt.",
    thankYou: "Thank you for your business!",
  } satisfies ReceiptEmailData,
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" };
const container = { maxWidth: "560px", margin: "0 auto", backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "hidden" };
const header = { padding: "24px 24px 8px 24px", textAlign: "center" as const };
const h1 = { margin: 0, fontSize: "22px", fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" };
const heading2 = { fontSize: "13px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "16px 0 8px 0" };
const muted = { fontSize: "13px", color: "#6b7280", margin: "2px 0" };
const metaLabel = { fontSize: "11px", color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.06em", margin: "0 0 2px 0" };
const metaValue = { fontSize: "14px", color: "#111827", margin: "2px 0" };
const itemName = { fontSize: "14px", color: "#111827", margin: 0, fontWeight: 500 };
const itemMeta = { fontSize: "12px", color: "#6b7280", margin: "2px 0 0 0" };
const itemTotal = { fontSize: "14px", color: "#111827", margin: 0, fontWeight: 500 };
const hr = { borderColor: "#e5e7eb", margin: "16px 0" };
const grandLabel = { fontSize: "16px", color: "#111827", fontWeight: 700, margin: 0 };
const grandValue = { fontSize: "18px", color: "#111827", fontWeight: 700, margin: 0 };
const policy = { fontSize: "12px", color: "#6b7280", textAlign: "center" as const, margin: 0 };
const thanks = { fontSize: "14px", color: "#111827", textAlign: "center" as const, fontWeight: 600, margin: "16px 0" };
const footer = { fontSize: "11px", color: "#9ca3af", textAlign: "center" as const, padding: "0 24px 24px 24px", margin: 0 };
