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
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const inferringRef = useRef(false);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [detectedCount, setDetectedCount] = useState(0);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });

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
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

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

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {detectedCount > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <div className="coin-badge px-6 py-3 rounded-3xl flex items-center gap-3">
            <span className="text-2xl">🪙</span>
            <span className="text-white font-montserrat font-black text-xl">{detectedCount}</span>
            <span className="text-amber-300 font-montserrat text-sm">монет в кадре</span>
          </div>
        </div>
      )}
    </div>
  );
}
