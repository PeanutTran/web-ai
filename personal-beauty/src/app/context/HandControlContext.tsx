"use client";

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";
import { useWebcam } from "./WebcamContext";

interface HandControlContextType {
  onHover: (element: Element) => void;
  onClick: (element: Element) => void;
  registerElement: (element: Element) => void;
  unregisterElement: (element: Element) => void;
  isHandDetectionEnabled: boolean;
  toggleHandDetection: (enable: boolean) => void;
}

const HandControlContext = createContext<HandControlContextType | undefined>(undefined);

export const useHandControl = () => {
  const context = useContext(HandControlContext);
  if (!context) {
    throw new Error("useHandControl phải được sử dụng trong HandControlProvider");
  }
  return context;
};

interface HandControlProviderProps {
  children: React.ReactNode;
  handData: { isHandDetected: boolean; cursorPosition: { x: number; y: number }; isFist: boolean; isOpenHand: boolean };
  onOpenHand?: () => void;
  isLoading?: boolean;
}

export const HandControlProvider: React.FC<HandControlProviderProps> = ({ children, handData, onOpenHand, isLoading }) => {
  const { isIndexFingerRaised, isHandDetectionEnabled, setIsHandDetectionEnabled } = useWebcam();
  const fistDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const isClickPending = useRef(false);
  const lastFistState = useRef(false);
  const lastOpenHandState = useRef(false);
  const lastCursorPosition = useRef<{ x: number; y: number } | null>(null);
  const lastProcessedPosition = useRef<{ x: number; y: number } | null>(null);
  const elements = useRef<Set<Element>>(new Set());
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef<number>(0);
  const lastIndexFingerTime = useRef<number>(Date.now());
  const lastHandData = useRef(handData);
  const lastHandDetectedTime = useRef<number>(Date.now());
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHandDetected, setIsHandDetected] = useState(false);

  // Sử dụng useRef để lưu handData, tránh đưa handData vào dependencies của useEffect
  const handDataRef = useRef(handData);
  useEffect(() => {
    handDataRef.current = handData;
  }, [handData]);

  const registerElement = useCallback((element: Element) => {
    elements.current.add(element);
    //console.log("[HandControlProvider] Registered element:", element, "Total elements:", elements.current.size);
  }, []);

  const unregisterElement = useCallback((element: Element) => {
    elements.current.delete(element);
    //console.log("[HandControlProvider] Unregistered element:", element, "Total elements:", elements.current.size);
  }, []);

  const toggleHandDetection = useCallback((enable: boolean) => {
    setIsHandDetectionEnabled((prev: boolean) => {
      if (prev !== enable) {
        return enable;
      }
      return prev;
    });
  }, [setIsHandDetectionEnabled]);

  useEffect(() => {
    if (isIndexFingerRaised) {
      if (!isHandDetectionEnabled) {
        toggleHandDetection(true);
      }
      lastIndexFingerTime.current = Date.now();
    }
  }, [isIndexFingerRaised, isHandDetectionEnabled, toggleHandDetection]);

  const onHover = useCallback(
    (element: Element) => {
      const currentHandData = handDataRef.current;
      if (!isHandDetectionEnabled || !currentHandData.isHandDetected || currentHandData.isFist) return;

      lastCursorPosition.current = currentHandData.cursorPosition;

      const position = lastCursorPosition.current || currentHandData.cursorPosition;

      if (
        lastProcessedPosition.current &&
        lastProcessedPosition.current.x === position.x &&
        lastProcessedPosition.current.y === position.y
      ) {
        return;
      }

      lastProcessedPosition.current = { x: position.x, y: position.y };

      const elementsAtPoint = document.elementsFromPoint(position.x, position.y);
      //console.log("[HandControlProvider] Elements at point:", elementsAtPoint);

      const targetElement = elementsAtPoint.find((el) => elements.current.has(el));

      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });

      if (targetElement) {
        targetElement.classList.add("hover");
        //console.log("[HandControlProvider] Added hover to:", targetElement);
      }
    },
    [isHandDetectionEnabled]
  );

  const onClick = useCallback(
    (element: Element) => {
      const currentHandData = handDataRef.current;
      console.log("[HandControlProvider] onClick called with handData:", {
        isHandDetected: currentHandData.isHandDetected,
        isFist: currentHandData.isFist,
        isHandDetectionEnabled,
        lastFistState: lastFistState.current,
        isClickPending: isClickPending.current,
      });

      if (!isHandDetectionEnabled || !currentHandData.isHandDetected) {
        console.log("[HandControlProvider] onClick skipped: Hand detection disabled or hand not detected");
        return;
      }

      if (currentHandData.isFist && !lastFistState.current && !isClickPending.current) {
        console.log("[HandControlProvider] Fist detected, preparing to click");
        lastFistState.current = true;
        isClickPending.current = true;

        const clickPosition = lastCursorPosition.current || currentHandData.cursorPosition;
        console.log("[HandControlProvider] Click position:", clickPosition);

        fistDebounceTimeout.current = setTimeout(() => {
          const elementsAtPoint = document.elementsFromPoint(clickPosition.x, clickPosition.y);
          //console.log("[HandControlProvider] Elements at click position:", elementsAtPoint);
          const elementAtPoint = elementsAtPoint.find((el) => elements.current.has(el));
          //console.log("[HandControlProvider] Element at click position (registered):", elementAtPoint);
          if (elementAtPoint) {
            const clickEvent = new Event("click", { bubbles: true, cancelable: true });
            elementAtPoint.dispatchEvent(clickEvent);
            console.log("[HandControlProvider] Clicked element:", elementAtPoint);
          } else {
            console.log("[HandControlProvider] No registered element found at click position");
          }
          lastFistState.current = false;
          isClickPending.current = false;
          console.log("[HandControlProvider] Click processing completed, resetting states");
        }, 150);
      }
    },
    [isHandDetectionEnabled]
  );

  useEffect(() => {
    if (handData.isHandDetected && handData.isOpenHand && !lastOpenHandState.current) {
      lastOpenHandState.current = true;
      if (onOpenHand) {
        console.log("[HandControlProvider] Open Hand detected, triggering callback");
        onOpenHand();
      }
    } else if (!handData.isOpenHand) {
      lastOpenHandState.current = false;
    }
  }, [handData, onOpenHand]);

  useEffect(() => {
    setIsHandDetected(handData.isHandDetected);
    if (handData.isHandDetected) {
      setCursorPosition(handData.cursorPosition);
      lastHandDetectedTime.current = Date.now();
    }
  }, [handData]);

  useEffect(() => {
    let lastFistStateForDetect = false;

    const detect = () => {
      const currentHandData = handDataRef.current;
      const now = performance.now();
      if (now - lastDetectTime.current < 33) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (!currentHandData.isHandDetected && now - lastHandDetectedTime.current > 5000) {
        console.log("[HandControlProvider] No hand detected for 5 seconds, pausing detection loop");
        return;
      }

      if (elements.current.size === 0) {
        console.log("[HandControlProvider] No elements registered, skipping detection");
      } else {
        elements.current.forEach((element) => {
          if (!document.body.contains(element)) {
            elements.current.delete(element);
            console.log("[HandControlProvider] Removed invalid element:", element);
          }
        });

        if (isHandDetectionEnabled) {
          const hasHandDataChanged =
            lastHandData.current.isHandDetected !== currentHandData.isHandDetected ||
            lastHandData.current.cursorPosition.x !== currentHandData.cursorPosition.x ||
            lastHandData.current.cursorPosition.y !== currentHandData.cursorPosition.y;

          const isFistChanged = lastHandData.current.isFist !== currentHandData.isFist;

          if (hasHandDataChanged) {
            if (!currentHandData.isFist) {
              elements.current.forEach(onHover);
            }
          }

          if (isFistChanged && currentHandData.isFist && !lastFistStateForDetect) {
            console.log("[HandControlProvider] isFist changed to true, triggering onClick");
            elements.current.forEach(onClick);
          }

          lastFistStateForDetect = currentHandData.isFist;
          lastHandData.current = { ...currentHandData };
        }
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    animationFrameId.current = requestAnimationFrame(detect);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (fistDebounceTimeout.current) {
        console.log("[HandControlProvider] Cleaning up detect useEffect, cancelling click timeout");
        clearTimeout(fistDebounceTimeout.current);
      }
    };
  }, [onHover, onClick, isHandDetectionEnabled]); // Loại bỏ handData khỏi dependencies

  useEffect(() => {
    if (!handData.isHandDetected) {
      elements.current.forEach((item) => {
        item.classList.remove("hover");
      });
      lastFistState.current = false;
      lastOpenHandState.current = false;
      isClickPending.current = false;
      lastProcessedPosition.current = null;
      if (fistDebounceTimeout.current) {
        console.log("[HandControlProvider] Hand not detected, cancelling click timeout");
        clearTimeout(fistDebounceTimeout.current);
        fistDebounceTimeout.current = null;
      }
    }
  }, [handData]);

  return (
    <HandControlContext.Provider
      value={{
        onHover,
        onClick,
        registerElement,
        unregisterElement,
        isHandDetectionEnabled,
        toggleHandDetection,
      }}
    >
      {children}
      {isHandDetected && isHandDetectionEnabled && (
        <div
          className={`absolute cursor w-8 h-8 rounded-full bg-pink-500 border-4 border-white pointer-events-none z-100 transition-all duration-50 ${isLoading ? "opacity-0" : "opacity-100"}`}
          style={{
            left: `${(cursorPosition.x / window.innerWidth) * 100}%`,
            top: `${(cursorPosition.y / window.innerHeight) * 100}%`,
          }}
        />
      )}
    </HandControlContext.Provider>
  );
};