import { SidebarNav } from "@/components/SidebarNav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <SidebarNav userEmail={user?.email} />
      <main className="ml-16 xl:ml-60 min-h-screen transition-all duration-200">
        <div className="p-6">{children}</div>
      </main>
    </>
  );
}
