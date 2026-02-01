import "./globals.css";

export const metadata = { title: "NHS Procurement Alerts", description: "Contracts Finder + Find a Tender aggregator" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen">
        <div className="mx-auto max-w-9xl p-6">{children}</div>
      </body>
    </html>
  );
}
