import { flagUrl } from "@/lib/countries";

export function Flag({
  code,
  width = 20,
  className = "",
}: {
  code: string;
  width?: number;
  className?: string;
}) {
  if (!code) return null;
  return (
    // Tiny static flags from flagcdn — next/image optimisation isn't worth it here
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagUrl(code)}
      alt={code}
      width={width}
      height={Math.round(width * 0.75)}
      className={`rounded-sm object-cover flex-shrink-0 ${className}`}
    />
  );
}
