import { useState } from "react";
import DropZone from "./components/DropZone";
import Analysis from "./components/Analysis";
import Progress from "./components/Progress";
import Result from "./components/Result";
import { analyzePptx } from "./lib/analyzer";
import { compressPptx } from "./lib/compressor";

const STATES = {
  IDLE: "IDLE",
  ANALYZING: "ANALYZING",
  ANALYZED: "ANALYZED",
  COMPRESSING: "COMPRESSING",
  DONE: "DONE",
  ERROR: "ERROR",
};

export default function App() {
  const [state, setState] = useState(STATES.IDLE);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mode, setMode] = useState("visual");
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(f) {
    setFile(f);
    setState(STATES.ANALYZING);

    try {
      const a = await analyzePptx(f);
      setAnalysis(a);
      setState(STATES.ANALYZED);
    } catch (err) {
      setError(err.message || "Datei konnte nicht gelesen werden");
      setState(STATES.ERROR);
    }
  }

  async function handleCompress() {
    setState(STATES.COMPRESSING);
    setProgress({ current: 0, total: 0, fileName: "" });

    try {
      const res = await compressPptx(file, mode, setProgress);
      res.fileName = file.name.replace(/\.pptx$/, "_komprimiert.pptx");
      setResult(res);
      setState(STATES.DONE);
    } catch (err) {
      setError(err.message || "Kompression fehlgeschlagen");
      setState(STATES.ERROR);
    }
  }

  function handleReset() {
    setState(STATES.IDLE);
    setFile(null);
    setAnalysis(null);
    setResult(null);
    setError("");
  }

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-zinc-100">PPTX Kompressor</h1>
          <p className="text-sm text-zinc-500">
            100% lokal im Browser &middot; kein Upload &middot; kein Server
          </p>
        </header>

        {state === STATES.IDLE && <DropZone onFile={handleFile} />}

        {state === STATES.ANALYZING && (
          <p className="text-center text-zinc-400 text-sm">Analysiere...</p>
        )}

        {state === STATES.ANALYZED && analysis && (
          <Analysis
            analysis={analysis}
            onCompress={handleCompress}
            onReset={handleReset}
            mode={mode}
            onModeChange={setMode}
          />
        )}

        {state === STATES.COMPRESSING && <Progress progress={progress} />}

        {state === STATES.DONE && result && (
          <Result result={result} onReset={handleReset} />
        )}

        {state === STATES.ERROR && (
          <div className="space-y-4">
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
              {error}
            </div>
            <button
              onClick={handleReset}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-3 rounded-lg font-medium transition-colors"
            >
              Nochmal versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
