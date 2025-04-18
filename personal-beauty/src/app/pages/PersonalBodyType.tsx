"use client";

import { useEffect, useState, useRef } from "react";
import { useWebcam } from "../context/WebcamContext";
import { useHandControl } from "../context/HandControlContext";
import AnalysisLayout from "../components/AnalysisLayout";

const SelectionButton: React.FC<{
  option: string;
  selectedOption: string | null;
  setSelectedOption: (option: string) => void;
  isHandDetectionEnabled: boolean;
}> = ({ option, selectedOption, setSelectedOption, isHandDetectionEnabled }) => {
  const { registerElement, unregisterElement } = useHandControl();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isRegistered = useRef(false);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    if (isHandDetectionEnabled && !isRegistered.current) {
      //console.log("[SelectionButton] Registering button:", button.dataset.option);
      button.classList.add("hoverable");
      registerElement(button);
      isRegistered.current = true;
    } else if (!isHandDetectionEnabled && isRegistered.current) {
      //console.log("[SelectionButton] Unregistering button:", button.dataset.option);
      button.classList.remove("hoverable");
      unregisterElement(button);
      isRegistered.current = false;
    }

    return () => {
      if (isRegistered.current) {
        //console.log("[SelectionButton] Cleanup - Unregistering button:", button.dataset.option);
        button.classList.remove("hoverable");
        unregisterElement(button);
        isRegistered.current = false;
      }
    };
  }, [registerElement, unregisterElement, isHandDetectionEnabled]);

  return (
    <button
      ref={buttonRef}
      className={`area-button text-2xl font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${
        selectedOption === option
          ? "bg-pink-600 text-white scale-105 border-4 border-pink-300"
          : "bg-gray-200 text-gray-800 hover:bg-gray-300 hover:scale-105"
      }`}
      data-option={option}
      onClick={() => setSelectedOption(option)}
    >
      {option.charAt(0).toUpperCase() + option.slice(1)}
    </button>
  );
};

export default function PersonalBodyType() {
  const { setIsHandDetectionEnabled, isTwoFingersRaised, handData } = useWebcam();
  const { setOpenHandAction } = useHandControl();
  const [isPoseDetectionActive, setIsPoseDetectionActive] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Pose Detection Active");
  const [twoFingersProgress, setTwoFingersProgress] = useState(0);
  const twoFingersStartTime = useRef<number | null>(null);
  const lastInteractionTime = useRef<number>(Date.now());

  // Tùy chỉnh hành động khi Open Hand
  useEffect(() => {
    setOpenHandAction(() => {
      setIsPoseDetectionActive(true);
    });

    return () => {
      setOpenHandAction(() => {});
    };
  }, [setOpenHandAction, setIsPoseDetectionActive]);

  // Quản lý chế độ pose detection và hand detection
  useEffect(() => {
    if (isPoseDetectionActive) {
      setIsHandDetectionEnabled(false);
      setStatusMessage("Pose Detection Active. Raise two fingers for 2 seconds to use hand control.");
    } else {
      setIsHandDetectionEnabled(true);
      setStatusMessage("Hand Control Active. Open hand to return to pose detection.");
    }
  }, [isPoseDetectionActive, setIsHandDetectionEnabled]);

  // Phát hiện cử chỉ giơ 2 ngón tay
  useEffect(() => {
    if (isPoseDetectionActive) {
      if (isTwoFingersRaised) {
        if (!twoFingersStartTime.current) {
          twoFingersStartTime.current = Date.now();
        }
        const elapsed = Date.now() - twoFingersStartTime.current;
        setTwoFingersProgress((elapsed / 2000) * 100);
        if (elapsed >= 2000) {
          setIsPoseDetectionActive(false);
          twoFingersStartTime.current = null;
          setTwoFingersProgress(0);
        }
      } else {
        twoFingersStartTime.current = null;
        setTwoFingersProgress(0);
      }
    }
  }, [isTwoFingersRaised, isPoseDetectionActive]);

  // Tự động quay lại pose detection nếu không có tương tác
  useEffect(() => {
    if (!isPoseDetectionActive && handData.isHandDetected) {
      lastInteractionTime.current = Date.now();
    }

    const checkInactivity = () => {
      if (!isPoseDetectionActive && Date.now() - lastInteractionTime.current >= 5000) {
        setIsPoseDetectionActive(true);
      }
    };

    const intervalId = setInterval(checkInactivity, 1000);
    return () => clearInterval(intervalId);
  }, [isPoseDetectionActive, handData.isHandDetected]);

  const options = ["slim", "average", "curvy"];

  const selectionButtons = (
    <div className="flex flex-col gap-6">
      {options.map((option) => (
        <SelectionButton
          key={option}
          option={option}
          selectedOption={selectedOption}
          setSelectedOption={setSelectedOption}
          isHandDetectionEnabled={!isPoseDetectionActive}
        />
      ))}
    </div>
  );

  return (
    <AnalysisLayout
      title="Personal Body Type"
      description="Analyze your body type using live video."
      videoRef={null}
      canvasRef={null}
      result={selectedOption}
      error={null}
      selectionButtons={selectionButtons}
      colorPalette={null}
      actionButtons={null}
      statusMessage={statusMessage}
      progress={twoFingersProgress}
    />
  );
}