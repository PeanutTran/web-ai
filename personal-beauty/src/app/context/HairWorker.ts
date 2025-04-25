/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/VisionWorker.ts

import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

const models: { [key: string]: any } = {};

const hairColorList = [
  { name: "Đen tuyền", rgb: [10, 10, 10] },
  { name: "Đen ánh nâu", rgb: [40, 30, 30] },
  { name: "Nâu đen", rgb: [60, 40, 30] },
  { name: "Nâu hạt dẻ", rgb: [90, 60, 40] },
  { name: "Nâu socola", rgb: [120, 80, 60] },
  { name: "Nâu sữa", rgb: [150, 100, 80] },
  { name: "Nâu caramel", rgb: [170, 120, 80] },
  { name: "Nâu sáng", rgb: [200, 140, 90] },
  { name: "Vàng đồng", rgb: [220, 160, 60] },
  { name: "Vàng nghệ", rgb: [255, 197, 0] },
  { name: "Cam sáng", rgb: [255, 130, 60] },
  { name: "Đỏ nâu", rgb: [170, 60, 60] },
  { name: "Đỏ rượu vang", rgb: [120, 30, 50] },
  { name: "Đỏ tím", rgb: [160, 40, 90] },
  { name: "Đỏ tươi", rgb: [220, 40, 60] },
  { name: "Tím ánh đỏ", rgb: [180, 60, 120] },
  { name: "Xám khói", rgb: [180, 180, 180] },
  { name: "Bạch kim", rgb: [245, 245, 245] },
  { name: "Xanh rêu", rgb: [100, 120, 90] },
  { name: "Xám lạnh", rgb: [130, 130, 130] },
];

let filesetResolver: any = null;
// let isDetecting = false;

  function getNearestHairColorName(r: number, g: number, b: number) {
  let minDistance = Infinity;
  let bestMatch = "Không xác định";

  for (const color of hairColorList) {
    const [cr, cg, cb] = color.rgb;
    const distance = Math.sqrt(
      Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = color.name;
    }
  }

  return bestMatch;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === "initialize") {
    try {
      if (!filesetResolver) {
        filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        //console.log("[VisionWorker] FilesetResolver initialized");
      }

      if (!models['hair']) {
        models['hair'] = await ImageSegmenter.createFromOptions(filesetResolver, {
          baseOptions: {
              modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
              delegate: "GPU"
          },
          runningMode: "VIDEO", 
          outputCategoryMask: true,
          outputConfidenceMasks: false
        });
      }

      self.postMessage({ type: "initialized", success: true, modelType: 'hair' });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType: 'hair', error: (err as Error).message });
    }
  }

  if (type === "detect") {
    // if (isDetecting) {
    //   return;
    // }
    // isDetecting = true;
    const { imageBitmap, timestamp } = data;
    try {
      const results: { [key: string]: any } = {};
      const data = models['hair'].segmentForVideo(imageBitmap, timestamp);
      if (data && data.categoryMask) {
        const mask = data.categoryMask;
        const { width, height } = mask;
        const maskData = mask.getAsUint8Array();
        results['hair'] = {
          mask: maskData,
          width,
          height,
          timestamp
        }
        self.postMessage({ type: "detectionResult", results });
      }
    } catch (err) {
      self.postMessage({ type: "detectionResult", error: (err as Error).message });
      console.log("[VisionWorker] Detection error:", (err as Error).message);
    } finally {
      // isDetecting = false;
    }
  }

  if (type === "hairColor") {
    // Tính toán màu trung bình của tóc
    let rTotal = 0,
      gTotal = 0,
      bTotal = 0;
    for (const i of data.hairPixelIndices) {
      const pixelIndex = i * 4; // Chỉ số trong mảng `data` (RGBA)
      rTotal += data.data[pixelIndex]; // Tổng giá trị màu đỏ
      gTotal += data.data[pixelIndex + 1]; // Tổng giá trị màu xanh lá
      bTotal += data.data[pixelIndex + 2]; // Tổng giá trị màu xanh dương
    }

    // Tính giá trị trung bình cho từng kênh màu
    const pixelCount = data.hairPixelIndices.length;
    const avgR = Math.round(rTotal / pixelCount);
    const avgG = Math.round(gTotal / pixelCount);
    const avgB = Math.round(bTotal / pixelCount);

    // Làm mượt kết quả qua nhiều khung hình
    const smoothingFactor = 0.8; // Hệ số làm mượt (0.0 - 1.0)
    const prevAvgColor = data.prevAvgColorRef || { r: 0, g: 0, b: 0 };
    const smoothedR = Math.round(
      smoothingFactor * prevAvgColor.r + (1 - smoothingFactor) * avgR
    );
    const smoothedG = Math.round(
      smoothingFactor * prevAvgColor.g + (1 - smoothingFactor) * avgG
    );
    const smoothedB = Math.round(
      smoothingFactor * prevAvgColor.b + (1 - smoothingFactor) * avgB
    );
    const prevAvgColorRef = { r: smoothedR, g: smoothedG, b: smoothedB };

    // Hiển thị kết quả màu tóc
    const hairColorName = getNearestHairColorName(
      smoothedR,
      smoothedG,
      smoothedB
    );
    console.log(12312)
    self.postMessage({ type: "hairColorChecked", success: true, results: {
      hairColorName,
      prevAvgColorRef
    } });
  }

  if (type === "cleanup") {
    const { modelType } = data;
    if (modelType && models[modelType]) {
      models[modelType].close();
      delete models[modelType];
      self.postMessage({ type: "cleaned", success: true, modelType });
      console.log(`[VisionWorker] Cleaned up model ${modelType}`);
    } else if (!modelType) {
      Object.keys(models).forEach((key) => {
        models[key].close();
        delete models[key];
      });
      self.postMessage({ type: "cleaned", success: true });
      console.log("[VisionWorker] Cleaned up all models");
    }
  }
};