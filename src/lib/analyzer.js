import JSZip from "jszip";

/**
 * Analyze a PPTX file: why is it so big? How is the master structured?
 */
// Max uncompressed size: 500 MB (protects against zip bombs)
const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
// Max individual XML file size for regex parsing: 10 MB
const MAX_XML_SIZE = 10 * 1024 * 1024;

export async function analyzePptx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const allFiles = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  // Zip bomb check: sum up uncompressed sizes
  let totalUncompressed = 0;
  for (const path of allFiles) {
    const entry = zip.files[path];
    if (entry._data && entry._data.uncompressedSize) {
      totalUncompressed += entry._data.uncompressedSize;
    }
  }
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Entpackte Groesse (${(totalUncompressed / 1024 / 1024).toFixed(0)} MB) ueberschreitet das Limit von ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB. Moeglicherweise eine manipulierte Datei.`,
    );
  }

  // Categorize all files
  const categories = { images: [], xml: [], other: [] };
  let runningTotal = 0;

  for (const path of allFiles) {
    const data = await zip.file(path).async("uint8array");
    const size = data.byteLength;

    // Track actual decompressed bytes as we go
    runningTotal += size;
    if (runningTotal > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Entpackte Groesse ueberschreitet ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB. Abbruch.`,
      );
    }

    const ext = path.split(".").pop().toLowerCase();
    const entry = { path, size, ext };

    if (path.startsWith("ppt/media/")) {
      categories.images.push(entry);
    } else if (["xml", "rels"].includes(ext)) {
      categories.xml.push(entry);
    } else {
      categories.other.push(entry);
    }
  }

  // Get image dimensions
  const imageDetails = await Promise.all(
    categories.images.map(async (img) => {
      const data = await zip.file(img.path).async("uint8array");
      const dims = await getImageDimensions(data, img.ext);
      return { ...img, ...dims };
    }),
  );

  // --- Master & Layout analysis ---
  const masterFiles = allFiles.filter(
    (f) => f.startsWith("ppt/slideMasters/") && f.endsWith(".xml") && !f.includes("_rels"),
  );
  const layoutFiles = allFiles.filter(
    (f) => f.startsWith("ppt/slideLayouts/") && f.endsWith(".xml") && !f.includes("_rels"),
  );

  // Parse each master: name, associated layouts
  const masters = await Promise.all(
    masterFiles.map(async (mPath) => {
      const xml = await safeReadXml(zip, mPath);
      const nameMatch = xml.match(/<p:cSld[^>]*name="([^"]*)"/);
      const name = nameMatch ? nameMatch[1] : null;

      const relsPath = mPath.replace("ppt/slideMasters/", "ppt/slideMasters/_rels/") + ".rels";
      const linkedLayouts = [];
      const imageRefs = new Set();

      if (zip.file(relsPath)) {
        const rels = await safeReadXml(zip, relsPath);
        const layoutMatches = rels.matchAll(/Target="[^"]*slideLayouts\/([^"]+)"/g);
        for (const m of layoutMatches) linkedLayouts.push(m[1]);
        const imgMatches = rels.matchAll(/Target="[^"]*\/media\/([^"]+)"/g);
        for (const m of imgMatches) imageRefs.add(m[1]);
      }

      return { path: mPath, name, linkedLayouts, imageRefs };
    }),
  );

  // Parse each layout: name, images
  const layouts = await Promise.all(
    layoutFiles.map(async (lPath) => {
      const xml = await safeReadXml(zip, lPath);
      const nameMatch = xml.match(/<p:cSld[^>]*name="([^"]*)"/);
      const name = nameMatch ? nameMatch[1] : null;
      const fileName = lPath.split("/").pop();

      const relsPath = lPath.replace("ppt/slideLayouts/", "ppt/slideLayouts/_rels/") + ".rels";
      const imageRefs = new Set();
      if (zip.file(relsPath)) {
        const rels = await safeReadXml(zip, relsPath);
        const imgMatches = rels.matchAll(/Target="[^"]*\/media\/([^"]+)"/g);
        for (const m of imgMatches) imageRefs.add(m[1]);
      }

      return { path: lPath, fileName, name, imageRefs };
    }),
  );

  // Collect all master+layout image refs
  const allMasterImageRefs = new Set();
  for (const m of masters) {
    for (const ref of m.imageRefs) allMasterImageRefs.add(ref);
  }
  for (const l of layouts) {
    for (const ref of l.imageRefs) allMasterImageRefs.add(ref);
  }

  // Also check slide rels for image refs
  const slideRelsFiles = allFiles.filter(
    (f) => f.startsWith("ppt/slides/_rels/") && f.endsWith(".rels"),
  );
  const slideImageRefs = new Set();
  for (const relsPath of slideRelsFiles) {
    const content = await safeReadXml(zip, relsPath);
    const matches = content.matchAll(/Target="[^"]*\/media\/([^"]+)"/g);
    for (const m of matches) slideImageRefs.add(m[1]);
  }

  // Tag images
  const taggedImages = imageDetails.map((img) => {
    const fileName = img.path.split("/").pop();
    return {
      ...img,
      usedInMaster: allMasterImageRefs.has(fileName),
      usedInSlides: slideImageRefs.has(fileName),
    };
  });

  const masterImages = taggedImages.filter((i) => i.usedInMaster).sort((a, b) => b.size - a.size);
  const slideImages = taggedImages.filter((i) => !i.usedInMaster).sort((a, b) => b.size - a.size);

  // Size totals
  const totalImages = categories.images.reduce((s, f) => s + f.size, 0);
  const totalMasterImages = masterImages.reduce((s, f) => s + f.size, 0);
  const totalSlideImages = slideImages.reduce((s, f) => s + f.size, 0);
  const totalXml = categories.xml.reduce((s, f) => s + f.size, 0);
  const totalOther = categories.other.reduce((s, f) => s + f.size, 0);

  // Count slides
  const slideFiles = allFiles.filter(
    (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f),
  );
  const slideCount = slideFiles.length;

  // Build quality scores
  const masterScore = buildMasterScore(masters, layouts, masterImages, file.size);
  const slideScore = buildSlideScore(slideImages, slideCount, file.size);

  return {
    fileSize: file.size,
    totalImages,
    totalMasterImages,
    totalSlideImages,
    totalXml,
    totalOther,
    masterImages,
    slideImages,
    images: taggedImages,
    masterCount: masters.length,
    masters,
    layouts,
    masterScore,
    slideScore,
    slideCount,
    imageCount: categories.images.length,
    xmlCount: categories.xml.length,
  };
}

/**
 * Build quality score for the master (0–100).
 * Evaluates: number of masters, layout naming, layout count, image weight.
 */
function buildMasterScore(masters, layouts, masterImages, fileSize) {
  let score = 100;
  const reasons = [];

  // --- Multiple masters ---
  if (masters.length > 1) {
    const penalty = Math.min((masters.length - 1) * 15, 40);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${masters.length} Folienmaster — oft durch Copy-Paste aus anderen Decks. Ideal ist 1.`,
    });
  } else if (masters.length === 1) {
    reasons.push({ delta: 0, text: "1 Folienmaster — sauber." });
  } else {
    score -= 20;
    reasons.push({ delta: -20, text: "Kein Folienmaster gefunden." });
  }

  // --- Layout naming ---
  const allLayoutNames = layouts.map((l) => l.name);
  const unnamed = allLayoutNames.filter((n) => !n || n.trim() === "");
  const generic = allLayoutNames.filter(
    (n) => n && /^(custom|benutzerdefiniert|layout)\s*\d*$/i.test(n.trim()),
  );

  if (unnamed.length > 0) {
    const penalty = Math.min(unnamed.length * 3, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${unnamed.length} Layout${unnamed.length !== 1 ? "s" : ""} ohne Namen — erschwert die Nutzung im Team.`,
    });
  }
  if (generic.length > 0) {
    const penalty = Math.min(generic.length * 2, 10);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${generic.length} Layout${generic.length !== 1 ? "s" : ""} mit generischem Namen (z.B. "${generic[0]}").`,
    });
  }
  if (unnamed.length === 0 && generic.length === 0 && layouts.length > 0) {
    reasons.push({ delta: 0, text: "Alle Layouts sinnvoll benannt." });
  }

  // --- Layout count ---
  const totalLayouts = layouts.length;
  if (totalLayouts > 20) {
    const penalty = Math.min(Math.floor((totalLayouts - 20) / 2) * 3, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${totalLayouts} Layouts — wahrscheinlich zu viele. Ungenutzte entfernen spart Platz und Uebersicht.`,
    });
  } else if (totalLayouts > 0) {
    reasons.push({ delta: 0, text: `${totalLayouts} Layouts — angemessen.` });
  }

  // --- Orphan layouts ---
  const allLinked = new Set();
  for (const m of masters) {
    for (const l of m.linkedLayouts) allLinked.add(l);
  }
  const orphans = layouts.filter((l) => !allLinked.has(l.fileName));
  if (orphans.length > 0) {
    const penalty = Math.min(orphans.length * 5, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${orphans.length} verwaiste Layouts (keinem Master zugeordnet).`,
    });
  }

  // --- Master image weight ---
  const masterImageBytes = masterImages.reduce((s, i) => s + i.size, 0);
  if (fileSize > 0 && masterImageBytes / fileSize > 0.3) {
    const penalty = 10;
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `Master-Bilder machen ueber 30% der Dateigroesse aus — pruefen ob alle noetig sind.`,
    });
  }

  // Large images in master (>2 MB each)
  const largeOnes = masterImages.filter((i) => i.size > 2 * 1024 * 1024);
  if (largeOnes.length > 0) {
    const penalty = Math.min(largeOnes.length * 5, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${largeOnes.length} Bild${largeOnes.length !== 1 ? "er" : ""} im Master ueber 2 MB — sehr grosse Hintergrundbilder?`,
    });
  }

  return { score: Math.max(0, score), reasons };
}

/**
 * Build quality score for the slides (0–100).
 * Evaluates: image sizes, formats, total weight.
 */
function buildSlideScore(slideImages, slideCount, fileSize) {
  let score = 100;
  const reasons = [];

  if (slideImages.length === 0) {
    reasons.push({ delta: 0, text: "Keine Bilder in den Folien." });
    return { score, reasons };
  }

  // --- Oversized images (>5 MB) ---
  const veryLarge = slideImages.filter((i) => i.size > 5 * 1024 * 1024);
  if (veryLarge.length > 0) {
    const penalty = Math.min(veryLarge.length * 8, 30);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${veryLarge.length} Bild${veryLarge.length !== 1 ? "er" : ""} ueber 5 MB — vermutlich unkomprimierte Screenshots oder Fotos.`,
    });
  }

  // --- Large images (>2 MB) ---
  const large = slideImages.filter(
    (i) => i.size > 2 * 1024 * 1024 && i.size <= 5 * 1024 * 1024,
  );
  if (large.length > 0) {
    const penalty = Math.min(large.length * 4, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${large.length} Bild${large.length !== 1 ? "er" : ""} zwischen 2–5 MB.`,
    });
  }

  // --- BMP/TIFF (uncompressed formats) ---
  const uncompressed = slideImages.filter(
    (i) => ["bmp", "tiff", "tif"].includes(i.ext),
  );
  if (uncompressed.length > 0) {
    const penalty = Math.min(uncompressed.length * 5, 20);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${uncompressed.length} Bild${uncompressed.length !== 1 ? "er" : ""} in unkomprimiertem Format (BMP/TIFF) — sollten PNG oder JPEG sein.`,
    });
  }

  // --- Extremely high resolution (>4000px edge) ---
  const hugeRes = slideImages.filter(
    (i) => i.width && (i.width > 4000 || i.height > 4000),
  );
  if (hugeRes.length > 0) {
    const penalty = Math.min(hugeRes.length * 5, 20);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${hugeRes.length} Bild${hugeRes.length !== 1 ? "er" : ""} mit ueber 4000px Kantenlaenge — fuer Praesentationen unnoetig gross.`,
    });
  }

  // --- PNG photos (large PNGs that are probably photos) ---
  const suspectPng = slideImages.filter(
    (i) => i.ext === "png" && i.size > 1 * 1024 * 1024,
  );
  if (suspectPng.length > 0) {
    const penalty = Math.min(suspectPng.length * 3, 15);
    score -= penalty;
    reasons.push({
      delta: -penalty,
      text: `${suspectPng.length} grosse PNG${suspectPng.length !== 1 ? "s" : ""} (>1 MB) — falls Fotos, waere JPEG deutlich kleiner.`,
    });
  }

  // --- Average size per slide ---
  if (slideCount > 0) {
    const totalSlideImgSize = slideImages.reduce((s, i) => s + i.size, 0);
    const avgPerSlide = totalSlideImgSize / slideCount;
    if (avgPerSlide > 3 * 1024 * 1024) {
      const penalty = 10;
      score -= penalty;
      reasons.push({
        delta: -penalty,
        text: `Durchschnittlich ${formatBytes(avgPerSlide)} Bilddaten pro Folie — recht viel.`,
      });
    } else {
      reasons.push({
        delta: 0,
        text: `Durchschnittlich ${formatBytes(avgPerSlide)} Bilddaten pro Folie (${slideCount} Folien).`,
      });
    }
  }

  // --- All good? ---
  if (score === 100) {
    reasons.push({ delta: 0, text: "Bilder in den Folien sehen gut optimiert aus." });
  }

  return { score: Math.max(0, score), reasons };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Safely read an XML/rels file from the ZIP.
 * Rejects files over MAX_XML_SIZE to prevent ReDoS on huge XML.
 */
async function safeReadXml(zip, path) {
  const file = zip.file(path);
  if (!file) return "";
  const data = await file.async("uint8array");
  if (data.byteLength > MAX_XML_SIZE) {
    return ""; // skip oversized XML — don't run regex on it
  }
  return new TextDecoder().decode(data);
}

function getImageDimensions(data, ext) {
  return new Promise((resolve) => {
    const isVector = ["svg", "emf", "wmf"].includes(ext);
    if (isVector) {
      resolve({ width: null, height: null, format: ext.toUpperCase() });
      return;
    }

    let mimeType = "image/png";
    if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    else if (ext === "bmp") mimeType = "image/bmp";
    else if (ext === "tiff" || ext === "tif") mimeType = "image/tiff";

    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height, format: ext.toUpperCase() });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null, format: ext.toUpperCase() });
    };
    img.src = url;
  });
}
