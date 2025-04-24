/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
    DrawingUtils,
    FaceLandmarker,
    FilesetResolver,
    NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

type FacialFeatures = {
    eyeDistance: number;
    faceWidth: number;
    faceHeight: number;
    noseWidth: number;
    lipWidth: number;
    browLength: number;
    cheekboneProminence: number;
    faceShape: "round" | "oval" | "square" | "heart" | "long";
    foreheadHeight: number;
    cheekboneHeight: number;
};

export default function PersonalColor() {
    const { stream, error: webcamError, restartStream } = useWebcam();
    const { setIsLoading } = useLoading();
    const { registerElement, unregisterElement } = useHandControl();
    const [error, setError] = useState<string | null>(null);
    const [isFaceLandmarkerReady, setIsFaceLandmarkerReady] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const [isFaceDetectionActive, setIsFaceDetectionActive] = useState(true);
    const [statusMessage, setStatusMessage] = useState("Face Detection Active");
    const [twoFingersProgress, setTwoFingersProgress] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
    const displayVideoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const videoRenderFrameId = useRef<number | null>(null);
    const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
    const isApplyMakeupRef = useRef(true);
    const lastDetectTime = useRef(0);
    
    // Tham chiếu để tối ưu
    const lastAnalysisTime = useRef(0);
    const lastFeatures = useRef<FacialFeatures | null>(null);
    const lastLandmarks = useRef<NormalizedLandmark[] | null>(null);

    useEffect(() => {
        const initializeFaceLandmarker = async () => {
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
                );
                const faceLandmarker = await FaceLandmarker.createFromOptions(
                    filesetResolver,
                    {
                        baseOptions: {
                            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                            delegate: "GPU",
                        },
                        outputFaceBlendshapes: true,
                        runningMode: "VIDEO",
                        numFaces: 1,
                    }
                );

                faceLandmarkerRef.current = faceLandmarker;
                setIsFaceLandmarkerReady(true);
            } catch (err) {
                console.error(
                    "[PersonalColor] Error initializing FaceLandmarker:",
                    err
                );
                setError("Failed to initialize face detection.");
            }
        };

        initializeFaceLandmarker();

        return () => {
            if (faceLandmarkerRef.current) {
                faceLandmarkerRef.current.close();
                faceLandmarkerRef.current = null;
            }
            setIsFaceLandmarkerReady(false);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (videoRenderFrameId.current) {
                cancelAnimationFrame(videoRenderFrameId.current);
            }
        };
    }, []);

    function analyzeFacialFeatures(
        landmarks: NormalizedLandmark[]
    ): FacialFeatures {
        const euclidean = (a: any, b: any) =>
            Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const jawLeft = landmarks[234];
        const jawRight = landmarks[454];
        const chin = landmarks[152];
        const forehead = landmarks[10];
        const noseLeft = landmarks[98];
        const noseRight = landmarks[327];
        const browLeft = landmarks[65];
        const browRight = landmarks[295];
        const cheekLeft = landmarks[50];
        const cheekRight = landmarks[280];

        const browCenter = {
            x: (browLeft.x + browRight.x) / 2,
            y: (browLeft.y + browRight.y) / 2,
        };
        const faceWidth = euclidean(jawLeft, jawRight);
        const faceHeight = euclidean(chin, forehead);
        const eyeDistance = euclidean(leftEye, rightEye);
        const noseWidth = euclidean(noseLeft, noseRight);
        const lipWidth = euclidean(landmarks[61], landmarks[291]);
        const browLength = euclidean(browLeft, browRight);
        const cheekboneProminence = euclidean(cheekLeft, cheekRight);
        const foreheadHeight = euclidean(forehead, browCenter); // chiều cao trán
        const cheekboneHeight =
            euclidean(cheekLeft, leftEye) / euclidean(chin, cheekLeft);

        let faceShape: FacialFeatures["faceShape"] = "oval";
        const ratio = faceHeight / faceWidth;
        if (ratio > 1.5) faceShape = "long";
        else if (ratio > 1.3) faceShape = "oval";
        else if (ratio < 1.1) faceShape = "square";
        else if (cheekboneProminence > faceWidth * 0.9) faceShape = "heart";
        else faceShape = "round";

        return {
            eyeDistance,
            faceWidth,
            faceHeight,
            noseWidth,
            lipWidth,
            browLength,
            cheekboneProminence,
            faceShape,
            cheekboneHeight,
            foreheadHeight,
        };
    }

    function generateMakeupSuggestion(features: FacialFeatures): string {
        const suggestions: string[] = [];

        // Nhận xét hình dáng khuôn mặt
        switch (features.faceShape) {
            case "round":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn tròn với đường nét mềm mại</strong> <br/><em style="font-size: 17px;">💄 Nên tạo khối nhẹ ở hai bên má và xương hàm để tạo cảm giác thon gọn</em>`
                );
                break;
            case "oval":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn hình oval, tỉ lệ rất cân đối</strong> <br/>💄<em style="font-size: 17px;"> Chỉ cần nhấn nhẹ vào các đường nét để tôn lên vẻ đẹp tự nhiên </em>`
                );
                break;
            case "square":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt của bạn vuông với đường hàm rõ nét</strong> <br/>💄<em style="font-size: 17px;"> Hãy dùng highlight ở trán và cằm để làm mềm đường nét khuôn mặt</em>`
                );
                break;
            case "heart":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt bạn hình trái tim, trán rộng, cằm nhỏ</strong> <br/>💄<em style="font-size: 17px;"> Nên tập trung highlight vùng trán và tạo khối nhẹ cho phần cằm</em>`
                );
                break;
            case "long":
                suggestions.push(
                    `<strong style="font-size: 0.88em;">📐 Khuôn mặt bạn khá dài, thanh thoát</strong> <br/>💄<em style="font-size: 17px;"> Dùng má hồng tán ngang để giúp khuôn mặt trông cân đối hơn</em>`
                );
                break;
        }

        // Khoảng cách mắt
        if (features.eyeDistance > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn khá to và cách xa nhau</strong> <br/>💄<em style="font-size: 17px;"> Nên kẻ eyeliner đậm và chuốt mascara kỹ phần khóe mắt trong để thu hẹp khoảng cách</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️ Đôi mắt bạn nhỏ hoặc gần nhau</strong> <br/>💄<em style="font-size: 17px;">Ưu tiên eyeliner mảnh và phấn mắt sáng để mở rộng đôi mắt</em>`
            );
        }

        // Môi
        if (features.lipWidth > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Bạn có đôi môi đầy đặn </strong><br/> 💄<em style="font-size: 17px;"> Hãy dùng son lì hoặc màu trầm để tạo cảm giác hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👄 Môi bạn khá nhỏ gọn </strong><br/> 💄<em style="font-size: 17px;"> Sử dụng son bóng hoặc tông màu tươi sáng để giúp môi trông căng mọng hơn.</em>`
            );
        }

        // Mũi
        if (features.noseWidth > 0.07) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi của bạn hơi rộng </strong><br/> 💄<em style="font-size: 17px;"> Tạo khối nhẹ hai bên sống mũi để tạo hiệu ứng thon gọn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👃 Mũi bạn thon gọn </strong><br/> 💄<em style="font-size: 17px;"> Hãy tô chút highlight dọc sống mũi để tăng chiều sâu và nổi bật.</em>`
            );
        }

        // Lông mày
        if (features.browLength < features.eyeDistance * 1.5) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn ngắn và nhẹ </strong><br/> 💄<em style="font-size: 17px;"> Nên kẻ dài thêm một chút và tạo độ cong nhẹ để gương mặt hài hòa hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">👁️‍🗨️ Lông mày bạn khá dài và rõ nét </strong><br/> 💄<em style="font-size: 17px;"> Chỉ cần giữ dáng tự nhiên, không nên tô quá sắc để tránh làm khuôn mặt cứng.</em>`
            );
        }

        // Gò má
        if (features.cheekboneHeight < 0.4) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Hãy đánh má hồng thấp hơn xương gò má và tán ngang để làm dịu đường nét.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">😊 Gò má bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Nên tán má hồng cao và kéo dài lên thái dương để tạo hiệu ứng nâng mặt.</em>`
            );
        }

        // Đường chân tóc
        if (features.foreheadHeight > 0.15) {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn cao </strong><br/> 💄<em style="font-size: 17px;"> Dùng phấn tối màu sát chân tóc để tạo cảm giác trán thấp hơn và mềm mại hơn.</em>`
            );
        } else {
            suggestions.push(
                `<strong style="font-size: 0.88em;">🔍 Trán bạn thấp </strong><br/> 💄<em style="font-size: 17px;"> Có thể chải tóc ra sau hoặc highlight vùng trán để khuôn mặt cân đối hơn.</em>`
            );
        }

        return suggestions.join("<br/>");
    }

    // Kết nối video stream
    useEffect(() => {
        if (stream && displayVideoRef.current) {
            displayVideoRef.current.srcObject = stream;
            displayVideoRef.current.play().catch((err) => {
                console.error("[PersonalColor] Error playing video:", err);
            });

            const checkVideoReady = () => {
                if (
                    displayVideoRef.current &&
                    displayVideoRef.current.readyState >= 4
                ) {
                    setIsVideoReady(true);
                    setIsLoading(false); // Tắt loading qua context
                } else {
                    setTimeout(checkVideoReady, 500);
                }
            };

            checkVideoReady();
        }
    }, [stream, setIsLoading]);

    // Hàm vẽ makeup - được gọi từ loop chính
    function drawMakeup(
        ctx: CanvasRenderingContext2D,
        landmarks: NormalizedLandmark[],
        width: number,
        height: number
    ) {
        // Điều chỉnh scale để đảm bảo vị trí chính xác
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;
        const videoAspect = width / height;
        const canvasAspect = canvasWidth / canvasHeight;
        
        let scaleX, scaleY, offsetX, offsetY;
        
        if (videoAspect > canvasAspect) {
            scaleX = canvasWidth / width;
            scaleY = (canvasWidth / videoAspect) / height;
            offsetX = 0;
            offsetY = (canvasHeight - (canvasWidth / videoAspect)) / 2;
        } else {
            scaleY = canvasHeight / height;
            scaleX = (canvasHeight * videoAspect) / width;
            offsetY = 0;
            offsetX = (canvasWidth - (canvasHeight * videoAspect)) / 2;
        }
        
        // Hàm helper để chuyển đổi tọa độ
        const transformX = (x: number) => x * width * scaleX + offsetX;
        const transformY = (y: number) => y * height * scaleY + offsetY;

        const outerLip = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
        const innerLip = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];

        ctx.save();
        // Tối ưu: Giảm độ blur từ 5px xuống 4px
        ctx.filter = "blur(4px)";

        // --- Màu nền môi ---
        ctx.beginPath();
        ctx.fillStyle = "rgba(223, 41, 41, 0.4)"; 
        outerLip.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();

        // --- Gradient hiệu ứng bóng (trong lòng môi) ---
        const gradient = ctx.createRadialGradient(
            transformX(landmarks[13].x),
            transformY(landmarks[13].y),
            1,
            transformX(landmarks[13].x),
            transformY(landmarks[13].y),
            canvasWidth * 0.05
        );
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
        gradient.addColorStop(1, "rgba(230, 71, 145, 0)");

        ctx.beginPath();
        ctx.fillStyle = gradient;
        outerLip.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();

        // --- Khoét phần môi trong để tạo độ dày ---
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        innerLip.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        ctx.restore();

        // Điểm gần trung tâm gò má
        const leftCheekPoint = landmarks[50];
        const rightCheekPoint = landmarks[280];

        // Tọa độ thực
        const leftX = transformX(leftCheekPoint.x);
        const leftY = transformY(leftCheekPoint.y);
        const rightX = transformX(rightCheekPoint.x);
        const rightY = transformY(rightCheekPoint.y);

        ctx.save();
        // Tối ưu: Giảm độ blur từ 7px xuống 5px
        ctx.filter = "blur(5px)";
        ctx.fillStyle = "rgba(211, 34, 11, 0.3)"; // Hồng nhạt

        const radius = Math.min(canvasWidth, canvasHeight) * 0.018; // Độ lớn má hồng

        // Má trái
        ctx.beginPath();
        ctx.arc(leftX, leftY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Má phải
        ctx.beginPath();
        ctx.arc(rightX, rightY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        //============ Vẽ lông mày
        const leftEyebrow = [70, 63, 105, 66, 107];
        const rightEyebrow = [336, 296, 334, 293, 300];

        ctx.save();
        // Tối ưu: Giảm độ blur từ 3px xuống 2px
        ctx.filter = "blur(2px)";
        ctx.fillStyle = "rgba(54, 24, 15, 0.64)"; // màu nâu đậm tự nhiên
        // Lông mày trái
        ctx.beginPath();
        leftEyebrow.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        // Lông mày phải
        ctx.beginPath();
        rightEyebrow.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // =============Sống mũi và vùng highlight
        const noseBridge = [6, 197, 195, 5, 4]; // giữa mũi đến đầu mũi
        const noseContourLeft = [98, 327, 326]; // viền trái sống mũi
        const noseContourRight = [327, 326, 98].map((i) => 454 - i); // phản chiếu viền phải (thủ công nếu cần)
        // Highlight sống mũi
        ctx.save();
        // Tối ưu: Giảm độ blur từ 5px xuống 3px
        ctx.filter = "blur(3px)";
        ctx.beginPath();
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)"; // highlight trắng nhẹ
        noseBridge.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
        // Shadow 2 bên cánh mũi (contour)
        const drawSideShadow = (points: number[]) => {
            ctx.save();
            // Tối ưu: Giảm độ blur từ 4px xuống 3px
            ctx.filter = "blur(3px)";
            ctx.beginPath();
            ctx.fillStyle = "rgba(80, 40, 40, 0.15)"; // shadow nâu nhẹ
            points.forEach((index, i) => {
                const pt = landmarks[index];
                const x = transformX(pt.x);
                const y = transformY(pt.y);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        drawSideShadow(noseContourLeft);
        drawSideShadow(noseContourRight);

        // ==============Vẽ eyeliner
        const leftEyeliner = [33, 7, 163, 144, 145, 153, 154, 155]; // mí dưới trái
        const rightEyeliner = [263, 249, 390, 373, 374, 380, 381, 382]; // mí dưới phải

        const drawEyeliner = (indices: number[], color: string) => {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            indices.forEach((index, i) => {
                const pt = landmarks[index];
                const x = transformX(pt.x);
                const y = transformY(pt.y);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });

            ctx.stroke();
            ctx.restore();
        };

        // Eyeliner – đen mảnh
        drawEyeliner(leftEyeliner, "rgba(30, 30, 30, 0.9)");
        drawEyeliner(rightEyeliner, "rgba(30, 30, 30, 0.9)");

        // Da trắng sáng
        const faceOutline = [
            10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
            379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
            234, 127, 162, 21, 54,
        ];

        ctx.save();
        ctx.beginPath();
        faceOutline.forEach((index, i) => {
            const pt = landmarks[index];
            const x = transformX(pt.x);
            const y = transformY(pt.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();

        // Tô màu trắng nhẹ + blur
        // Tối ưu: Giảm độ blur từ 6px xuống 4px
        ctx.filter = "blur(4px)";
        ctx.fillStyle = "rgba(197, 175, 163, 0.15)";
        ctx.fill();
        ctx.restore();
    }

    // Sửa lỗi: Thêm useEffect tách biệt cho render video
    useEffect(() => {
        if (!stream || !canvasRef.current || !displayVideoRef.current) {
            return;
        }
        
        const video = displayVideoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) return;
        
        // Hàm vẽ video liên tục
        const renderVideo = () => {
            if (video.readyState >= 2) {
                const videoAspect = video.videoWidth / video.videoHeight;
                const canvasAspect = canvas.width / canvas.height;
                
                let drawWidth, drawHeight, offsetX, offsetY;
                
                if (videoAspect > canvasAspect) {
                    drawWidth = canvas.width;
                    drawHeight = canvas.width / videoAspect;
                    offsetX = 0;
                    offsetY = (canvas.height - drawHeight) / 2;
                } else {
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * videoAspect;
                    offsetY = 0;
                    offsetX = (canvas.width - drawWidth) / 2;
                }
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
                
                // Vẽ makeup nếu có landmarks
                if (lastLandmarks.current) {
                    drawMakeup(
                        ctx,
                        lastLandmarks.current,
                        video.videoWidth,
                        video.videoHeight
                    );
                }
            }
            
            videoRenderFrameId.current = requestAnimationFrame(renderVideo);
        };
        
        // Bắt đầu vòng lặp render video
        videoRenderFrameId.current = requestAnimationFrame(renderVideo);
        
        return () => {
            if (videoRenderFrameId.current) {
                cancelAnimationFrame(videoRenderFrameId.current);
            }
        };
    }, [stream]);

    // Sửa lỗi: Tách việc phát hiện khuôn mặt thành useEffect riêng
    useEffect(() => {
        if (
            !isFaceLandmarkerReady ||
            !stream ||
            !displayVideoRef.current ||
            !isFaceDetectionActive
        ) {
            return;
        }
        
        const video = displayVideoRef.current;

        const detect = async () => {
            if (!faceLandmarkerRef.current) {
                animationFrameId.current = requestAnimationFrame(detect);
                return;
            }

            try {
                const now = performance.now();
                if (now - lastDetectTime.current < 150) {
                    animationFrameId.current = requestAnimationFrame(detect);
                    return;
                }

                lastDetectTime.current = now;
                
                const results = faceLandmarkerRef.current.detectForVideo(video, now);
                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                    const landmarks = results.faceLandmarks[0];
                    
                    // Lưu landmarks để sử dụng trong loop render video
                    lastLandmarks.current = landmarks;
                    
                    // Chỉ phân tích đặc điểm khuôn mặt mỗi 2 giây
                    if (now - lastAnalysisTime.current > 2000 || !lastFeatures.current) {
                        lastAnalysisTime.current = now;
                        const features = analyzeFacialFeatures(landmarks);
                        lastFeatures.current = features;
                        const suggestion = generateMakeupSuggestion(features);
                        setMakeupSuggestion(`${suggestion}`);
                    }

                    setStatusMessage("ok");
                }
            } catch (err) {
                console.error(
                    "[PersonalMakeup] Error during face mesh detection:",
                    err
                );
            }

            animationFrameId.current = requestAnimationFrame(detect);
        };

        detect();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isFaceLandmarkerReady, stream, isFaceDetectionActive]);

    return (
        <AnalysisLayout
            title="Personal Makeup"
            description="Get makeup suggestions based on your facial features."
            videoRef={displayVideoRef}
            canvasRef={canvasRef}
            result={makeupSuggestion}
            error={error || webcamError}
            statusMessage={statusMessage}
            progress={twoFingersProgress}
        />
    );
}