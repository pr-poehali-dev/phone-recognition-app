import { useMemo } from "react";
import Icon from "@/components/ui/icon";

interface SessionRecord {
  timestamp: number;
  count: number;
}

interface StatsViewProps {
  sessions: SessionRecord[];
  totalDetections: number;
  peakCount: number;
  onClear: () => void;
}

export default function StatsView({ sessions, totalDetections, peakCount, onClear }: StatsViewProps) {
  const recent = useMemo(() => [...sessions].reverse().slice(0, 10), [sessions]);

  const avgPerSession = useMemo(() => {
    if (sessions.length === 0) return 0;
    return Math.round(sessions.reduce((a, s) => a + s.count, 0) / sessions.length);
  }, [sessions]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const maxBar = Math.max(1, ...recent.map(s => s.count));

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 px-4 pt-4 gap-5">

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card p-4 rounded-3xl flex flex-col items-center gap-1">
          <div className="text-3xl font-black font-montserrat text-amber-300">{totalDetections}</div>
          <div className="text-xs text-gray-400 font-montserrat text-center leading-tight">Всего<br/>засечений</div>
        </div>
        <div className="stat-card p-4 rounded-3xl flex flex-col items-center gap-1">
          <div className="text-3xl font-black font-montserrat text-emerald-400">{peakCount}</div>
          <div className="text-xs text-gray-400 font-montserrat text-center leading-tight">Максимум<br/>в кадре</div>
        </div>
        <div className="stat-card p-4 rounded-3xl flex flex-col items-center gap-1">
          <div className="text-3xl font-black font-montserrat text-sky-400">{avgPerSession}</div>
          <div className="text-xs text-gray-400 font-montserrat text-center leading-tight">Среднее<br/>за сессию</div>
        </div>
      </div>

      <div className="stat-card p-5 rounded-3xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-montserrat font-bold text-white text-base">Активность</h3>
          <span className="text-xs text-gray-500 font-montserrat">{sessions.length} событий</span>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="text-4xl">📊</div>
            <p className="text-gray-500 font-montserrat text-sm text-center">Наведите камеру на монеты,<br/>чтобы начать сбор статистики</p>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {recent.map((s, i) => (
              <div key={s.timestamp} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="bar-item w-full rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${Math.max(4, (s.count / maxBar) * 80)}px`,
                    background: `linear-gradient(to top, #f59e0b, #fbbf24)`,
                    opacity: 0.4 + 0.6 * (i / recent.length),
                  }}
                />
                <span className="text-[9px] text-gray-600 font-montserrat">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="stat-card p-5 rounded-3xl">
          <h3 className="font-montserrat font-bold text-white text-base mb-3">Последние события</h3>
          <div className="flex flex-col gap-2">
            {recent.slice(0, 6).map((s) => (
              <div key={s.timestamp} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center">
                    <span className="text-sm">🪙</span>
                  </div>
                  <div>
                    <div className="text-white font-montserrat text-sm font-semibold">
                      {s.count} {s.count === 1 ? "монета" : s.count < 5 ? "монеты" : "монет"}
                    </div>
                    <div className="text-gray-500 font-montserrat text-xs">{formatTime(s.timestamp)}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(s.count, 5) }).map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  ))}
                  {s.count > 5 && <span className="text-amber-400 text-xs font-montserrat">+{s.count - 5}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <button
          onClick={onClear}
          className="flex items-center justify-center gap-2 py-3 px-6 rounded-2xl border border-red-500/30 text-red-400 font-montserrat text-sm hover:bg-red-500/10 transition-colors"
        >
          <Icon name="Trash2" size={16} />
          Очистить статистику
        </button>
      )}
    </div>
  );
}
