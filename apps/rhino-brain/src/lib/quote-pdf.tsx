import "server-only";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type QuotePdfItem = { description: string; sizeSku?: string | null; brand?: string | null; quantity: number; unitPrice: number; lineTotal: number };
export type QuotePdfData = {
  quoteNumber: string; quoteDate: string; expiration?: string | null;
  company: string; companyPhone?: string | null; companyEmail?: string | null;
  customerName: string; contactPerson?: string | null; address?: string | null; customerContact?: string | null;
  items: QuotePdfItem[]; total: number; notes?: string | null; repName?: string | null;
  competitor?: string | null; competitorPrice?: number | null;
};

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1e293b", fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 10 },
  company: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0a1526" },
  sub: { fontSize: 8, color: "#64748b", marginTop: 2 },
  quoteWord: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0f172a", textAlign: "right" },
  meta: { fontSize: 9, color: "#475569", textAlign: "right", marginTop: 2 },
  label: { fontSize: 8, color: "#94a3b8", textTransform: "uppercase", marginTop: 16 },
  billName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 5 },
  th: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#cbd5e1", paddingBottom: 5, marginTop: 18 },
  cDesc: { flex: 3 }, cSize: { flex: 2 }, cBrand: { flex: 1.5 }, cQty: { flex: 1, textAlign: "right" }, cUnit: { flex: 1.3, textAlign: "right" }, cTot: { flex: 1.4, textAlign: "right" },
  thText: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalBox: { width: 200, borderTopWidth: 2, borderTopColor: "#0f172a", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 20, fontSize: 9, color: "#475569" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6, fontSize: 8, color: "#94a3b8" },
});

function QuoteDoc({ d }: { d: QuotePdfData }) {
  return (
    <Document title={`Quote ${d.quoteNumber}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.company}>{d.company}</Text>
            <Text style={s.sub}>{[d.companyPhone, d.companyEmail].filter(Boolean).join("  ·  ")}</Text>
          </View>
          <View>
            <Text style={s.quoteWord}>QUOTE</Text>
            <Text style={s.meta}>{d.quoteNumber}</Text>
            <Text style={s.meta}>Date: {d.quoteDate}</Text>
            {d.expiration ? <Text style={s.meta}>Valid until: {d.expiration}</Text> : null}
          </View>
        </View>

        <Text style={s.label}>Prepared for</Text>
        <Text style={s.billName}>{d.customerName}</Text>
        {d.contactPerson ? <Text style={{ color: "#475569" }}>Attn: {d.contactPerson}</Text> : null}
        {d.address ? <Text style={{ color: "#64748b" }}>{d.address}</Text> : null}
        {d.customerContact ? <Text style={{ color: "#64748b" }}>{d.customerContact}</Text> : null}

        <View style={s.th}>
          <Text style={[s.cDesc, s.thText]}>Description</Text>
          <Text style={[s.cSize, s.thText]}>Size / SKU</Text>
          <Text style={[s.cBrand, s.thText]}>Brand</Text>
          <Text style={[s.cQty, s.thText]}>Qty</Text>
          <Text style={[s.cUnit, s.thText]}>Unit</Text>
          <Text style={[s.cTot, s.thText]}>Line Total</Text>
        </View>
        {d.items.map((it, i) => (
          <View style={s.row} key={i}>
            <Text style={s.cDesc}>{it.description}</Text>
            <Text style={s.cSize}>{it.sizeSku ?? "—"}</Text>
            <Text style={s.cBrand}>{it.brand ?? "—"}</Text>
            <Text style={s.cQty}>{it.quantity}</Text>
            <Text style={s.cUnit}>{money(it.unitPrice)}</Text>
            <Text style={s.cTot}>{money(it.lineTotal)}</Text>
          </View>
        ))}

        <View style={s.totalRow}>
          <View style={s.totalBox}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalLabel}>{money(d.total)}</Text>
          </View>
        </View>
        {d.competitor && d.competitorPrice != null ? (
          <Text style={{ textAlign: "right", fontSize: 8, color: "#94a3b8", marginTop: 3 }}>vs {d.competitor}: {money(d.competitorPrice)}</Text>
        ) : null}

        {d.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text style={{ marginTop: 2 }}>{d.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          Prepared by {d.repName ?? ""} · {d.company}. Prices subject to stock availability. Thank you for your business.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateQuotePdf(d: QuotePdfData): Promise<Buffer> {
  return renderToBuffer(<QuoteDoc d={d} />);
}
