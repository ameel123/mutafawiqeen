import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { getUser, homeFor } from "@/lib/auth";

export const metadata = { title: "حساب جديد" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));
  const { role } = await searchParams;
  return (
    <main className="bg-dots flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="mb-5 text-2xl font-extrabold">إنشاء حساب جديد</h1>
          <RegisterForm initialRole={role === "parent" ? "parent" : "student"} />
        </div>
      </div>
    </main>
  );
}
