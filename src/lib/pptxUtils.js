/**
 * Read slide dimensions from ppt/presentation.xml.
 * Returns { widthPx, heightPx } at 96 DPI.
 * PPTX stores dimensions in EMUs (English Metric Units): 1 inch = 914400 EMU.
 */
export async function getSlideSize(zip) {
  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) return null;

  const xml = await presFile.async("string");
  // <p:sldSz cx="12192000" cy="6858000" />
  const match = xml.match(/sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!match) return null;

  const emuPerInch = 914400;
  const dpi = 96;
  const widthPx = Math.round((Number(match[1]) / emuPerInch) * dpi);
  const heightPx = Math.round((Number(match[2]) / emuPerInch) * dpi);

  return { widthPx, heightPx };
}

/**
 * Calculate a sensible max image dimension based on slide size.
 * Heuristic: 1.5× the longest slide edge (so images look sharp at full-bleed,
 * but 5000×5000 originals get scaled down to something reasonable).
 */
export function calcMaxDimension(slideSize) {
  if (!slideSize) return 2048; // safe fallback
  const longestEdge = Math.max(slideSize.widthPx, slideSize.heightPx);
  // 1.5× for sharpness, rounded to nearest 100, capped at 2560
  return Math.min(Math.round((longestEdge * 1.5) / 100) * 100, 2560);
}

/**
 * Update .rels files when renaming an image (e.g. image1.bmp → image1.png).
 */
export async function renameImageInZip(zip, oldPath, newPath) {
  // Move the file
  const data = await zip.file(oldPath).async("uint8array");
  zip.remove(oldPath);
  zip.file(newPath, data);

  // Update all .rels references
  const relsFiles = Object.keys(zip.files).filter((f) => f.endsWith(".rels"));
  const oldName = oldPath.split("/").pop();
  const newName = newPath.split("/").pop();

  for (const relsPath of relsFiles) {
    const content = await zip.file(relsPath).async("string");
    if (content.includes(oldName)) {
      zip.file(relsPath, content.replaceAll(oldName, newName));
    }
  }

  // Ensure [Content_Types].xml has the target extension registered
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    const newExt = newPath.split(".").pop().toLowerCase();

    if (newExt === "png" && !ct.includes('Extension="png"')) {
      ct = ct.replace(
        "</Types>",
        '<Default Extension="png" ContentType="image/png"/></Types>',
      );
    }
    if ((newExt === "jpeg" || newExt === "jpg") && !ct.includes('Extension="jpeg"') && !ct.includes('Extension="jpg"')) {
      ct = ct.replace(
        "</Types>",
        '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
      );
    }

    zip.file("[Content_Types].xml", ct);
  }
}
