import { gzipSync } from "node:zlib";
import data from "emojibase-data/en/data.json";
import messages from "emojibase-data/en/messages.json";
import pkg from "emojibase-data/package.json";

// The emoji picker's dataset, served from our own origin instead of a public
// CDN. Prerendered at build time, so it's just two static files.
export const dynamic = "force-static";
export const dynamicParams = false;

const FILES: Record<string, unknown> = {
  "data.json": data,
  "messages.json": messages,
};

export function generateStaticParams() {
  return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const body = FILES[file];
  if (!body) return new Response("Not found", { status: 404 });

  // gzipped here (once, at build time) since prerendered responses aren't
  // compressed by the server: ~775 KB of emoji data becomes ~100 KB
  return new Response(gzipSync(JSON.stringify(body)), {
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Cache-Control": "public, max-age=86400",
      // the picker revalidates its local cache against this
      ETag: `"emojibase-${pkg.version}-${file}"`,
    },
  });
}
