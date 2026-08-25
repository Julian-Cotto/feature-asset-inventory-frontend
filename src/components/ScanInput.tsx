import { useEffect, useRef, useState } from "react";

import CameraScanner from "./CameraScanner";

const UPLOAD_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "data_matrix",
  "aztec",
  "pdf417",
];

async function ensureBarcodeDetector(): Promise<void> {
  if (typeof window.BarcodeDetector === "function") return;
  await import("barcode-detector/polyfill");
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onScan?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
  /** Bump this number to imperatively re-focus + select the input — used by
   *  batch intake to return the cursor to the scanner after each save. */
  refocusToken?: number;
}

export default function ScanInput({
  value,
  onChange,
  onScan,
  placeholder = "Scan or type serial",
  autoFocus = true,
  label = "Serial number",
  refocusToken,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const skipAutoFocus = () => {
    // Skip auto-focus on touch / narrow viewports — pops the soft keyboard
    // before the user has a chance to pick Camera or Upload image.
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 639px)").matches
    );
  };

  useEffect(() => {
    if (!autoFocus) return;
    if (skipAutoFocus()) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  // Imperative re-focus for batch flows (refocusToken changes per save).
  useEffect(() => {
    if (refocusToken === undefined || refocusToken === 0) return;
    if (skipAutoFocus()) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [refocusToken]);

  const accept = (text: string) => {
    onChange(text);
    onScan?.(text);
  };

  const handleUpload = async (file: File) => {
    setFileError(null);
    try {
      await ensureBarcodeDetector();
      const bitmap = await createImageBitmap(file);
      try {
        const detector = new window.BarcodeDetector!({ formats: UPLOAD_FORMATS });
        const codes = await detector.detect(bitmap);
        if (codes.length === 0) {
          throw new Error("No barcode or QR code found in image.");
        }
        accept(codes[0].rawValue);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      setFileError(
        err instanceof Error
          ? err.message
          : "Could not decode a code from that image",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="cluster">
        <input
          ref={inputRef}
          className="input input-mono flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onScan && value.trim()) {
              e.preventDefault();
              onScan(value.trim());
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowCamera(true)}
        >
          Camera
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileRef.current?.click()}
        >
          Upload image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
      </div>
      {fileError && <div className="alert alert-error">{fileError}</div>}
      {showCamera && (
        <CameraScanner
          onResult={(text) => {
            setShowCamera(false);
            accept(text);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
