function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function SizeBar({ value, max, color = "bg-emerald-500" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function scoreColor(score) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(score) {
  if (score >= 80) return "border-emerald-800/50";
  if (score >= 60) return "border-yellow-800/50";
  if (score >= 40) return "border-orange-800/50";
  return "border-red-800/50";
}

function scoreLabel(score) {
  if (score >= 90) return "Sehr gut";
  if (score >= 80) return "Gut";
  if (score >= 60) return "Okay";
  if (score >= 40) return "Maessig";
  return "Schlecht";
}

function ScoreCard({ title, score, reasons }) {
  return (
    <div className={`bg-zinc-900 border ${scoreBg(score)} rounded-lg p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-300">{title}</h3>
        <div className="text-right">
          <span className={`text-2xl font-bold ${scoreColor(score)}`}>
            {score}
          </span>
          <span className="text-zinc-600 text-sm">/100</span>
          <span className={`block text-xs ${scoreColor(score)}`}>
            {scoreLabel(score)}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {reasons.map((r, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="shrink-0 w-8 text-right">
              {r.delta < 0 ? (
                <span className="text-red-400">{r.delta}</span>
              ) : (
                <span className="text-zinc-600">--</span>
              )}
            </span>
            <span className={r.delta < 0 ? "text-zinc-300" : "text-zinc-500"}>
              {r.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageRow({ img }) {
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span className="text-zinc-400 truncate min-w-0">
        {img.path.split("/").pop()}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        {img.width && (
          <span className="text-zinc-600">
            {img.width}&times;{img.height}
          </span>
        )}
        <span className="text-zinc-500 uppercase text-[10px]">
          {img.format}
        </span>
        <span className="text-zinc-200 w-16 text-right">
          {formatSize(img.size)}
        </span>
      </div>
    </div>
  );
}

function ImageSection({ title, images, totalSize, fileSize, color, badge }) {
  if (images.length === 0) return null;
  const pct = ((totalSize / fileSize) * 100).toFixed(1);
  return (
    <div className="bg-zinc-900 rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge}`}>
            {title}
          </span>
          <span className="text-zinc-600 font-normal">({images.length})</span>
        </h3>
        <span className="text-xs text-zinc-400">
          {formatSize(totalSize)}{" "}
          <span className="text-zinc-600">({pct}%)</span>
        </span>
      </div>
      <SizeBar value={totalSize} max={fileSize} color={color} />
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {images.map((img) => (
          <ImageRow key={img.path} img={img} />
        ))}
      </div>
    </div>
  );
}

export default function Analysis({ analysis, onCompress, onReset, mode, onModeChange }) {
  const {
    fileSize,
    totalImages,
    totalXml,
    totalOther,
    totalMasterImages,
    totalSlideImages,
    masterImages,
    slideImages,
    masterScore,
    slideScore,
    layouts,
    imageCount,
  } = analysis;

  const imagePct = ((totalImages / fileSize) * 100).toFixed(1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-zinc-900 rounded-lg p-5">
        <h2 className="text-lg font-bold text-zinc-100">
          Analyse{" "}
          <span className="text-zinc-500 font-normal text-sm">
            {formatSize(fileSize)}
          </span>
        </h2>
      </div>

      {/* Quality Scores */}
      <div className="grid grid-cols-2 gap-4">
        <ScoreCard
          title="Master"
          score={masterScore.score}
          reasons={masterScore.reasons}
        />
        <ScoreCard
          title="Folien"
          score={slideScore.score}
          reasons={slideScore.reasons}
        />
      </div>

      {/* Size breakdown */}
      <div className="bg-zinc-900 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold text-zinc-300">Groessenverteilung</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Bilder ({imageCount})</span>
            <span className="text-zinc-200">
              {formatSize(totalImages)}{" "}
              <span className="text-zinc-500">({imagePct}%)</span>
            </span>
          </div>
          <SizeBar value={totalImages} max={fileSize} />

          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">XML/Struktur</span>
            <span className="text-zinc-200">{formatSize(totalXml)}</span>
          </div>
          <SizeBar value={totalXml} max={fileSize} color="bg-zinc-500" />

          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Sonstiges</span>
            <span className="text-zinc-200">{formatSize(totalOther)}</span>
          </div>
          <SizeBar value={totalOther} max={fileSize} color="bg-zinc-600" />
        </div>
      </div>

      {/* Layout details */}
      {layouts.length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-5 space-y-3">
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-400 text-sm font-bold text-zinc-300">
              Layouts ({layouts.length})
            </summary>
            <div className="mt-3 space-y-1 pl-2 border-l border-zinc-800">
              {layouts.map((l) => (
                <div key={l.path} className="flex justify-between">
                  <span className={l.name ? "text-zinc-400" : "text-zinc-600 italic"}>
                    {l.name || "(unbenannt)"}
                  </span>
                  {l.imageRefs.size > 0 && (
                    <span className="text-zinc-600">
                      {l.imageRefs.size} Bild{l.imageRefs.size !== 1 ? "er" : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Images: Master */}
      <ImageSection
        title="Bilder im Master"
        images={masterImages}
        totalSize={totalMasterImages}
        fileSize={fileSize}
        color="bg-amber-500"
        badge="bg-amber-900/50 text-amber-400"
      />

      {/* Images: Slides */}
      <ImageSection
        title="Bilder in Folien"
        images={slideImages}
        totalSize={totalSlideImages}
        fileSize={fileSize}
        color="bg-emerald-500"
        badge="bg-zinc-800 text-zinc-400"
      />

      {/* Compression mode */}
      <div className="bg-zinc-900 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-bold text-zinc-300">Kompression</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onModeChange("visual")}
            className={`p-3 rounded-lg border text-left transition-colors ${
              mode === "visual"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <div className="text-sm font-medium text-zinc-200">
              Visuell verlustfrei
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Wie TinyPNG. MozJPEG + OxiPNG. 50–80% kleiner.
            </div>
          </button>
          <button
            onClick={() => onModeChange("lossless")}
            className={`p-3 rounded-lg border text-left transition-colors ${
              mode === "lossless"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <div className="text-sm font-medium text-zinc-200">
              Strikt lossless
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Kein Qualitaetsverlust. OxiPNG + DEFLATE. 5–20% kleiner.
            </div>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCompress}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-center py-3 rounded-lg font-medium transition-colors"
        >
          Komprimieren ({mode === "visual" ? "visuell" : "lossless"})
        </button>
        <button
          onClick={onReset}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-lg font-medium transition-colors"
        >
          Andere Datei
        </button>
      </div>
    </div>
  );
}
