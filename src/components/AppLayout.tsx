import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("sidebar:expanded") !== "false");
  const showSidebar = !loading && Boolean(user);
  const isPublicHome = location.pathname === "/" && !user;

  useEffect(() => {
    localStorage.setItem("sidebar:expanded", String(sidebarOpen));
  }, [sidebarOpen]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="dashboard-shell flex min-h-screen w-full">
        {showSidebar ? <AppSidebar /> : null}
        <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 soft-grid opacity-[0.08]" />
          <header
            className={`z-20 ${
              isPublicHome
                ? "absolute inset-x-0 top-0 border-none bg-transparent"
                : "sticky top-0 border-b border-border/50 bg-background/80 backdrop-blur-md"
            }`}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
              <div className="flex items-center gap-3">
                {showSidebar ? <SidebarTrigger className="md:hidden" /> : null}
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main
            className={`relative flex-1 ${
              isPublicHome
                ? "flex min-h-screen items-center justify-center px-4 py-8 md:px-6"
                : "px-3 py-3 md:px-5 md:py-5"
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
