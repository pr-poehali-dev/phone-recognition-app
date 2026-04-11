import { useRef, useEffect, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import type { DetectedBox } from "@/hooks/useOnnxModel";

interface CameraViewProps {
  onCoinsDetected: (boxes: DetectedBox[], timestamp: number) => void;
  onResetCount?: () => void;
  isActive: boolean;
  runInference: (imageData: ImageData) => Promise<DetectedBox[]>;
}

export default function CameraView({ onCoinsDetected, onResetCount, isActive, runInference }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const inferringRef = useRef(false);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [detectedCount, setDetectedCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [shotFlash, setShotFlash] = useState(false);
  const [overlayRect, setOverlayRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const lastBoxesRef = useRef<DetectedBox[]>([]);

  const syncOverlay = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / vw, ch / vh);
    const rw = vw * scale;
    const rh = vh * scale;
    setOverlayRect({ left: (cw - rw) / 2, top: (ch - rh) / 2, width: rw, height: rh });
  }, []);

  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const shot = document.createElement("canvas");
    shot.width = w;
    shot.height = h;
    const ctx = shot.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    const boxes = lastBoxesRef.current;
    boxes.forEach((box, idx) => {
      const pad = 4;
      const x = box.x - pad;
      const y = box.y - pad;
      const bw = box.w + pad * 2;
      const bh = box.h + pad * 2;
      const r = 6;

      // glow
      ctx.shadowColor = "rgba(255,215,0,0.6)";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(255,215,0,${0.9 * box.confidence})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, r);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // fill
      ctx.fillStyle = `rgba(255,215,0,${0.08 * box.confidence})`;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, r);
      ctx.fill();

      // label
      const label = `#${idx + 1}`;
      const lw = ctx.measureText(label).width + 14;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.roundRect(x, y - 20, lw, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 11px Montserrat, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 7, y - 11);
    });

    const bannerH = 56;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, h - bannerH, w, bannerH);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 22px Montserrat, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`🪙 Монет: ${boxes.length}`, 20, h - bannerH / 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "13px Montserrat, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleString("ru-RU"), w - 16, h - bannerH / 2);

    setShotFlash(true);
    setTimeout(() => setShotFlash(false), 200);

    const link = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    link.download = `coinscan-${ts}.jpg`;
    link.href = shot.toDataURL("image/jpeg", 0.92);
    link.click();
  }, []);

  const drawBoxes = useCallback((boxes: DetectedBox[], overlay: HTMLCanvasElement) => {
    const octx = overlay.getContext("2d");
    if (!octx) return;
    const w = overlay.width;
    const h = overlay.height;
    octx.clearRect(0, 0, w, h);
    const now = Date.now();

    boxes.forEach((box, idx) => {
      const pulse = 1 + 0.03 * Math.sin(now * 0.006 + idx);
      const pad = 4 * pulse;
      const x = box.x - pad;
      const y = box.y - pad;
      const bw = box.w + pad * 2;
      const bh = box.h + pad * 2;
      const r = 7;

      // outer glow ring
      octx.shadowColor = "rgba(255,215,0,0.5)";
      octx.shadowBlur = 14;
      octx.strokeStyle = `rgba(255,215,0,${0.85 * box.confidence})`;
      octx.lineWidth = 2.5;
      octx.setLineDash([10, 5]);
      octx.lineDashOffset = -(now * 0.05);
      octx.beginPath();
      octx.roundRect(x, y, bw, bh, r);
      octx.stroke();
      octx.setLineDash([]);
      octx.shadowBlur = 0;

      // subtle fill
      octx.fillStyle = `rgba(255,215,0,${0.07 * box.confidence})`;
      octx.beginPath();
      octx.roundRect(x, y, bw, bh, r);
      octx.fill();

      // corner marks
      const cm = 10;
      octx.strokeStyle = `rgba(255,255,255,${0.9 * box.confidence})`;
      octx.lineWidth = 2;
      octx.setLineDash([]);
      // TL
      octx.beginPath(); octx.moveTo(x + r, y); octx.lineTo(x + r + cm, y); octx.moveTo(x, y + r); octx.lineTo(x, y + r + cm); octx.stroke();
      // TR
      octx.beginPath(); octx.moveTo(x + bw - r - cm, y); octx.lineTo(x + bw - r, y); octx.moveTo(x + bw, y + r); octx.lineTo(x + bw, y + r + cm); octx.stroke();
      // BL
      octx.beginPath(); octx.moveTo(x + r, y + bh); octx.lineTo(x + r + cm, y + bh); octx.moveTo(x, y + bh - r - cm); octx.lineTo(x, y + bh - r); octx.stroke();
      // BR
      octx.beginPath(); octx.moveTo(x + bw - r - cm, y + bh); octx.lineTo(x + bw - r, y + bh); octx.moveTo(x + bw, y + bh - r - cm); octx.lineTo(x + bw, y + bh - r); octx.stroke();

      // label badge above box
      const label = `#${idx + 1}`;
      const labelW = octx.measureText(label).width + 14;
      const labelH = 18;
      const labelX = x;
      const labelY = Math.max(0, y - labelH - 3);
      octx.fillStyle = "rgba(0,0,0,0.75)";
      octx.beginPath();
      octx.roundRect(labelX, labelY, labelW, labelH, 4);
      octx.fill();
      octx.fillStyle = "#FFD700";
      octx.font = "bold 11px Montserrat, sans-serif";
      octx.textAlign = "left";
      octx.textBaseline = "middle";
      octx.fillText(label, labelX + 7, labelY + labelH / 2);

      // confidence bar below box
      if (y + bh + 10 < h) {
        const barW = Math.min(bw * 0.8, 70);
        const barX = x + (bw - barW) / 2;
        const barY = y + bh + 5;
        octx.fillStyle = "rgba(0,0,0,0.4)";
        octx.beginPath(); octx.roundRect(barX, barY, barW, 4, 2); octx.fill();
        octx.fillStyle = `hsl(${box.confidence * 120},100%,55%)`;
        octx.beginPath(); octx.roundRect(barX, barY, barW * box.confidence, 4, 2); octx.fill();
      }
    });
  }, []);

  const processFrame = useCallback(async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
  ) => {
    if (inferringRef.current) return;
    inferringRef.current = true;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) { inferringRef.current = false; return; }

    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { inferringRef.current = false; return; }

    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);

    try {
      const boxes = await runInference(imageData);
      lastBoxesRef.current = boxes;
      drawBoxes(boxes, overlay);
      setDetectedCount(boxes.length);
      onCoinsDetected(boxes, Date.now());

      fpsRef.current.frames++;
      const now = performance.now();
      if (now - fpsRef.current.last >= 1000) {
        setFps(fpsRef.current.frames);
        fpsRef.current.frames = 0;
        fpsRef.current.last = now;
      }
    } finally {
      inferringRef.current = false;
    }
  }, [runInference, drawBoxes, onCoinsDetected]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setHasPermission(true);
    } catch {
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (isActive) startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, startCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;
    const onMeta = () => syncOverlay();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("resize", onMeta);
    const ro = new ResizeObserver(() => syncOverlay());
    ro.observe(container);
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("resize", onMeta);
      ro.disconnect();
    };
  }, [syncOverlay]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !canvas || !overlay) return;
    let fc = 0;
    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop);
      if (++fc % 2 !== 0) return;
      if (video.readyState >= 2) processFrame(video, canvas, overlay);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [processFrame]);

  if (!isActive) return null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline muted autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: "absolute",
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
          height: overlayRect.height,
          pointerEvents: "none",
        }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
            <p className="text-white font-montserrat text-lg">Запуск камеры...</p>
          </div>
        </div>
      )}

      {hasPermission === false && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 p-6">
          <div className="text-center">
            <div className="text-6xl mb-4">📷</div>
            <p className="text-white font-montserrat text-xl font-bold mb-2">Нет доступа к камере</p>
            <p className="text-gray-400 font-montserrat text-sm mb-6">Разрешите доступ к камере в настройках браузера</p>
            <button onClick={startCamera} className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-black font-bold rounded-2xl font-montserrat">
              Попробовать снова
            </button>
          </div>
        </div>
      )}

      {/* Top bar: status + fps + flip */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <div className="glass-badge flex items-center gap-2 px-4 py-2 rounded-2xl">
          <div className={`w-2.5 h-2.5 rounded-full ${detectedCount > 0 ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
          <span className="text-white font-montserrat text-sm font-semibold">
            {detectedCount > 0 ? `${detectedCount} монет` : "Наведите камеру"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass-badge px-3 py-2 rounded-2xl">
            <span className="text-gray-400 font-montserrat text-xs">{fps} fps</span>
          </div>
          <button
            onClick={() => setFacingMode(f => f === "environment" ? "user" : "environment")}
            className="glass-badge w-10 h-10 rounded-full flex items-center justify-center text-white"
          >
            <Icon name="RefreshCw" size={18} />
          </button>
        </div>
      </div>

      {shotFlash && (
        <div className="absolute inset-0 bg-white z-30 pointer-events-none" style={{ animation: "none", opacity: 0.8 }} />
      )}

      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Bottom controls — raised higher */}
      <div className="absolute bottom-16 left-4 right-4 flex items-center justify-between z-10">
        {/* Coin count + reset */}
        <div className="flex flex-col items-start gap-2">
          {detectedCount > 0 ? (
            <div className="coin-badge px-4 py-2.5 rounded-3xl flex items-center gap-2">
              <span className="text-xl">🪙</span>
              <span className="text-white font-montserrat font-black text-lg">{detectedCount}</span>
              <span className="text-amber-300 font-montserrat text-xs">монет</span>
            </div>
          ) : (
            <div className="coin-badge px-4 py-2.5 rounded-3xl flex items-center gap-2 opacity-40">
              <span className="text-xl">🪙</span>
              <span className="text-white font-montserrat text-sm">—</span>
            </div>
          )}
          {onResetCount && (
            <button
              onClick={onResetCount}
              className="glass-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-gray-300 hover:text-white transition-colors"
            >
              <Icon name="RotateCcw" size={13} />
              <span className="font-montserrat text-xs">Сбросить</span>
            </button>
          )}
        </div>

        {/* Screenshot button */}
        <button
          onClick={takeScreenshot}
          className="shot-btn w-16 h-16 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform duration-100"
          title="Сохранить скриншот"
        >
          <div className="shot-btn-inner w-12 h-12 rounded-full flex items-center justify-center">
            <Icon name="Camera" size={22} />
          </div>
        </button>
      </div>
    </div>
  );
}
