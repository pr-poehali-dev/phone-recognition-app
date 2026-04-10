import { useRef, useEffect, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";

interface Coin {
  x: number;
  y: number;
  radius: number;
  confidence: number;
  id: number;
}

interface CameraViewProps {
  onCoinsDetected: (coins: Coin[], timestamp: number) => void;
  isActive: boolean;
}

export default function CameraView({ onCoinsDetected, isActive }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const coinIdRef = useRef(0);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [detectedCount, setDetectedCount] = useState(0);

  const detectCoins = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const octx = overlay.getContext("2d");
    if (!ctx || !octx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }

    const blurred = new Uint8Array(w * h);
    const ksize = 3;
    for (let y = ksize; y < h - ksize; y++) {
      for (let x = ksize; x < w - ksize; x++) {
        let sum = 0, count = 0;
        for (let dy = -ksize; dy <= ksize; dy++) {
          for (let dx = -ksize; dx <= ksize; dx++) {
            sum += gray[(y + dy) * w + (x + dx)];
            count++;
          }
        }
        blurred[y * w + x] = sum / count;
      }
    }

    const edges = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = -blurred[(y - 1) * w + (x - 1)] + blurred[(y - 1) * w + (x + 1)]
          - 2 * blurred[y * w + (x - 1)] + 2 * blurred[y * w + (x + 1)]
          - blurred[(y + 1) * w + (x - 1)] + blurred[(y + 1) * w + (x + 1)];
        const gy = -blurred[(y - 1) * w + (x - 1)] - 2 * blurred[(y - 1) * w + x] - blurred[(y - 1) * w + (x + 1)]
          + blurred[(y + 1) * w + (x - 1)] + 2 * blurred[(y + 1) * w + x] + blurred[(y + 1) * w + (x + 1)];
        edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    const minR = Math.round(Math.min(w, h) * 0.04);
    const maxR = Math.round(Math.min(w, h) * 0.18);
    const threshold = 60;
    const accum: number[] = new Array(w * h).fill(0);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (edges[y * w + x] < threshold) continue;
        for (let r = minR; r <= maxR; r += 2) {
          const steps = Math.round(2 * Math.PI * r / 2);
          for (let s = 0; s < steps; s++) {
            const angle = (2 * Math.PI * s) / steps;
            const cx = Math.round(x - r * Math.cos(angle));
            const cy = Math.round(y - r * Math.sin(angle));
            if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
              accum[cy * w + cx]++;
            }
          }
        }
      }
    }

    const coins: Coin[] = [];
    const minVotes = 25;
    const used = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (accum[y * w + x] < minVotes || used[y * w + x]) continue;
        let maxV = accum[y * w + x];
        let bx = x, by = y;
        for (let dy = -minR; dy <= minR; dy++) {
          for (let dx = -minR; dx <= minR; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (accum[ny * w + nx] > maxV) {
              maxV = accum[ny * w + nx];
              bx = nx; by = ny;
            }
          }
        }
        for (let dy = -minR; dy <= minR; dy++) {
          for (let dx = -minR; dx <= minR; dx++) {
            const nx = bx + dx, ny = by + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) used[ny * w + nx] = 1;
          }
        }

        let bestR = minR, bestScore = 0;
        for (let r = minR; r <= maxR; r += 2) {
          let score = 0;
          const steps = Math.round(2 * Math.PI * r / 2);
          for (let s = 0; s < steps; s++) {
            const angle = (2 * Math.PI * s) / steps;
            const ex = Math.round(bx + r * Math.cos(angle));
            const ey = Math.round(by + r * Math.sin(angle));
            if (ex >= 0 && ex < w && ey >= 0 && ey < h && edges[ey * w + ex] > threshold) score++;
          }
          if (score > bestScore) { bestScore = score; bestR = r; }
        }

        if (bestScore > 8) {
          const tooClose = coins.some(c => {
            const dx = c.x - bx, dy = c.y - by;
            return Math.sqrt(dx * dx + dy * dy) < (c.radius + bestR) * 0.8;
          });
          if (!tooClose) {
            coins.push({ x: bx, y: by, radius: bestR, confidence: Math.min(1, bestScore / 30), id: coinIdRef.current++ });
          }
        }
      }
    }

    octx.clearRect(0, 0, w, h);
    const now = Date.now();

    coins.forEach((coin, idx) => {
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.004 + idx);
      const r = coin.radius * pulse;

      octx.beginPath();
      octx.arc(coin.x, coin.y, r + 4, 0, Math.PI * 2);
      octx.strokeStyle = `rgba(0, 255, 200, ${0.3 * coin.confidence})`;
      octx.lineWidth = 8;
      octx.stroke();

      const grad = octx.createRadialGradient(coin.x - r * 0.3, coin.y - r * 0.3, r * 0.1, coin.x, coin.y, r);
      grad.addColorStop(0, `rgba(255, 220, 50, ${0.15 * coin.confidence})`);
      grad.addColorStop(1, `rgba(255, 140, 0, ${0.05 * coin.confidence})`);
      octx.beginPath();
      octx.arc(coin.x, coin.y, r, 0, Math.PI * 2);
      octx.fillStyle = grad;
      octx.fill();

      octx.beginPath();
      octx.arc(coin.x, coin.y, r, 0, Math.PI * 2);
      octx.strokeStyle = `rgba(255, 220, 50, ${0.9 * coin.confidence})`;
      octx.lineWidth = 3;
      octx.setLineDash([8, 4]);
      octx.lineDashOffset = -(now * 0.05);
      octx.stroke();
      octx.setLineDash([]);

      octx.fillStyle = "rgba(0,0,0,0.6)";
      octx.beginPath();
      octx.roundRect(coin.x - 14, coin.y - 12, 28, 22, 4);
      octx.fill();
      octx.fillStyle = "#FFD700";
      octx.font = "bold 13px Montserrat, sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(`${idx + 1}`, coin.x, coin.y + 1);
    });

    setDetectedCount(coins.length);
    onCoinsDetected(coins, now);
  }, [onCoinsDetected]);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
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
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
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
      if (frameCount % 3 !== 0) return;
      if (video.readyState >= 2) detectCoins(video, canvas, overlay);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [detectCoins]);

  const switchCamera = () => {
    setFacingMode(f => f === "environment" ? "user" : "environment");
  };

  if (!isActive) return null;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-4 border-transparent border-t-[#FFD700] animate-spin" />
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
          <div className={`w-2.5 h-2.5 rounded-full ${detectedCount > 0 ? "bg-green-400 animate-pulse" : "bg-gray-400"}`} />
          <span className="text-white font-montserrat text-sm font-semibold">
            {detectedCount > 0 ? `${detectedCount} монет` : "Наведите камеру"}
          </span>
        </div>
        <button
          onClick={switchCamera}
          className="glass-badge w-10 h-10 rounded-full flex items-center justify-center text-white"
        >
          <Icon name="RefreshCw" size={18} />
        </button>
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
