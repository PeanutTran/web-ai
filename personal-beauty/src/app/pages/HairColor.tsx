/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";

export default function HairColor() {
  const { stream, setCurrentView } = useWebcam();
  const { setIsLoading } = useLoading();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
  const prevAvgColorRef = useRef<{ r: number; g: number; b: number } | null>(
    null
  );
  const selectedHairColor = useRef<number[] | null>(null);
  const lastDetectTime = useRef(0);
  const lastSendDetectTime = useRef(0);
  const [isFaceWorkerInitialized, setIsFaceWorkerInitialized] = useState(false);
  const faceWorkerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<any>(null);
  const isVideoReady = useRef(false);

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

  useEffect(() => {
    setCurrentView(VIEWS.HAIR_COLOR);
  }, []);

  useEffect(() => {
    faceWorkerRef.current = new Worker(
      new URL("../context/HairWorker.ts", import.meta.url)
    );
    faceWorkerRef.current.onmessage = (e: MessageEvent) => {
      const { type, error, results, success } = e.data;

      if (type === "initialized") {
        if (success) {
          setIsFaceWorkerInitialized(true);
        }
      }

      if (type === "detectionResult") {
        if (error) {
          console.error("[WebcamProvider] Face detection error:", error);
          return;
        }
        detectHair(results);
      }
      if (type === "hairColorChecked") {
        if (error) {
          console.error("[WebcamProvider] Face detection error:", error);
          return;
        }
        prevAvgColorRef.current = results.prevAvgColorRef;
        setMakeupSuggestion(`Màu tóc của bạn là: ${results.hairColorName}.`);
      }
    };
    faceWorkerRef.current.postMessage({ type: "initialize" });

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (faceWorkerRef.current) {
        faceWorkerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    const video = displayVideoRef.current;
    if (!stream || !isVideoReady.current || !faceWorkerRef.current || !video || !isFaceWorkerInitialized) {
      return;
    }
    if (!ctxRef.current) {
      ctxRef.current = canvasRef.current?.getContext("2d");
    }
    // Face detection runs at lower frame rate (5 FPS)
    const FACE_DETECTION_INTERVAL = 120;
    const detectFace = async () => {
      const now = performance.now();
      if (now - lastSendDetectTime.current < FACE_DETECTION_INTERVAL) {
        animationFrameId.current = requestAnimationFrame(detectFace);
        return;
      }
      lastSendDetectTime.current = now;
      try {
        const imageBitmap = await createImageBitmap(video);
        faceWorkerRef.current!.postMessage(
          {
            type: "detect",
            data: {
              imageBitmap,
              timestamp: now,
            },
          },
          [imageBitmap]
        );
      } catch (err) {
        console.error(
          "[WebcamProvider] Error creating bitmap for hand detection:",
          err
        );
      }

      animationFrameId.current = requestAnimationFrame(detectFace);
    };

    detectFace();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isFaceWorkerInitialized]);

  useEffect(() => {
    // displayVideoRef.current = 
    if (stream && displayVideoRef.current && !isVideoReady.current) {
      displayVideoRef.current.srcObject = stream;
      setTimeout(() => {
        displayVideoRef.current!.play().then(() => {
          isVideoReady.current = true;
          setIsLoading(false);
        }).catch((err) => {
          console.error("[PersonalColor] Error playing video:", err);
        });
      }, 200);
    }
  }, [stream]);

  const detectHair = (result?: any) => {
    try {
      const now = performance.now();
      if (now - lastDetectTime.current < 10) {

        animationFrameId.current = requestAnimationFrame(detectHair);
        return;
      }
      lastDetectTime.current = now;
      if (!canvasRef.current || !displayVideoRef.current) {
        return;
      }

      if (result?.hair) {
        const maskData = result.hair.mask;

        // const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        // Làm sạch canvas trước khi vẽ
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctxRef.current.getImageData(0, 0, result.hair.width, result.hair.height);
        const data = imageData.data;

        const hairPixelIndices = [];
        for (let i = 0; i < maskData.length; i++) {
          if (maskData[i] === 1) {
            hairPixelIndices.push(i); // Lưu chỉ số pixel thuộc tóc
          }
        }
        if (selectedHairColor.current) {
          for (const i of hairPixelIndices) {
            const pixelIndex = i * 4;
            const blendAlpha = 0.5; // Controls RGB blending ratio
            const overlayOpacity = 0.5; // Controls overall opacity (adjust as needed)
        
            // Blend RGB values
            data[pixelIndex] =
              data[pixelIndex] * (1 - blendAlpha) +
              selectedHairColor.current[0] * blendAlpha; // Red
            data[pixelIndex + 1] =
              data[pixelIndex + 1] * (1 - blendAlpha) +
              selectedHairColor.current[1] * blendAlpha; // Green
            data[pixelIndex + 2] =
              data[pixelIndex + 2] * (1 - blendAlpha) +
              selectedHairColor.current[2] * blendAlpha; // Blue
        
            // Set alpha to achieve semi-transparency
            data[pixelIndex + 3] = Math.round(255 * overlayOpacity); // e.g., 50% opacity = 127.5
          }
        }

        ctxRef.current.putImageData(imageData, 0, 0);

        if (hairPixelIndices.length === 0) {
          setMakeupSuggestion("Không thể phát hiện màu tóc.");
          return;
        }

        // Tính toán màu trung bình của tóc
        let rTotal = 0,
          gTotal = 0,
          bTotal = 0;
        for (const i of hairPixelIndices) {
          const pixelIndex = i * 4; // Chỉ số trong mảng `data` (RGBA)
          rTotal += data[pixelIndex]; // Tổng giá trị màu đỏ
          gTotal += data[pixelIndex + 1]; // Tổng giá trị màu xanh lá
          bTotal += data[pixelIndex + 2]; // Tổng giá trị màu xanh dương
        }

        // Tính giá trị trung bình cho từng kênh màu
        const pixelCount = hairPixelIndices.length;
        const avgR = Math.round(rTotal / pixelCount);
        const avgG = Math.round(gTotal / pixelCount);
        const avgB = Math.round(bTotal / pixelCount);

        // Làm mượt kết quả qua nhiều khung hình
        const smoothingFactor = 0.8; // Hệ số làm mượt (0.0 - 1.0)
        const prevAvgColor = prevAvgColorRef.current || { r: 0, g: 0, b: 0 };
        const smoothedR = Math.round(
          smoothingFactor * prevAvgColor.r + (1 - smoothingFactor) * avgR
        );
        const smoothedG = Math.round(
          smoothingFactor * prevAvgColor.g + (1 - smoothingFactor) * avgG
        );
        const smoothedB = Math.round(
          smoothingFactor * prevAvgColor.b + (1 - smoothingFactor) * avgB
        );
        prevAvgColorRef.current = { r: smoothedR, g: smoothedG, b: smoothedB };

        // Hiển thị kết quả màu tóc
        const hairColorName = getNearestHairColorName(
          smoothedR,
          smoothedG,
          smoothedB
        );

        setMakeupSuggestion(`Màu tóc của bạn là: ${hairColorName}.`);
      }
    } catch (err) {
      console.error("[HairColor] Lỗi trong quá trình phân đoạn:", err);
    }

    // Lặp lại quá trình phát hiện tóc
    requestAnimationFrame(detectHair);
  };

  return (
    <div className="flex flex-col gap-8 h-full min-h-[calc(100vh-2rem)] p-4 md:p-8 overflow-hidden bg-gradient-to-r from-pink-100 to-purple-100">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 overflow-hidden">
        <div className="md:w-3/5 px-6 md:px-10 rounded-xl flex flex-col items-center">
          <div
            className="relative w-full overflow-hidden rounded-2xl shadow-lg border-2 border-gray-200 bg-white"
            style={{ paddingTop: "75%" /* 480/640 = 0.75 */ }}
          >
            <video
              ref={displayVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="absolute inset-0 w-full object-contain pointer-events-none"
            />
          </div>
          <div className="flex gap-6 mt-3 flex-1 max-h-[200px] max-w-full overflow-x-auto flex-nowrap mb-1 pb-1">
            {hairColorList.map((color) => (
              <button
                key={color.name}
                className="flex items-center justify-center min-w-[200px] gap-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
                onClick={() => {
                  selectedHairColor.current = color.rgb;
                }}
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{
                    backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
                  }}
                ></div>
                <span className="text-gray-700 font-medium">{color.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="md:w-2/5 bg-white p-4 md:p-6 rounded-xl shadow-md flex flex-col max-h-[calc(100vh-64px)] overflow-hidden">
          <div className="mb-4">
            <h5 className="text-2xl md:text-3xl font-bold text-pink-600">
              Hair Color
            </h5>
            <p className="text-sm md:text-base text-gray-500 mt-2">
              Detect and segment hair regions in video.
            </p>
          </div>
          <hr className="border-gray-200 mb-4" />
          <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
            Analysis Result
          </h2>
          {makeupSuggestion ? (
            <div className="text-lg md:text-xl text-gray-700 mb-4">
              Your result is
              <span className="font-bold text-pink-600">
                <div>{makeupSuggestion}</div>
              </span>
              .
            </div>
          ) : (
            <p className="text-lg md:text-xl text-gray-500 animate-pulse mb-4">
              Waiting for analysis...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
