import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { requireRole } from "@/lib/auth";
import { getStudentProfile } from "@/lib/curriculum";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const user = await requireRole("student");
  const profile = await getStudentProfile(user.id);
  return (
    <div className="bg-dots flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Logo href="/student" small />
          <nav className="ms-auto flex items-center gap-0.5 text-sm font-bold">
            <Link href="/student" className="btn btn-ghost btn-sm">
              دروسي
            </Link>
            <Link href="/student/results" className="btn btn-ghost btn-sm">
              نتائجي
            </Link>
            <Link href="/student/profile" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              {user.displayName} · {profile.gradeName.replace("الابتدائي", "").trim()}
            </Link>
            <LogoutButton compact />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
