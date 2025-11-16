export const metadata = { title: "NHS Procurement Alerts", description: "Contracts Finder + Find a Tender aggregator" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", background: "#0b1220", color: "white" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>{children}</div>
      </body>
    </html>
  );
}
