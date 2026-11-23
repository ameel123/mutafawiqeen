import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { requireRole } from "@/lib/auth";

export default async function ParentLayout({ children }: LayoutProps<"/parent">) {
  const user = await requireRole("parent");
  return (
    <div className="bg-dots flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Logo href="/parent" small />
          <nav className="ms-auto flex items-center gap-1 text-sm font-bold">
            <Link href="/parent" className="btn btn-ghost btn-sm">
              أبنائي
            </Link>
            <span className="hidden px-2 text-ink-soft sm:inline">{user.displayName}</span>
            <LogoutButton compact />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
