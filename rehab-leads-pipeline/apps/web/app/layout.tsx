import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { SidebarNav } from "@/components/SidebarNav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Rehab Leads Pipeline",
  description: "Apollo-powered lead enrichment for rehabilitation centers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-gray-900 antialiased font-sans">
        <SidebarNav />
        {/* Offset main content to clear the sidebar */}
        <main className="ml-16 xl:ml-60 min-h-screen transition-all duration-200">
          <div className="p-6">{children}</div>
        </main>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
