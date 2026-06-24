"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",  href: "/"            },
  { icon: PlusCircle,      label: "New Batch",  href: "/batches/new" },
  { icon: Settings,        label: "Settings",   href: "/settings"    },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen bg-navy flex flex-col z-30 w-16 xl:w-60 transition-all duration-200">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 h-16">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">R</span>
        </div>
        <span className="hidden xl:block text-white font-bold text-sm leading-tight">
          Rehab Leads<br />Pipeline
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
        {navItems.map(({ icon: Icon, label, href }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "xl:justify-start justify-center",
                isActive
                  ? "bg-white text-navy"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="hidden xl:block">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Version */}
      <div className="hidden xl:block px-4 py-3 border-t border-white/10">
        <p className="text-white/40 text-xs">v0.0.1</p>
      </div>
    </aside>
  );
}
