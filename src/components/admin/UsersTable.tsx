"use client";

import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { ErrorText, useAction } from "./ui";

type U = {
  id: number;
  login: string;
  displayName: string;
  role: "student" | "parent" | "admin";
  createdAt: Date;
  grade: number | null;
  linkCode: string | null;
  attempts: number;
  children: number;
};

const ROLE = { student: "طالب", parent: "ولي أمر", admin: "مشرف" };
const GRADES = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

export function UsersTable({ users, meId }: { users: U[]; meId: number }) {
  const { error, run } = useAction();
  const [pw, setPw] = useState<{ id: number; value: string } | null>(null);
  const patch = (body: object) => run(() => api("/api/admin/users", { method: "PATCH", body }));

  return (
    <div className="card overflow-hidden">
      <div className="p-3">
        <ErrorText error={error} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">اسم المستخدم</th>
              <th className="p-3">الدور</th>
              <th className="p-3">الصف</th>
              <th className="p-3">نشاط</th>
              <th className="p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="p-3 font-bold">{u.displayName}</td>
                <td className="p-3" dir="ltr">
                  {u.login}
                </td>
                <td className="p-3 text-center">
                  <select
                    className="input !w-auto !py-1"
                    value={u.role}
                    disabled={u.id === meId}
                    onChange={(e) => patch({ id: u.id, role: e.target.value })}
                    aria-label="الدور"
                  >
                    {Object.entries(ROLE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3 text-center">
                  {u.role === "student" ? (
                    <select
                      className="input !w-auto !py-1"
                      value={u.grade ?? 1}
                      onChange={(e) => patch({ id: u.id, gradeNumber: Number(e.target.value) })}
                      aria-label="الصف"
                    >
                      {GRADES.map((g, i) => (
                        <option key={g} value={i + 1}>
                          {g}
                        </option>
                      ))}
                    </select>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 text-center text-ink-soft">
                  {u.role === "student" ? `${u.attempts} اختبار · رمز ${u.linkCode}` : u.role === "parent" ? `${u.children} أبناء` : ""}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    {pw?.id === u.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await patch({ id: u.id, password: pw.value })) setPw(null);
                        }}
                      >
                        <input
                          className="input !w-32 !py-1"
                          dir="ltr"
                          minLength={6}
                          placeholder="كلمة جديدة"
                          value={pw.value}
                          onChange={(e) => setPw({ id: u.id, value: e.target.value })}
                          aria-label="كلمة المرور الجديدة"
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm">حفظ</button>
                      </form>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setPw({ id: u.id, value: "" })}>
                        <KeyRound size={14} /> كلمة المرور
                      </button>
                    )}
                    {u.id !== meId && (
                      <button
                        className="btn btn-ghost btn-sm !p-1.5 text-coral-700"
                        aria-label="حذف المستخدم"
                        onClick={() => confirm(`حذف حساب ${u.displayName} وكل نتائجه؟`) && run(() => api("/api/admin/users", { method: "DELETE", body: { id: u.id } }))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
