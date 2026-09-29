import { Flag } from "./Flag";

/** A user's country flag, plus their second country's when they have one. */
export function UserFlags({
  country,
  country2,
  width = 20,
}: {
  country: string;
  country2?: string | null;
  width?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      <Flag code={country} width={width} />
      {country2 && <Flag code={country2} width={width} />}
    </span>
  );
}
