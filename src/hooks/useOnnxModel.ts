import { useState, useCallback, useRef } from "react";
import * as ort from "onnxruntime-web";

const DB_NAME = "coinscan-db";
const DB_VERSION = 1;
const STORE_NAME = "model";
const MODEL_KEY = "onnx-model";
const META_KEY = "onnx-model-name";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveModelToDB(buffer: ArrayBuffer, name: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(buffer, MODEL_KEY);
    tx.objectStore(STORE_NAME).put(name, META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadModelFromDB(): Promise<{ buffer: ArrayBuffer; name: string } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const bufReq = store.get(MODEL_KEY);
    const nameReq = store.get(META_KEY);
    tx.oncomplete = () => {
      const buffer = bufReq.result as ArrayBuffer | undefined;
      const name = nameReq.result as string | undefined;
      resolve(buffer && name ? { buffer, name } : null);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export interface DetectedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  id: number;
}

export function useOnnxModel() {
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxIdRef = useRef(0);

  const initSession = useCallback(async (buffer: ArrayBuffer) => {
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/";
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: ["wasm"],
    });
    sessionRef.current = session;
  }, []);

  const loadFromFile = useCallback(async (buffer: ArrayBuffer, name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await initSession(buffer);
      await saveModelToDB(buffer, name);
      setModelName(name);
      setIsReady(true);
    } catch (e) {
      setError("Не удалось загрузить модель. Проверь формат файла.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [initSession]);

  const loadFromCache = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const cached = await loadModelFromDB();
      if (!cached) return false;
      await initSession(cached.buffer);
      setModelName(cached.name);
      setIsReady(true);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [initSession]);

  const clearModel = useCallback(async () => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(MODEL_KEY);
    tx.objectStore(STORE_NAME).delete(META_KEY);
    sessionRef.current = null;
    setIsReady(false);
    setModelName(null);
  }, []);

  const runInference = useCallback(async (
    imageData: ImageData,
  ): Promise<DetectedBox[]> => {
    const session = sessionRef.current;
    if (!session) return [];

    const INPUT_SIZE = 320;
    const { width, height } = imageData;
    const scaleX = width / INPUT_SIZE;
    const scaleY = height / INPUT_SIZE;

    const offscreen = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    const ctx = offscreen.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const imgBitmap = await createImageBitmap(imageData);
    ctx.drawImage(imgBitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const resized = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

    const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
      tensor[i] = resized.data[i * 4] / 255;
      tensor[INPUT_SIZE * INPUT_SIZE + i] = resized.data[i * 4 + 1] / 255;
      tensor[2 * INPUT_SIZE * INPUT_SIZE + i] = resized.data[i * 4 + 2] / 255;
    }

    const inputName = session.inputNames[0];
    const feeds: Record<string, ort.Tensor> = {
      [inputName]: new ort.Tensor("float32", tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    };

    const results = await session.run(feeds);
    const outputName = session.outputNames[0];
    const output = results[outputName].data as Float32Array;
    const outputShape = results[outputName].dims;

    const boxes: DetectedBox[] = [];
    const CONF_THRESH = 0.35;
    const IOU_THRESH = 0.45;

    // YOLOv8 output: [1, 5, num_detections] → transpose to [num_det, 5]
    // or [1, num_det, 5] — handle both
    let numDet = 0;
    let stride = 0;
    let isTransposed = false;

    if (outputShape.length === 3) {
      if (outputShape[1] === 5) {
        // [1, 5, num_det] — YOLOv8 standard
        numDet = outputShape[2] as number;
        stride = 1;
        isTransposed = true;
      } else {
        // [1, num_det, 5]
        numDet = outputShape[1] as number;
        stride = outputShape[2] as number;
      }
    } else if (outputShape.length === 2) {
      numDet = outputShape[0] as number;
      stride = outputShape[1] as number;
    }

    const rawBoxes: DetectedBox[] = [];

    for (let i = 0; i < numDet; i++) {
      let cx, cy, bw, bh, conf;
      if (isTransposed) {
        cx = output[0 * numDet + i];
        cy = output[1 * numDet + i];
        bw = output[2 * numDet + i];
        bh = output[3 * numDet + i];
        conf = output[4 * numDet + i];
      } else {
        const base = i * stride;
        cx = output[base];
        cy = output[base + 1];
        bw = output[base + 2];
        bh = output[base + 3];
        conf = output[base + 4];
      }

      if (conf < CONF_THRESH) continue;

      rawBoxes.push({
        x: (cx - bw / 2) * scaleX,
        y: (cy - bh / 2) * scaleY,
        w: bw * scaleX,
        h: bh * scaleY,
        confidence: conf,
        id: boxIdRef.current++,
      });
    }

    // NMS
    rawBoxes.sort((a, b) => b.confidence - a.confidence);
    const suppressed = new Array(rawBoxes.length).fill(false);

    for (let i = 0; i < rawBoxes.length; i++) {
      if (suppressed[i]) continue;
      boxes.push(rawBoxes[i]);
      for (let j = i + 1; j < rawBoxes.length; j++) {
        if (suppressed[j]) continue;
        if (iou(rawBoxes[i], rawBoxes[j]) > IOU_THRESH) suppressed[j] = true;
      }
    }

    return boxes;
  }, []);

  return { isReady, isLoading, modelName, error, loadFromFile, loadFromCache, clearModel, runInference };
}

function iou(a: DetectedBox, b: DetectedBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const aArea = a.w * a.h;
  const bArea = b.w * b.h;
  return inter / (aArea + bArea - inter + 1e-6);
}
