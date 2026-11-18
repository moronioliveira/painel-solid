"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href || path.startsWith("/clientes") : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-14 items-center gap-2 border-b-2 px-1 text-sm font-medium whitespace-nowrap ${
        active ? "border-brand text-white" : "border-transparent text-white/65 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
