"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  uploadAttachment,
  type Attachment,
} from "./api";
import { prepareImage } from "./images";

export type PendingUpload = {
  key: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
  error?: string;
};

/**
 * Composer attachments: each picked image is prepared and uploaded right away,
 * so sending only has to reference the uploaded ids.
 */
export function useAttachmentUploads(roomId: string, onError: (message: string) => void) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const uploadsRef = useRef<PendingUpload[]>([]);
  const objectUrlsRef = useRef(new Set<string>());
  const keyRef = useRef(0);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // previews stay in use by sent messages, so only release them on leave
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const update = useCallback((key: string, patch: Partial<PendingUpload>) => {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
      if (images.length < files.length) {
        onError("Only JPEG, PNG, GIF and WebP images can be sent.");
      }
      const room = MAX_ATTACHMENTS_PER_MESSAGE - uploadsRef.current.length;
      if (images.length > room) {
        onError(`You can send up to ${MAX_ATTACHMENTS_PER_MESSAGE} images at once.`);
      }

      for (const file of images.slice(0, Math.max(0, room))) {
        keyRef.current += 1;
        const key = `upload-${keyRef.current}`;
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        const pending: PendingUpload = { key, previewUrl, status: "uploading" };
        uploadsRef.current = [...uploadsRef.current, pending];
        setUploads((prev) => [...prev, pending]);

        (async () => {
          try {
            const blob = await prepareImage(file);
            if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large (max 10 MB).");
            const attachment = await uploadAttachment(roomId, blob, file.name || "image");
            update(key, { status: "done", attachment });
          } catch (err) {
            update(key, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
          }
        })();
      }
    },
    [roomId, onError, update]
  );

  const remove = useCallback((key: string) => {
    const upload = uploadsRef.current.find((u) => u.key === key);
    if (upload) {
      URL.revokeObjectURL(upload.previewUrl);
      objectUrlsRef.current.delete(upload.previewUrl);
    }
    setUploads((prev) => prev.filter((u) => u.key !== key));
  }, []);

  /** Hands the uploaded attachments (with their previews) to a message and clears the composer. */
  const take = useCallback(() => {
    const ready = uploadsRef.current
      .filter((u) => u.status === "done" && u.attachment)
      .map((u) => ({ ...u.attachment!, preview_url: u.previewUrl }));
    uploadsRef.current = [];
    setUploads([]);
    return ready;
  }, []);

  return {
    uploads,
    addFiles,
    remove,
    take,
    /** uploads still in flight or failed: sending waits until they're resolved */
    blocked: uploads.some((u) => u.status !== "done"),
    ready: uploads.filter((u) => u.status === "done").length,
  };
}
