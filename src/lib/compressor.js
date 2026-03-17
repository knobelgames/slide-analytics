import JSZip from "jszip";
import { processImage } from "./imageUtils";
import { renameImageInZip } from "./pptxUtils";

const SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "bmp", "tiff", "tif"];
const MIN_SIZE = 50 * 1024; // Skip images < 50 KB
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

/**
 * Compress a PPTX file.
 *
 * @param {File} file
 * @param {"visual"|"lossless"} mode
 * @param {function} onProgress - ({ current, total, fileName })
 * @param {number} jpegQuality - 1–100, only for visual mode
 */
export async function compressPptx(file, mode, onProgress, jpegQuality = 75) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Zip bomb check
  const allPaths = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  let totalUncompressed = 0;
  for (const path of allPaths) {
    const entry = zip.files[path];
    if (entry._data && entry._data.uncompressedSize) {
      totalUncompressed += entry._data.uncompressedSize;
    }
  }
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Entpackte Groesse (${(totalUncompressed / 1024 / 1024).toFixed(0)} MB) ueberschreitet das Limit von ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB.`,
    );
  }

  // In lossless mode, skip JPEGs (can't losslessly recompress)
  const imageEntries = allPaths.filter((path) => {
    if (!path.startsWith("ppt/media/")) return false;
    const ext = path.split(".").pop().toLowerCase();
    if (mode === "lossless" && (ext === "jpg" || ext === "jpeg")) return false;
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  // Count skipped JPEGs for display
  const jpegCount =
    mode === "lossless"
      ? allPaths.filter((p) => {
          if (!p.startsWith("ppt/media/")) return false;
          const ext = p.split(".").pop().toLowerCase();
          return ext === "jpg" || ext === "jpeg";
        }).length
      : 0;

  const total = imageEntries.length;
  let imagesProcessed = 0;
  let imagesSkipped = 0;
  let formatChanges = 0;

  for (let i = 0; i < imageEntries.length; i++) {
    const imagePath = imageEntries[i];
    const fileName = imagePath.split("/").pop();
    const ext = fileName.split(".").pop().toLowerCase();

    onProgress({ current: i + 1, total, fileName });

    const originalData = await zip.file(imagePath).async("uint8array");

    // Skip tiny images (logos, icons)
    if (originalData.byteLength < MIN_SIZE) {
      imagesSkipped++;
      continue;
    }

    try {
      const result = await processImage(originalData, ext, mode, jpegQuality);

      if (result === null) {
        imagesSkipped++;
        continue;
      }

      // Only replace if smaller
      if (result.data.byteLength < originalData.byteLength) {
        const newData = result.data;

        if (result.newExt !== ext) {
          // Format changed → rename + update refs
          const newPath = imagePath.replace(/\.[^.]+$/, "." + result.newExt);
          await renameImageInZip(zip, imagePath, newPath);
          zip.file(newPath, newData);
          formatChanges++;
        } else {
          zip.file(imagePath, newData);
        }
        imagesProcessed++;
      } else {
        imagesSkipped++;
      }
    } catch {
      imagesSkipped++;
    }
  }

  const compressedBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  return {
    blob: compressedBlob,
    originalSize: file.size,
    compressedSize: compressedBlob.size,
    imagesProcessed,
    imagesSkipped: imagesSkipped + jpegCount,
    jpegCount,
    formatChanges,
    mode,
  };
}
