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
      minHandDetectionConfidence: 0.3, // Tối ưu: Tăng threshold giảm false positives
      minHandPresenceConfidence: 0.3, // Tối ưu: Thêm tham số giảm nhiễu
    },
  },
  face: {
    class: FaceLandmarker,
    options: {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: false, // Tối ưu: Tắt blendshapes nếu không cần
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.3, // Tối ưu: Tăng threshold giảm false positives
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
      minPoseDetectionConfidence: 0.3, // Tối ưu: Tăng threshold giảm false positives
    },
  },
};

// Tối ưu: Sử dụng biến toàn cục để lưu trữ filesetResolver
let filesetResolver: any = null;

// Tối ưu: Quan lý frame tốt hơn
let isDetecting = false;
const MAX_QUEUE_SIZE = 1; // Tối ưu: Giảm kích thước hàng đợi để luôn xử lý frame mới nhất
const frameQueue: any[] = [];

// Tối ưu: Thêm bộ đếm skip frame cho các mô hình khác nhau
const frameSkipCounter: { [key: string]: number } = {
  face: 0,
  pose: 0,
  hair: 0
};

// Tối ưu: Đặt số frame bỏ qua cho từng loại mô hình
const SKIP_FRAMES = {
  face: 4, // Chỉ phát hiện mỗi 5 frame
  pose: 6, // Chỉ phát hiện mỗi 7 frame
  hair: 6 // Chỉ phát hiện mỗi 7 frame
};

// Tối ưu: Cải tiến hàm xử lý detect
const handleDetect = async () => {
  // Chỉ xử lý khi hàng đợi có frame và không có phát hiện nào đang chạy
  if (frameQueue.length > 0 && !isDetecting) {
    isDetecting = true;
    
    // Lấy frame mới nhất từ hàng đợi
    const { imageBitmap, timestamp, modelTypes } = frameQueue.pop()!;
    
    // Xóa tất cả các frame cũ còn lại trong hàng đợi
    while (frameQueue.length > 0) {
      const oldFrame = frameQueue.shift();
      if (oldFrame?.imageBitmap) {
        oldFrame.imageBitmap.close();
      }
    }
    
    try {
      const results: { [key: string]: any } = {};
      const processingPromises = [];
      
      // Xử lý từng loại mô hình được yêu cầu
      for (const modelType of modelTypes) {
        if (models[modelType]) {
          // Tối ưu: Kiểm tra xem có cần phải bỏ qua frame cho mô hình này không
          if (modelType === "hand" || shouldProcessFrame(modelType)) {
            processingPromises.push(
              // Tối ưu: Sử dụng Promise.all để xử lý song song
              processModel(modelType, imageBitmap, timestamp).then(result => {
                results[modelType] = result;
              })
            );
          }
        }
      }
      
      // Đợi tất cả các mô hình xử lý xong
      await Promise.all(processingPromises);
      
      // Gửi kết quả về main thread
      self.postMessage({ type: "detectionResult", results });
    } catch (err) {
      self.postMessage({ type: "detectionResult", error: (err as Error).message });
      console.error("[VisionWorker] Detection error:", err);
    } finally {
      // Đóng imageBitmap để giải phóng bộ nhớ
      imageBitmap.close();
      isDetecting = false;
      
      // Kiểm tra xem còn frame nào trong hàng đợi không
      if (frameQueue.length > 0) {
        // Tối ưu: Sử dụng setTimeout thay vì gọi trực tiếp để tránh stack overflow
        setTimeout(handleDetect, 0);
      }
    }
  }
};

// Tối ưu: Hàm kiểm tra xem có nên xử lý frame hiện tại cho một mô hình cụ thể không
const shouldProcessFrame = (modelType: string): boolean => {
  if (!(modelType in frameSkipCounter)) return true;
  
  frameSkipCounter[modelType]++;
  if (frameSkipCounter[modelType] >= SKIP_FRAMES[modelType]) {
    frameSkipCounter[modelType] = 0;
    return true;
  }
  return false;
};

// Tối ưu: Tách việc xử lý mô hình thành một hàm riêng
const processModel = async (modelType: string, imageBitmap: ImageBitmap, timestamp: number) => {
  return await models[modelType].detectForVideo(imageBitmap, timestamp);
};

// Tối ưu: Xử lý message từ main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === "initialize") {
    const { modelType } = data;
    if (!modelConfigs[modelType]) {
      self.postMessage({ type: "initialized", success: false, error: `Unknown model type: ${modelType}` });
      return;
    }

    try {
      // Tối ưu: Khởi tạo filesetResolver một lần duy nhất
      if (!filesetResolver) {
        // Tối ưu: Sử dụng CDN phiên bản cụ thể để tránh thay đổi không đoán trước
        filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
      }

      // Chỉ tạo mô hình nếu chưa tồn tại
      if (!models[modelType]) {
        const { class: ModelClass, options } = modelConfigs[modelType];
        models[modelType] = await ModelClass.createFromOptions(filesetResolver, options);
        
        // Khởi tạo bộ đếm frame bỏ qua
        if (modelType in SKIP_FRAMES) {
          frameSkipCounter[modelType] = 0;
        }
      }

      self.postMessage({ type: "initialized", success: true, modelType });
    } catch (err) {
      self.postMessage({ type: "initialized", success: false, modelType, error: (err as Error).message });
      console.error(`[VisionWorker] Error initializing model ${modelType}:`, err);
    }
  }

  if (type === "detect") {
    const { imageBitmap, timestamp, modelTypes } = data;
    
    // Tối ưu: Giới hạn kích thước hàng đợi
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      // Loại bỏ frame cũ nhất nếu hàng đợi đầy
      const oldestFrame = frameQueue.shift();
      if (oldestFrame?.imageBitmap) {
        oldestFrame.imageBitmap.close();
      }
    }
    
    // Thêm frame mới vào hàng đợi
    frameQueue.push({ imageBitmap, timestamp, modelTypes });
    
    // Kiểm tra xem có đang phát hiện không, nếu không thì bắt đầu
    if (!isDetecting) {
      handleDetect();
    }
  }

  if (type === "cleanup") {
    const { modelType } = data;
    
    // Xử lý giải phóng mô hình cụ thể
    if (modelType && models[modelType]) {
      models[modelType].close();
      delete models[modelType];
      self.postMessage({ type: "cleaned", success: true, modelType });
    } 
    // Xử lý giải phóng tất cả mô hình
    else if (!modelType) {
      Object.keys(models).forEach((key) => {
        models[key].close();
        delete models[key];
      });
      
      // Xóa tất cả frame trong hàng đợi
      while (frameQueue.length > 0) {
        const frame = frameQueue.shift();
        if (frame?.imageBitmap) {
          frame.imageBitmap.close();
        }
      }
      
      self.postMessage({ type: "cleaned", success: true });
    }
  }
};
