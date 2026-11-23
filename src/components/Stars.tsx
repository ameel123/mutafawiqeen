export function Stars({ n, size = 36 }: { n: number; size?: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label={`${n} من 3 نجوم`}>
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={i < n ? "animate-pop" : ""}
          style={{ animationDelay: `${i * 140}ms` }}
          aria-hidden
        >
          <path
            d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"
            fill={i < n ? "#ffd54d" : "#ece4d3"}
            stroke={i < n ? "#f5b100" : "#ddd3bf"}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-mint-500 transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
