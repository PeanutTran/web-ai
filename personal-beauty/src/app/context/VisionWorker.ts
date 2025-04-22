/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/VisionWorker.ts

import { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const models: { [key: string]: any } = {};
const modelConfigs: { [key: string]: any } = {
  hand: {
    class: HandLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
      //minHandDetectionConfidence: 0.2, // Giảm xuống 0.2 để tăng độ nhạy
    },
  },
  face: {
    class: FaceLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1,
    },
  },
  hair: {
    class: ImageSegmenter,
    options: {
      baseOptions: {
          modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
          delegate: "GPU"
      },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false
    },
  },
  pose: {
    class: PoseLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker/float16/1/pose_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    },
  },
};

let filesetResolver: any = null;
let frameCounter = 0;
let isDetecting = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === "initialize") {
    const { modelType } = data;
    if (!modelConfigs[modelType]) {
      self.postMessage({ type: "initialized", success: false, error: `Unknown model type: ${modelType}` });
      return;
    }

    try {
      if (!filesetResolver) {
        filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        //console.log("[VisionWorker] FilesetResolver initialized");
      }

      if (!models[modelType]) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models[modelType] = await ModelClass.createFromOptions(filesetResolver, options);
        //console.log(`[VisionWorker] Model ${modelType} created successfully`);
      }

      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.log(`[VisionWorker] Error initializing model ${modelType}:`, (err as Error).message);
    }
  }

  if (type === "detect") {
    if (isDetecting) {
      return;   // Đang bận -> bỏ frame này luôn
    }
    isDetecting = true;

    const { imageBitmap, timestamp, modelTypes } = data;
    // Ghi lại thời gian nhận dữ liệu từ WebcamContext
    const receiveTime = performance.now();
    // console.log(`[VisionWorker] Received imageData at: ${receiveTime}ms, timestamp: ${timestamp}`);
    try {
      frameCounter++;
      //const imageBitmap = await createImageBitmap(imageData);
      const results: { [key: string]: any } = {};
      //const startDetectionTime = performance.now();
      for (const modelType of modelTypes) {
        if (models[modelType]) {

          if (modelType !== "hand" && frameCounter % 3 !== 0) {
            results[modelType] = models[modelType].detectForVideo(imageBitmap, timestamp);
          } else {
            results[modelType] = models[modelType].detectForVideo(imageBitmap, timestamp);
          }
          //console.log(`[VisionWorker] Detection result for ${modelType}:`, results[modelType]);
        }
      }
      //console.log(`[VisionWorker] Detection took: ${(performance.now() - startDetectionTime).toFixed(2)}ms`);

      // Ghi lại thời gian hoàn thành xử lý và gửi kết quả
      const sendTime = performance.now();
      console.log(`[VisionWorker] Sending detection results at: ${sendTime}ms, processing time: ${(sendTime - receiveTime).toFixed(2)}ms`);
      //await Promise.all(promises);
      self.postMessage({ type: "detectionResult", results });
      imageBitmap.close();
    } catch (err) {
      self.postMessage({ type: "detectionResult", error: (err as Error).message });
      console.log("[VisionWorker] Detection error:", (err as Error).message);
    } finally {
      isDetecting = false;
    }
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