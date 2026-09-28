"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImage, detectFormat, LARGE_IMAGE_MP, megapixels } from "@/lib/tools/canvas";

export interface SourceImage {
  file: File;
  /** Object URL for previewing the original */
  url: string;
  width: number;
  height: number;
  format: string;
  source: ImageBitmap | HTMLImageElement;
  release: () => void;
}

/**
 * Shared loading state for the image tools: decodes a File, tracks errors and
 * releases bitmaps / object URLs when replaced or unmounted.
 */
export function useSourceImage() {
  const [image, setImage] = useState<SourceImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef<SourceImage | null>(null);

  const dispose = (img: SourceImage | null) => {
    if (!img) return;
    img.release();
    URL.revokeObjectURL(img.url);
  };

  const load = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
      const format = detectFormat(head, file.type);
      const decoded = await decodeImage(file);
      const next: SourceImage = { file, url: URL.createObjectURL(file), width: decoded.width, height: decoded.height, format, source: decoded.source, release: decoded.release };
      dispose(current.current);
      current.current = next;
      setImage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decode this image.");
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    dispose(current.current);
    current.current = null;
    setImage(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => dispose(current.current);
  }, []);

  const tooLarge = image ? megapixels(image.width, image.height) > LARGE_IMAGE_MP : false;
  return { image, error, loading, load, clear, tooLarge };
}

export const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #80808018 25%, transparent 25%), linear-gradient(-45deg, #80808018 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808018 75%), linear-gradient(-45deg, transparent 75%, #80808018 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};
