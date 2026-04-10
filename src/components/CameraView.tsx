import { useRef, useEffect, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";
import type { DetectedBox } from "@/hooks/useOnnxModel";

interface CameraViewProps {
  onCoinsDetected: (boxes: DetectedBox[], timestamp: number) => void;
  isActive: boolean;
  runInference: (imageData: ImageData) => Promise<DetectedBox[]>;
}

export default function CameraView({ onCoinsDetected, isActive, runInference }: CameraViewProps) {
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
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const lastBoxesRef = useRef<DetectedBox[]>([]);

  // Sync overlay position to exactly match the visible video area (object-cover)
  const syncOverlay = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const videoAspect = vw / vh;
    const containerAspect = cw / ch;

    let renderedW: number, renderedH: number;
    if (videoAspect > containerAspect) {
      // Video wider than container → top/bottom are filled, sides cropped
      renderedH = ch;
      renderedW = ch * videoAspect;
    } else {
      // Video taller than container → sides are filled, top/bottom cropped
      renderedW = cw;
      renderedH = cw / videoAspect;
    }

    const offsetX = (cw - renderedW) / 2;
    const offsetY = (ch - renderedH) / 2;

    setOverlayStyle({
      position: "absolute",
      left: `${offsetX}px`,
      top: `${offsetY}px`,
      width: `${renderedW}px`,
      height: `${renderedH}px`,
      pointerEvents: "none",
    });
  }, []);

  const takeScreenshot = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay) return;

    const w = video.videoWidth || overlay.width;
    const h = video.videoHeight || overlay.height;
    const shot = document.createElement("canvas");
    shot.width = w;
    shot.height = h;
    const ctx = shot.getContext("2d");
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(video, 0, 0, w, h);

    // Draw overlay (boxes) on top — static, no animation
    const boxes = lastBoxesRef.current;
    boxes.forEach((box, idx) => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const rx = box.w / 2;
      const ry = box.h / 2;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 5, ry + 5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,200,${0.3 * box.confidence})`;
      ctx.lineWidth = 9;
      ctx.stroke();

      const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, rx * 0.05, cx, cy, rx);
      grad.addColorStop(0, `rgba(255,220,50,${0.14 * box.confidence})`);
      grad.addColorStop(1, `rgba(255,140,0,${0.05 * box.confidence})`);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,215,0,${0.95 * box.confidence})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      const label = `${idx + 1}`;
      const lw = 26 + label.length * 4;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(cx - lw / 2, cy - 11, lw, 22, 5);
      ctx.fill();
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 13px Montserrat, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 1);
    });

    // Banner at bottom
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

    // Flash effect
    setShotFlash(true);
    setTimeout(() => setShotFlash(false), 200);

    // Download
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
      const pulse = 0.92 + 0.08 * Math.sin(now * 0.005 + idx);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const rx = (box.w / 2) * pulse;
      const ry = (box.h / 2) * pulse;

      octx.beginPath();
      octx.ellipse(cx, cy, rx + 6, ry + 6, 0, 0, Math.PI * 2);
      octx.strokeStyle = `rgba(0, 255, 200, ${0.25 * box.confidence})`;
      octx.lineWidth = 10;
      octx.stroke();

      const grad = octx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, rx * 0.05, cx, cy, rx);
      grad.addColorStop(0, `rgba(255, 220, 50, ${0.12 * box.confidence})`);
      grad.addColorStop(1, `rgba(255, 140, 0, ${0.04 * box.confidence})`);
      octx.beginPath();
      octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      octx.fillStyle = grad;
      octx.fill();

      octx.beginPath();
      octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      octx.strokeStyle = `rgba(255, 215, 0, ${0.95 * box.confidence})`;
      octx.lineWidth = 2.5;
      octx.setLineDash([9, 5]);
      octx.lineDashOffset = -(now * 0.06);
      octx.stroke();
      octx.setLineDash([]);

      const label = `${idx + 1}`;
      const lw = 26 + label.length * 4;
      octx.fillStyle = "rgba(0,0,0,0.65)";
      octx.beginPath();
      octx.roundRect(cx - lw / 2, cy - 11, lw, 22, 5);
      octx.fill();
      octx.fillStyle = "#FFD700";
      octx.font = "bold 13px Montserrat, sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(label, cx, cy + 1);

      const barW = Math.min(box.w * 0.7, 60);
      const barX = cx - barW / 2;
      const barY = box.y + box.h + 6;
      octx.fillStyle = "rgba(0,0,0,0.4)";
      octx.beginPath();
      octx.roundRect(barX, barY, barW, 5, 3);
      octx.fill();
      octx.fillStyle = `hsl(${box.confidence * 120}, 100%, 55%)`;
      octx.beginPath();
      octx.roundRect(barX, barY, barW * box.confidence, 5, 3);
      octx.fill();
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

    canvas.width = w;
    canvas.height = h;
    overlay.width = w;
    overlay.height = h;

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

  // Sync overlay when video metadata is ready or container resizes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => syncOverlay();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("resize", onMeta);
    const ro = new ResizeObserver(() => syncOverlay());
    if (containerRef.current) ro.observe(containerRef.current);
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

    let frameCount = 0;
    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop);
      frameCount++;
      if (frameCount % 2 !== 0) return;
      if (video.readyState >= 2) processFrame(video, canvas, overlay);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [processFrame]);

  if (!isActive) return null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={overlayCanvasRef} style={overlayStyle} />

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

      {/* Flash overlay */}
      {shotFlash && (
        <div className="absolute inset-0 bg-white z-30 pointer-events-none animate-shot-flash" />
      )}

      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Bottom controls */}
      <div className="absolute bottom-10 left-4 right-4 flex items-center justify-between z-10">
        {detectedCount > 0 ? (
          <div className="coin-badge px-4 py-2.5 rounded-3xl flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <span className="text-white font-montserrat font-black text-lg">{detectedCount}</span>
            <span className="text-amber-300 font-montserrat text-xs">монет</span>
          </div>
        ) : (
          <div />
        )}

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