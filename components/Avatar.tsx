import { avatarUrl } from "@/lib/api";
import { nameColor } from "@/lib/format";

type AvatarUser = { id: string; pseudo: string; avatar_id?: string | null };

/** Profile picture, or the pseudo's initial when there isn't one. */
export function Avatar({ user, size = 32, className = "" }: { user: AvatarUser; size?: number; className?: string }) {
  const style = { width: size, height: size };

  if (user.avatar_id) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images
      <img
        src={avatarUrl(user.avatar_id)}
        alt=""
        width={size}
        height={size}
        style={style}
        draggable={false}
        className={`rounded-full object-cover flex-shrink-0 bg-neutral-800 ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      className={`rounded-full flex-shrink-0 flex items-center justify-center bg-neutral-800 font-semibold uppercase select-none ${nameColor(user.id)} ${className}`}
    >
      {user.pseudo.charAt(0)}
    </span>
  );
}
