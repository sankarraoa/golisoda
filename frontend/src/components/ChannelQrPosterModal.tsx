import { useCallback, useEffect, useRef, useState } from "react";

import { jsPDF } from "jspdf";

import { fetchChannelQrPngBlob, getStoredAccessToken } from "../lib/adminApi";
import type { Channel } from "../types/admin";

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function pngBlobToJpegBlob(pngBlob: Blob, quality = 0.92): Promise<Blob> {
  const bitmap = await createImageBitmap(pngBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not create image export.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("JPEG export failed."));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

async function saveQrPdf(pngBlob: Blob, basename: string): Promise<void> {
  const dataUrl = await blobToDataURL(pngBlob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read QR for PDF."));
    img.src = dataUrl;
  });
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const pad = 48;
  const pdf = new jsPDF({
    orientation: iw >= ih ? "landscape" : "portrait",
    unit: "px",
    format: [iw + pad * 2, ih + pad * 2],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(dataUrl, "PNG", pad, pad, iw, ih);
  pdf.save(`${basename}.pdf`);
}

export function ChannelQrPosterModal({
  channel,
  tenantId,
  onClose,
}: {
  channel: Channel;
  tenantId: string;
  onClose: () => void;
}) {
  const qrBlobUrlRef = useRef<string | null>(null);
  const qrPngBlobRef = useRef<Blob | null>(null);
  const [qrObjectUrl, setQrObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<"png" | "jpeg" | "pdf" | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setLoadError("Please sign in again.");
      return undefined;
    }
    setQrObjectUrl(null);
    qrPngBlobRef.current = null;
    setLoadError(null);
    let cancelled = false;
    fetchChannelQrPngBlob(token, tenantId, channel.id)
      .then((blob: Blob) => {
        if (cancelled) {
          return;
        }
        qrPngBlobRef.current = blob;
        const nextUrl = URL.createObjectURL(blob);
        if (qrBlobUrlRef.current) {
          URL.revokeObjectURL(qrBlobUrlRef.current);
        }
        qrBlobUrlRef.current = nextUrl;
        setQrObjectUrl(nextUrl);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not load QR code.");
      });
    return () => {
      cancelled = true;
      if (qrBlobUrlRef.current) {
        URL.revokeObjectURL(qrBlobUrlRef.current);
        qrBlobUrlRef.current = null;
      }
      qrPngBlobRef.current = null;
    };
  }, [tenantId, channel.id]);

  const baseName = channel.channel_code;

  const downloadPng = useCallback(() => {
    const blob = qrPngBlobRef.current;
    if (!blob) {
      return;
    }
    setExportError(null);
    setExportKind("png");
    try {
      triggerBlobDownload(blob, `${baseName}.png`);
    } catch {
      setExportError("Could not download PNG.");
    } finally {
      setExportKind(null);
    }
  }, [baseName]);

  const downloadJpeg = useCallback(async () => {
    const blob = qrPngBlobRef.current;
    if (!blob) {
      return;
    }
    setExportError(null);
    setExportKind("jpeg");
    try {
      const jpegBlob = await pngBlobToJpegBlob(blob);
      triggerBlobDownload(jpegBlob, `${baseName}.jpg`);
    } catch {
      setExportError("Could not create JPEG.");
    } finally {
      setExportKind(null);
    }
  }, [baseName]);

  const downloadPdf = useCallback(async () => {
    const blob = qrPngBlobRef.current;
    if (!blob) {
      return;
    }
    setExportError(null);
    setExportKind("pdf");
    try {
      await saveQrPdf(blob, baseName);
    } catch {
      setExportError("Could not create PDF.");
    } finally {
      setExportKind(null);
    }
  }, [baseName]);

  const isExporting = exportKind !== null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal modal--wide channel-qr-modal"
        role="dialog"
        aria-labelledby="channel-qr-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title" id="channel-qr-modal-title">
          QR code
        </h2>
        <p className="channel-qr-modal-lead">{channel.name}</p>
        <div className="modal-body channel-qr-modal-body">
          {loadError ? <div className="field-error-msg">{loadError}</div> : null}
          {!loadError && !qrObjectUrl ? (
            <p className="text-secondary channel-qr-modal-loading">Loading QR code…</p>
          ) : null}
          {qrObjectUrl ? (
            <div className="channel-qr-plain-preview">
              <img
                alt=""
                className="channel-qr-plain-preview-img"
                draggable={false}
                src={qrObjectUrl}
              />
              <p className="channel-qr-plain-preview-hint">Scan to give feedback</p>
            </div>
          ) : null}
          {exportError ? <div className="field-error-msg">{exportError}</div> : null}
        </div>
        <footer className="modal-footer modal-footer--spread">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Close
          </button>
          <div className="channel-qr-download-btns">
            <button
              className="btn btn--secondary"
              disabled={!qrObjectUrl || isExporting}
              type="button"
              onClick={downloadPng}
            >
              {exportKind === "png" ? "…" : "PNG"}
            </button>
            <button
              className="btn btn--secondary"
              disabled={!qrObjectUrl || isExporting}
              type="button"
              onClick={() => void downloadJpeg()}
            >
              {exportKind === "jpeg" ? "…" : "JPEG"}
            </button>
            <button
              className="btn btn--secondary"
              disabled={!qrObjectUrl || isExporting}
              type="button"
              onClick={() => void downloadPdf()}
            >
              {exportKind === "pdf" ? "…" : "PDF"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
