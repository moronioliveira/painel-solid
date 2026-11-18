import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getDb } from "@/db";
import { openAlerts } from "@/lib/alerts/sync";
import { requireUser } from "@/lib/auth/session";
import { getTheme, themeClass } from "@/lib/theme";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const db = await getDb();
  const alertCount = (await openAlerts(db, user.workspaceId)).length;
  const theme = await getTheme();

  return (
    <div id="app-theme" className={`${themeClass(theme)} min-h-screen bg-canvas text-ink`}>
      {/* Faixa preta com a linha laranja da marca, nos dois temas. */}
      <header className="no-print sticky top-0 z-30 bg-black text-white">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 sm:gap-8 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Painel Solid, visão geral">
            <Image src="/simbolo-solid.png" alt="" width={31} height={28} priority />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Painel Solid</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-4 sm:gap-6" aria-label="Principal">
            <NavLink href="/" exact>Visão geral</NavLink>
            <NavLink href="/alertas">
              Alertas
              {alertCount > 0 && (
                <span className="num rounded-full bg-white px-1.5 text-xs leading-5 font-semibold text-black">{alertCount}</span>
              )}
            </NavLink>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm sm:gap-4">
            <ThemeToggle initial={theme} targetId="app-theme" />
            <span className="hidden text-white/65 md:inline">{user.name}</span>
            <form action={logoutAction}>
              <button type="submit" className="tap cursor-pointer px-1 text-white/65 hover:text-white">Sair</button>
            </form>
          </div>
        </div>
        <div className="brand-rule" />
      </header>
      <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
