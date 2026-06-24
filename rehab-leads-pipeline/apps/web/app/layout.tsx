import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rehab Leads Pipeline",
  description: "Apollo-powered lead enrichment for rehabilitation centers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b bg-white px-6 py-4 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-brand-900">
            Rehab Leads Pipeline
          </h1>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
