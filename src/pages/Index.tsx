import { useState, useCallback, useRef, useEffect } from "react";
import CameraView from "@/components/CameraView";
import StatsView from "@/components/StatsView";
import ModelLoader from "@/components/ModelLoader";
import SettingsSheet from "@/components/SettingsSheet";
import { useOnnxModel } from "@/hooks/useOnnxModel";
import Icon from "@/components/ui/icon";
import type { DetectedBox } from "@/hooks/useOnnxModel";

type Tab = "camera" | "stats";

interface SessionRecord {
  timestamp: number;
  count: number;
}

export default function Index() {
  const [tab, setTab] = useState<Tab>("camera");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [peakCount, setPeakCount] = useState(0);
  const [appReady, setAppReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastLogRef = useRef<number>(0);
  const lastCountRef = useRef<number>(0);

  const { isReady, isLoading, modelName, error, loadFromFile, loadFromCache, clearModel, runInference, confThresh, setConfThresh, iouThresh, setIouThresh } = useOnnxModel();

  useEffect(() => {
    loadFromCache().then(() => setAppReady(true));
  }, [loadFromCache]);

  const handleCoinsDetected = useCallback((boxes: DetectedBox[], ts: number) => {
    if (ts - lastLogRef.current < 2000) return;
    if (boxes.length === 0) return;
    if (boxes.length === lastCountRef.current && ts - lastLogRef.current < 5000) return;
    lastLogRef.current = ts;
    lastCountRef.current = boxes.length;

    setSessions(prev => [...prev, { timestamp: ts, count: boxes.length }]);
    setTotalDetections(prev => prev + boxes.length);
    setPeakCount(prev => Math.max(prev, boxes.length));
  }, []);

  const handleClear = () => {
    setSessions([]);
    setTotalDetections(0);
    setPeakCount(0);
    lastLogRef.current = 0;
    lastCountRef.current = 0;
  };

  if (!appReady) {
    return (
      <div className="app-root flex flex-col h-screen items-center justify-center gap-5">
        <div className="coin-logo w-20 h-20 rounded-3xl flex items-center justify-center text-4xl">🪙</div>
        <div className="w-10 h-10 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
        <p className="font-montserrat text-gray-500 text-sm">Загрузка...</p>
      </div>
    );
  }

  if (!isReady) {
    return <ModelLoader onModelLoaded={loadFromFile} isLoading={isLoading} error={error} />;
  }

  return (
    <div className="app-root flex flex-col h-screen overflow-hidden">
      <header className="flex items-center px-5 pt-4 pb-3 z-20 relative">
        <div className="flex items-center gap-3 flex-1">
          <div className="coin-logo w-10 h-10 rounded-2xl flex items-center justify-center text-xl">🪙</div>
          <div>
            <h1 className="font-montserrat font-black text-white text-lg leading-none">CoinScan</h1>
            <p className="font-montserrat text-xs text-gray-500 leading-none mt-0.5 max-w-[160px] truncate" title={modelName ?? ""}>
              {modelName ?? "Детектор монет"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "camera" && (
            <div className="live-badge flex items-center gap-1.5 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="font-montserrat text-xs text-white font-semibold">LIVE</span>
            </div>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="glass-badge w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Настройки"
          >
            <Icon name="Settings2" size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {tab === "camera" ? (
          <CameraView
            onCoinsDetected={handleCoinsDetected}
            isActive={tab === "camera"}
            runInference={runInference}
          />
        ) : (
          <div className="h-full">
            <StatsView
              sessions={sessions}
              totalDetections={totalDetections}
              peakCount={peakCount}
              onClear={handleClear}
            />
          </div>
        )}
      </main>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        modelName={modelName}
        confThresh={confThresh}
        setConfThresh={setConfThresh}
        iouThresh={iouThresh}
        setIouThresh={setIouThresh}
        onChangeModel={clearModel}
      />

      <nav className="bottom-nav flex items-center justify-around px-6 py-3 z-20 relative">
        <button
          onClick={() => setTab("camera")}
          className={`nav-btn flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all duration-300 ${tab === "camera" ? "nav-btn-active" : ""}`}
        >
          <Icon name="Camera" size={22} />
          <span className="font-montserrat text-xs font-semibold">Камера</span>
        </button>
        <button
          onClick={() => setTab("stats")}
          className={`nav-btn flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all duration-300 relative ${tab === "stats" ? "nav-btn-active" : ""}`}
        >
          <Icon name="BarChart2" size={22} />
          <span className="font-montserrat text-xs font-semibold">Статистика</span>
          {sessions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-black text-[10px] font-black font-montserrat flex items-center justify-center">
              {Math.min(sessions.length, 99)}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}