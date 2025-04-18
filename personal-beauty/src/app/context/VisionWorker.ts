// src/app/context/VisionWorker.ts

import { HandLandmarker, FaceLandmarker, PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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
        console.log("[VisionWorker] FilesetResolver initialized");
      }

      if (!models[modelType]) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models[modelType] = await ModelClass.createFromOptions(filesetResolver, options);
        console.log(`[VisionWorker] Model ${modelType} created successfully`);
      }

      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.log(`[VisionWorker] Error initializing model ${modelType}:`, (err as Error).message);
    }
  }

  if (type === "detect") {
    const { imageData, timestamp, modelTypes } = data;

    try {
      const imageBitmap = await createImageBitmap(imageData);
      const results: { [key: string]: any } = {};

      for (const modelType of modelTypes) {
        if (models[modelType]) {
          results[modelType] = await models[modelType].detectForVideo(imageBitmap, timestamp);
          //console.log(`[VisionWorker] Detection result for ${modelType}:`, results[modelType]);
        }
      }
      self.postMessage({ type: "detectionResult", results });
      imageBitmap.close();
    } catch (err) {
      self.postMessage({ type: "detectionResult", error: (err as Error).message });
      console.log("[VisionWorker] Detection error:", (err as Error).message);
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