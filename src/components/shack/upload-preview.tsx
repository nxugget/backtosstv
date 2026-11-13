"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { shackFileInputClass } from "@/components/shack/styles";

interface UploadPreviewProps {
  accept: string;
  /** Renders the preview as a circle instead of the default square. */
  circle?: boolean;
  /** The image already on file, shown until a new one is chosen. */
  currentUrl: string | null;
  id: string;
  name: string;
  /** Marks the file input required, so the form cannot be submitted without one. */
  required?: boolean;
}

/**
 * A file input with a live preview of the chosen image. The preview is a local object URL, so it
 * never leaves the browser before the form is submitted.
 */
export function UploadPreview({
  accept,
  circle = false,
  currentUrl,
  id,
  name,
  required = false,
}: UploadPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  const shown = objectUrl ?? currentUrl;

  return (
    <div className="flex flex-col gap-2">
      {shown === null ? (
        <span className="flex h-24 w-24 items-center justify-center border border-dashed border-edge-soft bg-panel/40 text-center text-xs text-ink-faint">
          No image
        </span>
      ) : (
        <Image
          alt=""
          className={`h-24 w-24 shrink-0 object-cover ${circle ? "rounded-full" : "rounded"}`}
          height={96}
          src={shown}
          unoptimized
          width={96}
        />
      )}

      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        className={shackFileInputClass}
        required={required}
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file === undefined) {
            return;
          }

          setObjectUrl(URL.createObjectURL(file));
        }}
      />
    </div>
  );
}
