import Link from "next/link";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="14" fill="#5b46e0" />
      <path d="M12 31.5c4-1.6 8-1.6 12 0v-15c-4-1.6-8-1.6-12 0z" fill="#fff" />
      <path d="M36 31.5c-4-1.6-8-1.6-12 0v-15c4-1.6 8-1.6 12 0z" fill="#e2ddff" />
      <path d="M24 5.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#ffd54d" />
    </svg>
  );
}

export function Logo({ href = "/", small = false }: { href?: string; small?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 whitespace-nowrap font-extrabold text-ink">
      <LogoMark size={small ? 30 : 38} />
      <span className={small ? "text-base sm:text-lg" : "text-xl"}>منصة المتفوقين</span>
    </Link>
  );
}
