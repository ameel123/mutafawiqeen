"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      }}
      aria-label="تسجيل الخروج"
    >
      <LogOut size={16} />
      {!compact && <span>خروج</span>}
    </button>
  );
}
