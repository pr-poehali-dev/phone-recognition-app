import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import Icon from "@/components/ui/icon";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  modelName: string | null;
  confThresh: number;
  setConfThresh: (v: number) => void;
  iouThresh: number;
  setIouThresh: (v: number) => void;
  onChangeModel: () => void;
}

export default function SettingsSheet({
  open, onClose, modelName,
  confThresh, setConfThresh,
  iouThresh, setIouThresh,
  onChangeModel,
}: SettingsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="settings-sheet rounded-t-3xl border-0 px-6 pb-10 pt-6">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-montserrat font-black text-white text-xl text-left">Настройки</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6">

          {/* Модель */}
          <div className="settings-section p-4 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0">
                <Icon name="Cpu" size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-montserrat text-white text-sm font-semibold">Модель</p>
                <p className="font-montserrat text-gray-500 text-xs truncate max-w-[180px]">{modelName ?? "—"}</p>
              </div>
            </div>
            <button
              onClick={() => { onClose(); onChangeModel(); }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors"
            >
              <Icon name="RefreshCw" size={14} />
              <span className="font-montserrat text-xs font-semibold">Сменить</span>
            </button>
          </div>

          {/* Confidence */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="Target" size={16} />
                <span className="font-montserrat text-white text-sm font-semibold">Порог уверенности</span>
              </div>
              <div className="conf-badge px-3 py-1 rounded-full">
                <span className="font-montserrat font-black text-amber-300 text-sm">{Math.round(confThresh * 100)}%</span>
              </div>
            </div>
            <Slider
              min={5} max={95} step={5}
              value={[Math.round(confThresh * 100)]}
              onValueChange={([v]) => setConfThresh(v / 100)}
              className="conf-slider"
            />
            <div className="flex justify-between">
              <span className="font-montserrat text-gray-600 text-xs">Всё подряд</span>
              <span className="font-montserrat text-gray-600 text-xs">Только точные</span>
            </div>
          </div>

          {/* IOU */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="Layers" size={16} />
                <span className="font-montserrat text-white text-sm font-semibold">Порог перекрытия (NMS)</span>
              </div>
              <div className="conf-badge px-3 py-1 rounded-full">
                <span className="font-montserrat font-black text-sky-300 text-sm">{Math.round(iouThresh * 100)}%</span>
              </div>
            </div>
            <Slider
              min={10} max={90} step={5}
              value={[Math.round(iouThresh * 100)]}
              onValueChange={([v]) => setIouThresh(v / 100)}
              className="iou-slider"
            />
            <div className="flex justify-between">
              <span className="font-montserrat text-gray-600 text-xs">Убирать дубли</span>
              <span className="font-montserrat text-gray-600 text-xs">Оставлять все</span>
            </div>
          </div>

          {/* Hint */}
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/3 border border-white/5">
            <Icon name="Info" size={15} />
            <p className="font-montserrat text-gray-500 text-xs leading-relaxed">
              <b className="text-gray-400">Уверенность</b> — минимальный процент уверенности модели для показа монеты.<br />
              <b className="text-gray-400">Перекрытие</b> — при каком совпадении прямоугольников убирать дубликат.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
