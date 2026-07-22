// Real PDF generation for Register Shift Summary on Android.
// Uses jsPDF (fully bundled, no browser print) and Capacitor Filesystem/Share
// for Save/Share flows. Web behavior unchanged (this module is only loaded
// from native-gated code paths).
import { jsPDF } from "jspdf";
import type { ShiftSummary } from "@/lib/shift-summary";

const fmt = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export function buildShiftPdf(d: ShiftSummary): { bytes: Uint8Array; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 40;
  let y = M;

  const title = "SEZA POS — Register Shift Summary";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, M, y); y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${d.store?.name ?? ""}`, M, y); y += 12;
  doc.text(`Shift ${d.session.id.slice(0, 8)} · ${d.session.status}`, M, y); y += 12;
  doc.text(`Employee: ${d.cashier?.full_name ?? d.cashier?.email ?? "—"}`, M, y); y += 12;
  doc.text(`Register: ${d.terminal?.label ?? "Default"}`, M, y); y += 12;
  doc.text(`Opened: ${new Date(d.session.opened_at).toLocaleString()}`, M, y); y += 12;
  doc.text(`Closed: ${d.session.closed_at ? new Date(d.session.closed_at).toLocaleString() : "In progress"}`, M, y); y += 12;
  doc.text(`Duration: ${Math.floor(d.durationMin / 60)}h ${d.durationMin % 60}m`, M, y); y += 20;

  const row = (label: string, value: string) => {
    doc.text(label, M, y);
    doc.text(value, 520, y, { align: "right" });
    y += 14;
  };
  const section = (heading: string) => {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(heading, M, y); y += 14;
    doc.setFont("helvetica", "normal");
  };

  section("Sales");
  row("Transactions", String(d.salesSummary.totalTx));
  row("Gross sales", fmt(d.salesSummary.grossSales));
  row("Discounts", fmt(d.salesSummary.totalDiscount));
  row("Tax", fmt(d.salesSummary.totalTax));
  row("Net sales", fmt(d.salesSummary.netSales));
  row("Voided", String(d.voidedSales.length));

  section("Payments");
  for (const [k, v] of Object.entries(d.paymentSummary.byMethod)) row(k, fmt(v as number));
  row("Grand total", fmt(d.paymentSummary.grandTotal));

  section("Cash reconciliation");
  row("Opening cash", fmt(d.session.opening_cash ?? 0));
  row("Cash sales", fmt(d.session.cash_sales ?? 0));
  row("Cash refunds", `-${fmt(d.session.cash_refunds ?? 0)}`);
  row("Safe drops", `-${fmt(d.safeDropTotal)}`);
  row("Expected in drawer", fmt(d.session.expected_cash ?? 0));
  row("Counted", d.session.closing_cash != null ? fmt(d.session.closing_cash) : "—");
  if (d.session.closing_cash != null) {
    const variance = Number(d.session.closing_cash) - Number(d.session.expected_cash ?? 0);
    row("Over / short", (variance > 0 ? "+" : "") + fmt(variance));
  }

  section("Refunds");
  row("Refund amount", fmt(d.refundSummary.refundAmount));
  row("Refund count", String(d.refundSummary.refundCount));
  row("Voids", String(d.refundSummary.voidCount));

  y += 20;
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()} · SEZA POS`, M, y);

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const safe = (s: string) => (s || "shift").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 32);
  const dateStr = new Date(d.session.opened_at).toISOString().slice(0, 10);
  const filename = `SEZA-Shift-${safe(d.store?.name ?? "store")}-${dateStr}-${d.session.id.slice(0, 6)}.pdf`;
  return { bytes, filename };
}

/**
 * Save the PDF to Documents/ on the device and offer the system share sheet.
 * Falls back to a Blob download on non-native platforms so callers can reuse
 * this function safely, but is intended for the APK path.
 */
export async function saveAndSharePdf(d: ShiftSummary): Promise<{ ok: true; uri?: string } | { ok: false; error: string }> {
  const { bytes, filename } = buildShiftPdf(d);
  try {
    const [{ Filesystem, Directory }, { Share }, { Capacitor }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
      import("@capacitor/core"),
    ]);
    if (!Capacitor.isNativePlatform?.()) {
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    }
    // Chunked base64 encode — String.fromCharCode(...large) blows the stack.
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    }
    const base64 = btoa(bin);
    const write = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await Share.share({
        title: "Shift Summary",
        text: `Shift ${d.session.id.slice(0, 8)}`,
        url: write.uri,
        dialogTitle: "Share shift summary",
      });
    } catch { /* user cancelled share — file is still saved */ }
    return { ok: true, uri: write.uri };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "PDF could not be generated." };
  }
}
