export default function Progress({ progress }) {
  const { current, total, fileName } = progress;
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-zinc-400">
        <span>
          {current}/{total} Bilder verarbeitet
        </span>
        <span className="text-zinc-500 truncate ml-4 max-w-[200px]">
          {fileName}
        </span>
      </div>
    </div>
  );
}
