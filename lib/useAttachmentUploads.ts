"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  MAX_VIDEO_BYTES,
  uploadAttachment,
  type Attachment,
} from "./api";
import { prepareImage } from "./images";
import { isVideoFile, prepareVideo } from "./media";

export type PendingUpload = {
  key: string;
  kind: "image" | "video";
  /** local blob URL of the picked file */
  previewUrl: string;
  /** videos: local blob URL of the poster frame, once it's been captured */
  posterUrl?: string;
  status: "uploading" | "done" | "error";
  /** fraction of the file sent so far (0–1) */
  progress?: number;
  attachment?: Attachment;
  error?: string;
};

/**
 * Composer attachments: each picked photo or video is prepared and uploaded
 * right away, so sending only has to reference the uploaded ids.
 */
export function useAttachmentUploads(roomId: string, onError: (message: string) => void) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const uploadsRef = useRef<PendingUpload[]>([]);
  const objectUrlsRef = useRef(new Set<string>());
  const abortsRef = useRef(new Map<string, AbortController>());
  const keyRef = useRef(0);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // previews stay in use by sent messages, so only release them on leave;
  // uploads still in flight are dropped too (a large video can take a while)
  useEffect(() => {
    const urls = objectUrlsRef.current;
    const aborts = abortsRef.current;
    return () => {
      aborts.forEach((controller) => controller.abort());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const update = useCallback((key: string, patch: Partial<PendingUpload>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }, []);

  const objectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type) || isVideoFile(f));
      if (accepted.length < files.length) {
        onError("Only photos (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, WebM) can be sent.");
      }
      const room = MAX_ATTACHMENTS_PER_MESSAGE - uploadsRef.current.length;
      if (accepted.length > room) {
        onError(`You can send up to ${MAX_ATTACHMENTS_PER_MESSAGE} photos or videos at once.`);
      }

      for (const file of accepted.slice(0, Math.max(0, room))) {
        keyRef.current += 1;
        const key = `upload-${keyRef.current}`;
        const kind = isVideoFile(file) ? "video" : "image";
        const pending: PendingUpload = { key, kind, previewUrl: objectUrl(file), status: "uploading" };
        uploadsRef.current = [...uploadsRef.current, pending];
        setUploads((prev) => [...prev, pending]);

        const controller = new AbortController();
        abortsRef.current.set(key, controller);
        // a re-render per percent, not per network event
        let percent = -1;
        const onProgress = (progress: number) => {
          const next = Math.floor(progress * 100);
          if (next === percent) return;
          percent = next;
          update(key, { progress });
        };

        (async () => {
          try {
            let attachment: Attachment;
            if (kind === "video") {
              if (file.size > MAX_VIDEO_BYTES) throw new Error("Video is too large (max 100 MB).");
              const { poster, durationMs } = await prepareVideo(file);
              if (poster) update(key, { posterUrl: objectUrl(poster) });
              attachment = await uploadAttachment(roomId, file, file.name || "video", {
                poster,
                durationMs,
                onProgress,
                signal: controller.signal,
              });
            } else {
              const blob = await prepareImage(file);
              if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large (max 10 MB).");
              attachment = await uploadAttachment(roomId, blob, file.name || "image", {
                onProgress,
                signal: controller.signal,
              });
            }
            update(key, { status: "done", attachment });
          } catch (err) {
            if (controller.signal.aborted) return;
            update(key, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
          } finally {
            abortsRef.current.delete(key);
          }
        })();
      }
    },
    [roomId, onError, update, objectUrl]
  );

  /** Uploads a photo straight away, outside the composer (the camera's Send). */
  const uploadNow = useCallback(
    async (file: File) => {
      const blob = await prepareImage(file);
      if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large (max 10 MB).");
      const attachment = await uploadAttachment(roomId, blob, file.name || "photo.jpg");
      return { ...attachment, preview_url: objectUrl(blob) };
    },
    [roomId, objectUrl]
  );

  const remove = useCallback((key: string) => {
    abortsRef.current.get(key)?.abort();
    const upload = uploadsRef.current.find((u) => u.key === key);
    for (const url of [upload?.previewUrl, upload?.posterUrl]) {
      if (!url) continue;
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
    }
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  /** Hands the uploaded attachments (with their previews) to a message and clears the composer. */
  const take = useCallback(() => {
    const ready = uploadsRef.current
      .filter((u) => u.status === "done" && u.attachment)
      .map((u) => ({ ...u.attachment!, preview_url: u.previewUrl, poster_preview_url: u.posterUrl }));
    uploadsRef.current = [];
    setUploads([]);
    return ready;
  }, []);

  return {
    uploads,
    addFiles,
    uploadNow,
    remove,
    take,
    /** uploads still in flight or failed: sending waits until they're resolved */
    blocked: uploads.some((u) => u.status !== "done"),
    ready: uploads.filter((u) => u.status === "done").length,
  };
}
