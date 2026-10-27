import { playLinkInApp } from "@/lib/embeds";
import { splitLinks } from "@/lib/links";

/** Message text with its URLs turned into short, clickable links (videos play in the app). */
export function MessageText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {splitLinks(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={part.url}
            onClick={(e) => playLinkInApp(e, part.url)}
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part.label}
          </a>
        ) : (
          part.value
        )
      )}
    </p>
  );
}
