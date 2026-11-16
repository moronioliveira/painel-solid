import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { getDb } from "@/db";
import { openAlerts } from "@/lib/alerts/sync";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const db = await getDb();
  const alertCount = (await openAlerts(db, user.workspaceId)).length;

  return (
    <div className="min-h-screen">
      <header className="no-print bg-black text-white">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Painel Solid, visão geral">
            <Image src="/simbolo-solid.png" alt="" width={31} height={28} priority />
            <span className="text-[15px] font-semibold tracking-tight">Painel Solid</span>
          </Link>
          <nav className="flex items-center gap-5" aria-label="Principal">
            <NavLink href="/" exact>Visão geral</NavLink>
            <NavLink href="/alertas">
              Alertas
              {alertCount > 0 && (
                <span className="num rounded-full bg-white px-1.5 text-xs leading-5 font-semibold text-black">{alertCount}</span>
              )}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="hidden text-white/65 sm:inline">{user.name}</span>
            <form action={logoutAction}>
              <button type="submit" className="cursor-pointer text-white/65 hover:text-white">Sair</button>
            </form>
          </div>
        </div>
        <div className="brand-rule" />
      </header>
      <main className="mx-auto max-w-[1240px] px-5 py-8">{children}</main>
    </div>
  );
}
