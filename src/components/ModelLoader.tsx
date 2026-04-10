import { useRef } from "react";
import Icon from "@/components/ui/icon";

interface ModelLoaderProps {
  onModelLoaded: (buffer: ArrayBuffer, fileName: string) => void;
  isLoading: boolean;
  error: string | null;
}

export default function ModelLoader({ onModelLoaded, isLoading, error }: ModelLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".onnx")) return;
    const buffer = await file.arrayBuffer();
    onModelLoaded(buffer, file.name);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="app-root flex flex-col h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <div className="flex flex-col items-center gap-3">
          <div className="coin-logo w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-2xl">
            🪙
          </div>
          <h1 className="font-montserrat font-black text-white text-2xl tracking-tight">CoinScan</h1>
          <p className="font-montserrat text-gray-400 text-sm text-center leading-relaxed">
            Для работы нужна ONNX-модель.<br />Выбери файл — он сохранится на этом устройстве.
          </p>
        </div>

        <div
          className="model-drop-zone w-full rounded-3xl p-8 flex flex-col items-center gap-4 cursor-pointer transition-all duration-300"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          {isLoading ? (
            <>
              <div className="w-12 h-12 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
              <p className="font-montserrat text-amber-300 font-semibold text-sm">Загружаю модель...</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <Icon name="Upload" size={26} />
              </div>
              <div className="text-center">
                <p className="font-montserrat text-white font-bold text-base">Выбрать .onnx файл</p>
                <p className="font-montserrat text-gray-500 text-xs mt-1">или перетащи сюда</p>
              </div>
              <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10">
                <span className="font-montserrat text-xs text-gray-400">input: 320×320 · класс: coin</span>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20">
            <Icon name="AlertCircle" size={18} />
            <p className="font-montserrat text-red-400 text-sm">{error}</p>
          </div>
        )}

        <p className="font-montserrat text-gray-600 text-xs text-center">
          Файл хранится только на твоём устройстве и не передаётся на сервер
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".onnx"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
