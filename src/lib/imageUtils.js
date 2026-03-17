import { encode as encodeJpeg, decode as decodeJpeg } from "@jsquash/jpeg";
import { optimise as optimisePng } from "@jsquash/oxipng";
import { decode as decodePng } from "@jsquash/png";

/**
 * Decode any supported image to ImageData via Canvas.
 */
function decodeViaCanvas(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    img.src = url;
  });
}

/**
 * Encode ImageData to PNG via Canvas (for BMP/TIFF conversion).
 */
function encodePngViaCanvas(imageData) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("PNG encode failed"));
        blob.arrayBuffer().then(resolve);
      },
      "image/png",
    );
  });
}

/**
 * Process a single image.
 *
 * @param {Uint8Array} data - raw file bytes
 * @param {string} ext - file extension (png, jpg, jpeg, bmp, tiff, tif)
 * @param {"visual"|"lossless"} mode
 * @param {number} jpegQuality - 1–100, only used in visual mode (default 75)
 * @returns {Promise<{ data: ArrayBuffer, newExt: string } | null>}
 *          null = image untouched
 */
export async function processImage(data, ext, mode, jpegQuality = 75) {
  const isJpeg = ext === "jpg" || ext === "jpeg";
  const isPng = ext === "png";
  const isBmpOrTiff = ["bmp", "tiff", "tif"].includes(ext);

  // --- LOSSLESS MODE ---
  if (mode === "lossless") {
    if (isPng) {
      // OxiPNG: lossless PNG optimization
      const optimized = await optimisePng(data.buffer, { level: 3 });
      return { data: optimized, newExt: "png" };
    }

    if (isBmpOrTiff) {
      // Convert BMP/TIFF → PNG (lossless)
      const blob = new Blob([data], { type: `image/${ext}` });
      const imageData = await decodeViaCanvas(blob);
      const pngBuffer = await encodePngViaCanvas(imageData);
      return { data: pngBuffer, newExt: "png" };
    }

    // JPEG: can't losslessly recompress, skip
    return null;
  }

  // --- VISUAL MODE (like TinyPNG) ---
  if (isJpeg) {
    // Decode JPEG → ImageData → re-encode with MozJPEG
    const imageData = await decodeJpeg(data.buffer);
    const encoded = await encodeJpeg(imageData, {
      quality: jpegQuality,
      progressive: true,
      optimize_coding: true,
    });
    return { data: encoded, newExt: "jpeg" };
  }

  if (isPng) {
    // First optimize losslessly with OxiPNG, then if the PNG is large
    // and likely a photo, offer MozJPEG alternative
    const optimized = await optimisePng(data.buffer, { level: 3 });

    // Check if PNG has transparency
    const imageData = await decodePng(data.buffer);
    const hasAlpha = checkAlpha(imageData);

    if (!hasAlpha && data.byteLength > 500 * 1024) {
      // Non-transparent large PNG → likely a photo, MozJPEG will be much smaller
      const jpegEncoded = await encodeJpeg(imageData, {
        quality: jpegQuality,
        progressive: true,
        optimize_coding: true,
      });
      // Return whichever is smaller: OxiPNG or JPEG
      if (jpegEncoded.byteLength < optimized.byteLength) {
        return { data: jpegEncoded, newExt: "jpeg" };
      }
    }

    return { data: optimized, newExt: "png" };
  }

  if (isBmpOrTiff) {
    // Decode → MozJPEG (visual mode, these are always large)
    const blob = new Blob([data], { type: `image/${ext}` });
    const imageData = await decodeViaCanvas(blob);
    const hasAlpha = checkAlpha(imageData);

    if (hasAlpha) {
      // Has transparency → PNG
      const pngBuffer = await encodePngViaCanvas(imageData);
      const optimized = await optimisePng(pngBuffer, { level: 3 });
      return { data: optimized, newExt: "png" };
    }

    const encoded = await encodeJpeg(imageData, {
      quality: jpegQuality,
      progressive: true,
      optimize_coding: true,
    });
    return { data: encoded, newExt: "jpeg" };
  }

  return null;
}

/**
 * Check if ImageData has any non-opaque pixels.
 */
function checkAlpha(imageData) {
  const pixels = imageData.data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) return true;
  }
  return false;
}
