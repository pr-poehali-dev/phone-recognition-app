import { useState, useCallback, useRef } from "react";
import CameraView from "@/components/CameraView";
import StatsView from "@/components/StatsView";
import Icon from "@/components/ui/icon";

type Tab = "camera" | "stats";

interface SessionRecord {
  timestamp: number;
  count: number;
}

interface Coin {
  x: number;
  y: number;
  radius: number;
  confidence: number;
  id: number;
}

export default function Index() {
  const [tab, setTab] = useState<Tab>("camera");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [peakCount, setPeakCount] = useState(0);
  const lastLogRef = useRef<number>(0);
  const lastCountRef = useRef<number>(0);

  const handleCoinsDetected = useCallback((coins: Coin[], ts: number) => {
    if (ts - lastLogRef.current < 2000) return;
    if (coins.length === 0) return;
    if (coins.length === lastCountRef.current && ts - lastLogRef.current < 5000) return;
    lastLogRef.current = ts;
    lastCountRef.current = coins.length;

    setSessions(prev => [...prev, { timestamp: ts, count: coins.length }]);
    setTotalDetections(prev => prev + coins.length);
    setPeakCount(prev => Math.max(prev, coins.length));
  }, []);

  const handleClear = () => {
    setSessions([]);
    setTotalDetections(0);
    setPeakCount(0);
    lastLogRef.current = 0;
    lastCountRef.current = 0;
  };

  return (
    <div className="app-root flex flex-col h-screen overflow-hidden">
      <header className="flex items-center px-5 pt-4 pb-3 z-20 relative">
        <div className="flex items-center gap-3 flex-1">
          <div className="coin-logo w-10 h-10 rounded-2xl flex items-center justify-center text-xl">🪙</div>
          <div>
            <h1 className="font-montserrat font-black text-white text-lg leading-none">CoinScan</h1>
            <p className="font-montserrat text-xs text-gray-400 leading-none mt-0.5">Детектор монет</p>
          </div>
        </div>
        {tab === "camera" && (
          <div className="live-badge flex items-center gap-1.5 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="font-montserrat text-xs text-white font-semibold">LIVE</span>
          </div>
        )}
      </header>

      <main className="flex-1 relative overflow-hidden">
        {tab === "camera" ? (
          <CameraView onCoinsDetected={handleCoinsDetected} isActive={tab === "camera"} />
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
