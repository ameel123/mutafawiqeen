import Link from "next/link";
import { BookOpen, LayoutDashboard, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { requireRole } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/admin/subjects", label: "المواد والكتب", icon: BookOpen },
  { href: "/admin/users", label: "المستخدمون", icon: Users },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole("admin");
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#f7f6fb]">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Logo href="/admin" small />
          <span className="badge bg-ink text-white">الإدارة</span>
          <nav className="ms-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="btn btn-ghost btn-sm">
                <n.icon size={16} /> {n.label}
              </Link>
            ))}
          </nav>
          <span className="ms-auto hidden text-sm text-ink-soft sm:inline">{user.displayName}</span>
          <LogoutButton compact />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 py-1 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="btn btn-ghost btn-sm shrink-0">
              <n.icon size={15} /> {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
