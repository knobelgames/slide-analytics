import JSZip from "jszip";
import { processImage } from "./imageUtils";
import { renameImageInZip } from "./pptxUtils";

const SUPPORTED_EXTENSIONS = ["png", "bmp", "tiff", "tif"];
// JPEGs are excluded — can't losslessly recompress in browser
const MIN_SIZE = 50 * 1024; // Skip images < 50 KB
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB zip bomb limit

/**
 * Compress a PPTX file losslessly.
 * No resize, no crop, no quality loss. Images keep their exact dimensions.
 * - Re-encodes PNGs (same pixels, potentially better compression)
 * - Converts BMP/TIFF → PNG (same pixels, much smaller)
 * - Better ZIP compression (DEFLATE level 9)
 *
 * @param {File} file
 * @param {function} onProgress - ({ current, total, fileName })
 */
export async function compressPptx(file, onProgress) {
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

  // Find all re-encodable images in ppt/media/ (no JPEGs)
  const imageEntries = Object.keys(zip.files).filter((path) => {
    if (!path.startsWith("ppt/media/")) return false;
    const ext = path.split(".").pop().toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  // Also count JPEGs for display
  const jpegCount = Object.keys(zip.files).filter((path) => {
    if (!path.startsWith("ppt/media/")) return false;
    const ext = path.split(".").pop().toLowerCase();
    return ext === "jpg" || ext === "jpeg";
  }).length;

  const total = imageEntries.length;
  let imagesProcessed = 0;
  let imagesSkipped = 0;

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

    let mimeType = "image/png";
    if (ext === "bmp") mimeType = "image/bmp";
    else if (ext === "tiff" || ext === "tif") mimeType = "image/tiff";

    const blob = new Blob([originalData], { type: mimeType });

    try {
      const result = await processImage(blob, ext);

      if (result === null) {
        imagesSkipped++;
        continue;
      }

      // Only replace if result is smaller
      if (result.blob.size < originalData.byteLength) {
        const newData = await result.blob.arrayBuffer();

        // If format changed (bmp/tiff → png), rename in zip + update refs
        if (result.newExt !== ext) {
          const newPath = imagePath.replace(/\.[^.]+$/, "." + result.newExt);
          await renameImageInZip(zip, imagePath, newPath);
          zip.file(newPath, newData);
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
  };
}
