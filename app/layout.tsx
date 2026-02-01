import "./globals.css";

export const metadata = { title: "NHS Procurement Alerts", description: "Contracts Finder + Find a Tender aggregator" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </body>
    </html>
  );
}
