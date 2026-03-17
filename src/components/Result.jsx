import { useMemo, useEffect } from "react";

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function Result({ result, onReset }) {
  const {
    blob,
    originalSize,
    compressedSize,
    imagesProcessed,
    imagesSkipped,
    jpegCount,
    formatChanges,
    mode,
  } = result;

  const saved = originalSize - compressedSize;
  const pct = originalSize > 0 ? ((saved / originalSize) * 100).toFixed(1) : "0";

  const downloadUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => {
    return () => URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900 rounded-lg p-5 space-y-3">
        <div className="text-3xl font-bold text-emerald-400 text-center">
          {saved > 0 ? `${pct}% kleiner` : "Bereits optimal"}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400">
          <div>
            Vorher: <span className="text-zinc-200">{formatSize(originalSize)}</span>
          </div>
          <div>
            Nachher:{" "}
            <span className="text-zinc-200">{formatSize(compressedSize)}</span>
          </div>
          <div>
            Komprimiert:{" "}
            <span className="text-zinc-200">{imagesProcessed}</span>
          </div>
          <div>
            Uebersprungen:{" "}
            <span className="text-zinc-200">{imagesSkipped}</span>
          </div>
        </div>
        <div className="text-xs text-zinc-600 text-center space-y-0.5">
          <p>
            Modus: {mode === "visual" ? "Visuell verlustfrei (MozJPEG + OxiPNG)" : "Strikt lossless (OxiPNG)"}
          </p>
          {formatChanges > 0 && (
            <p>{formatChanges} Bild{formatChanges !== 1 ? "er" : ""} konvertiert (PNG → JPEG)</p>
          )}
          {jpegCount > 0 && mode === "lossless" && (
            <p>{jpegCount} JPEG{jpegCount > 1 ? "s" : ""} unangetastet</p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <a
          href={downloadUrl}
          download={result.fileName}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-center py-3 rounded-lg font-medium transition-colors"
        >
          Download
        </a>
        <button
          onClick={onReset}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-lg font-medium transition-colors"
        >
          Naechste Datei
        </button>
      </div>
    </div>
  );
}
