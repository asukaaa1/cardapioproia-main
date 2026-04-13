import {
  CreditCard,
  Home,
  Image,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  TrendingUp,
  Upload,
  User,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { maskEmail } from "@/lib/privacy";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Início", url: "/", icon: Home },
  { title: "Melhorar Fotos", url: "/melhorar", icon: Upload },
  { title: "Galeria", url: "/minhas-fotos", icon: Image },
];

const affiliateItems = [
  { title: "Afiliados", url: "/afiliacao", icon: TrendingUp },
];

const publicItems = [
  { title: "Início", url: "/", icon: Home },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const visibleMainItems = user ? mainItems : publicItems;

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="border-none bg-transparent p-3 group-data-[collapsible=icon]:p-2"
    >
      <SidebarContent className="dashboard-panel overflow-hidden bg-sidebar/94">
        <div className="relative border-b border-sidebar-border/70 px-4 py-5 group-data-[collapsible=icon]:px-2">
          <Link
            to="/"
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3 pr-9"}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            {!collapsed && (
              <div>
                <p className="font-display text-lg font-bold tracking-tight text-foreground">
                  Cardápio <span className="text-primary">Pro IA</span>
                </p>
                <p className="text-xs text-muted-foreground">Estúdio visual para delivery</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className={`absolute hidden h-9 w-9 items-center justify-center rounded-xl border border-sidebar-border/70 bg-background/50 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground md:flex ${
              collapsed ? "left-1/2 top-[4.25rem] -translate-x-1/2" : "right-4 top-5"
            }`}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <SidebarGroup className={`px-2 pb-1 ${collapsed ? "pt-14" : "pt-3"}`}>
          <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground/60 font-semibold group-data-[collapsible=icon]:sr-only">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    className="h-auto p-0 hover:bg-transparent"
                  >
                    <NavLink
                      to={item.url}
                      end
                      title={collapsed ? item.title : undefined}
                      className={`group flex items-center rounded-xl border border-transparent text-sidebar-foreground ${
                        collapsed ? "h-11 justify-center px-0 py-0" : "gap-3 px-3 py-2.5"
                      }`}
                      activeClassName="is-active bg-sidebar-accent/70 text-foreground"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/25 text-muted-foreground group-[.is-active]:text-primary">
                        <item.icon className="h-4.5 w-4.5" />
                      </div>
                      {!collapsed && (
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Afiliado */}
        {user && (
          <SidebarGroup className="px-2 pt-0 pb-2 -mt-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {affiliateItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      className="h-auto p-0 hover:bg-transparent"
                    >
                      <NavLink
                        to={item.url}
                        end
                        title={collapsed ? item.title : undefined}
                        className={`group flex items-center rounded-xl border border-transparent text-sidebar-foreground ${
                          collapsed ? "h-11 justify-center px-0 py-0" : "gap-3 px-3 py-2.5"
                        }`}
                        activeClassName="is-active bg-sidebar-accent/70 text-foreground"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/25 text-muted-foreground group-[.is-active]:text-primary">
                          <item.icon className="h-4.5 w-4.5" />
                        </div>
                        {!collapsed && (
                          <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer: user info + logout */}
      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full rounded-xl border border-sidebar-border/70 bg-background/60 p-3 text-left transition-all hover:bg-background/80 ${
                  collapsed ? "flex h-12 items-center justify-center p-0" : "flex items-center gap-3"
                }`}
                title={collapsed ? user.email ?? "Minha conta" : undefined}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <User className="h-4.5 w-4.5 text-primary" />
                </div>
                {!collapsed && (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sidebar-foreground">
                        {user.user_metadata?.full_name ?? user.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{maskEmail(user.email)}</p>
                    </div>
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="w-56 rounded-2xl border-border/70 bg-popover/95 p-2 backdrop-blur-xl"
            >
              <div className="px-2 py-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {user.user_metadata?.full_name ?? "Minha conta"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{maskEmail(user.email)}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-xl px-3 py-2.5" onSelect={() => navigate("/perfil")}>
                <User className="mr-2 h-4 w-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-3 py-2.5" onSelect={() => navigate("/plano")}>
                <CreditCard className="mr-2 h-4 w-4" />
                Meu Plano
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl px-3 py-2.5" onSelect={() => navigate("/configuracoes")}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="rounded-xl px-3 py-2.5 text-destructive focus:text-destructive"
                onSelect={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className={`rounded-xl border border-dashed border-sidebar-border/80 bg-background/50 ${collapsed ? "p-2" : "space-y-3 p-4"}`}>
            {!collapsed && (
              <>
                <p className="text-sm font-semibold text-foreground">Entre na sua conta</p>
                <p className="text-xs text-muted-foreground">
                  Salve histórico, personalize prompts e mantenha suas fotos organizadas.
                </p>
              </>
            )}
            <NavLink
              to="/login"
              end
              className={`flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary text-primary-foreground transition-all hover:bg-primary/90 ${
                collapsed ? "h-10 w-10" : "px-3 py-2.5"
              }`}
              activeClassName="bg-primary text-primary-foreground"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-sm">Entrar</span>}
            </NavLink>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
