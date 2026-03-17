import { useState, useRef } from "react";

export default function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".pptx")) {
      onFile(file);
    }
  }

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-emerald-400 bg-emerald-400/10"
          : "border-zinc-600 hover:border-zinc-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pptx"
        onChange={handleChange}
        className="hidden"
      />
      <p className="text-lg text-zinc-300">
        .pptx hierher ziehen oder klicken
      </p>
      <p className="text-sm text-zinc-500 mt-2">
        Nur PowerPoint-Dateien (.pptx)
      </p>
    </div>
  );
}
