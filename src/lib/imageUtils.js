/**
 * Losslessly re-encode an image via Canvas — same dimensions, same pixels.
 * - PNG → PNG (re-encoded, often smaller for unoptimized PNGs)
 * - BMP/TIFF → PNG (huge savings, lossless)
 * - JPEG → untouched (can't losslessly recompress in browser)
 *
 * @param {Blob} blob - original image
 * @param {string} ext - original file extension
 * @returns {Promise<{ blob: Blob, newExt: string } | null>}
 *          null if image should stay untouched (JPEG)
 */
export function processImage(blob, ext) {
  const isJpeg = ext === "jpg" || ext === "jpeg";

  // JPEGs: don't touch — no lossless recompression possible in browser
  if (isJpeg) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Draw at exact original dimensions — no resize
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (resultBlob) => {
          if (!resultBlob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          resolve({ blob: resultBlob, newExt: "png" });
        },
        "image/png",
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}
