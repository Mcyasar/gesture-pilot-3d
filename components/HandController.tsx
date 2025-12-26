import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { useGameStore } from '../store';
import { Camera, RefreshCw, AlertCircle, Hand, MousePointer2, ChevronUp, ChevronDown } from 'lucide-react';

const HandController: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Logic Refs
  const isHammerReadyRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const pauseDebounceRef = useRef<number>(0);
  
  // Smoothing Refs
  const lastSteeringRef = useRef<number>(0);
  
  // Store actions
  const setSteering = useGameStore((state) => state.setSteering);
  const setFiring = useGameStore((state) => state.setFiring);
  const pauseGame = useGameStore((state) => state.pauseGame);
  const setCursor = useGameStore((state) => state.setCursor);
  const setGestureRatio = useGameStore((state) => state.setGestureRatio);
  const setGestureClicking = useGameStore((state) => state.setGestureClicking);
  const setHammerReady = useGameStore((state) => state.setHammerReady);

  useEffect(() => {
    let mounted = true;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        if (!mounted) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        if (!mounted) return;
        handLandmarkerRef.current = handLandmarker;
        startWebcam();
      } catch (err: any) {
        console.error(err);
        setError("Failed to load hand tracking. Please allow camera access.");
        setLoading(false);
      }
    };

    setupMediaPipe();

    return () => {
      mounted = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", predictWebcam);
      }
      setLoading(false);
    } catch (err) {
      setError("Camera permission denied or not available.");
      setLoading(false);
    }
  };

  const predictWebcam = () => {
    if (!handLandmarkerRef.current || !videoRef.current || !canvasRef.current) return;

    const startTimeMs = performance.now();
    const result = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

    const canvasCtx = canvasRef.current.getContext("2d");
    if (canvasCtx) {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Mirror the output for better UX
      canvasCtx.translate(canvasRef.current.width, 0);
      canvasCtx.scale(-1, 1);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        const drawingUtils = new DrawingUtils(canvasCtx);
        drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 2 });
        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1, radius: 2 });

        processGesture(landmarks);
      } else {
        // No hand detected - Reset states
        const state = useGameStore.getState();
        if (state.isFiring) setFiring(false);
        // Graceful reset of steering to 0 via smoothing would be nice, but instant is safer for "lost tracking"
        if (state.steering !== 0) setSteering(0);
        lastSteeringRef.current = 0; 

        if (state.isGestureClicking) setGestureClicking(false);
        setGestureRatio(0);
        
        if (isHammerReadyRef.current) {
          isHammerReadyRef.current = false;
          setHammerReady(false);
        }
        pauseDebounceRef.current = 0;
      }
      canvasCtx.restore();
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const processGesture = (landmarks: any[]) => {
    const currentState = useGameStore.getState();
    const isPlaying = currentState.gameStatus === 'playing';

    // 0: Wrist
    const wrist = landmarks[0];
    
    // Helper: Check if a finger is extended based on Tip vs PIP distance from Wrist
    const isExtended = (tipIdx: number, pipIdx: number) => {
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];

        const dTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const dPipWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
        
        return dTipWrist > dPipWrist * 1.15;
    };

    const isThumbExtended = (() => {
         const tip = landmarks[4];
         const mcp = landmarks[2];
         const dTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
         const dMcpWrist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
         return dTipWrist > dMcpWrist * 1.2;
    })();

    const isIndexExtended = isExtended(8, 6);   // Tip(8), PIP(6)
    const isMiddleExtended = isExtended(12, 10); // Tip(12), PIP(10)
    const isRingExtended = isExtended(16, 14);   // Tip(16), PIP(14)
    const isPinkyExtended = isExtended(20, 18);  // Tip(20), PIP(18)

    // PAUSE GESTURE: All 5 fingers extended (Open Palm / High Five)
    if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
        pauseDebounceRef.current += 1;
        if (pauseDebounceRef.current > 12) {
            if (isPlaying) {
                pauseGame();
                pauseDebounceRef.current = 0; // Reset
            }
            return; 
        }
    } else {
        pauseDebounceRef.current = 0;
    }

    // --- MODE SWITCHING ---

    if (isPlaying) {
        // FLIGHT MODE: Steer & Fire
        
        // 1. Firing Detection (Thumb Status)
        const thumbTip = landmarks[4];
        const indexMcp = landmarks[5];
        const thumbDist = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
        const isThumbClosed = thumbDist < 0.15; 

        if (isThumbClosed !== currentState.isFiring) {
            setFiring(isThumbClosed);
        }

        // 2. Steering Logic (STABILIZED)
        const middleMcp = landmarks[9];
        
        // Calculate raw tilt. Multiplier 2.5 covers full screen range.
        const rawDx = (middleMcp.x - wrist.x) * 2.5; 
        
        // --- STABILIZATION ALGORITHM ---
        
        // A. Deadzone: Ignore small movements around the center (trembling)
        const DEADZONE = 0.08; // 8% drift allowance
        let cleanInput = 0;

        if (Math.abs(rawDx) > DEADZONE) {
            // Remap input to start from 0 after the deadzone to avoid "jump"
            cleanInput = (Math.abs(rawDx) - DEADZONE) * Math.sign(rawDx);
            // Boost sensitivity slightly to recover the range lost by deadzone
            cleanInput *= 1.2;
        }

        // B. Clamp
        cleanInput = Math.max(-1, Math.min(1, cleanInput));

        // C. Exponential Smoothing (Low Pass Filter)
        // New = Old * (1 - Alpha) + Input * Alpha
        // Alpha of 0.15 is very smooth (high latency), 0.5 is jittery (low latency).
        const SMOOTHING_ALPHA = 0.2; 
        lastSteeringRef.current = (lastSteeringRef.current * (1 - SMOOTHING_ALPHA)) + (cleanInput * SMOOTHING_ALPHA);

        // Invert for Mirroring
        const targetSteer = -lastSteeringRef.current;
        
        // Only update store if value changed significantly (save React renders)
        if (Math.abs(currentState.steering - targetSteer) > 0.005) {
            setSteering(targetSteer);
        }

    } else {
        // MENU MODE: Cursor & Click
        const indexTip = landmarks[8];
        const rawX = 1 - indexTip.x; 
        const rawY = indexTip.y;

        const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end;
        const newX = lerp(currentState.cursor.x, rawX * window.innerWidth, 0.2);
        const newY = lerp(currentState.cursor.y, rawY * window.innerHeight, 0.2);

        setCursor(newX, newY);

        // Click Detection
        const thumbTip = landmarks[4];
        const indexMcp = landmarks[5]; 
        const pinkyMcp = landmarks[17];
        
        const palmLength = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y);
        const palmWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);
        const handSize = Math.max(palmLength, palmWidth) || 1;
        
        const thumbDist = Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y);
        const ratio = thumbDist / handSize;

        setGestureRatio(ratio);

        const UP_THRESHOLD = 0.70;
        const DOWN_THRESHOLD = 0.60;

        if (ratio > UP_THRESHOLD) {
            if (!isHammerReadyRef.current) {
                isHammerReadyRef.current = true;
                setHammerReady(true);
            }
        } 
        else if (ratio < DOWN_THRESHOLD) {
            if (isHammerReadyRef.current) {
                if (Date.now() - lastClickTimeRef.current > 500) {
                    setGestureClicking(true);
                    lastClickTimeRef.current = Date.now();
                    isHammerReadyRef.current = false; 
                    setHammerReady(false);
                    setTimeout(() => setGestureClicking(false), 200);
                }
            }
        }
    }
  };

  const gameStatus = useGameStore(s => s.gameStatus);
  const isGestureClicking = useGameStore(s => s.isGestureClicking);
  const isHammerReady = useGameStore(s => s.isHammerReady);

  return (
    <div className="absolute bottom-4 right-4 z-50 w-48 bg-gray-900/80 p-2 rounded-xl border border-gray-700 backdrop-blur-sm shadow-2xl pointer-events-none">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black mb-2 pointer-events-auto">
        {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50">
                <RefreshCw className="animate-spin w-6 h-6" />
            </div>
        )}
        {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 p-2 text-xs text-center">
                <AlertCircle className="w-4 h-4 mb-1" />
                {error}
            </div>
        )}
        <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" 
            autoPlay 
            playsInline 
            muted
        />
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover" 
            width={320} 
            height={240}
        />
      </div>
      <div className="text-xs text-gray-300 text-center font-mono">
        <div className="flex items-center justify-center gap-2 mb-1">
            <Camera size={14} />
            <span>Gesture Control</span>
        </div>
        {gameStatus === 'playing' ? (
             <div className="flex justify-between px-2 text-[10px] opacity-70">
                <span>👍 Steer</span>
                <span>✊ Fire</span>
                <span>✋ Pause</span>
            </div>
        ) : (
            <div className="flex justify-between px-2 text-[10px]">
                <span className="flex items-center gap-1 text-blue-300 font-bold"><MousePointer2 size={10} /> Point</span>
                <span className={`flex items-center gap-1 font-bold ${isGestureClicking ? 'text-green-400' : isHammerReady ? 'text-yellow-400' : 'text-slate-500'}`}>
                    {isGestureClicking ? 'FIRED' : isHammerReady ? 'READY' : 'LIFT THUMB'}
                </span>
            </div>
        )}
       
      </div>
    </div>
  );
};

export default HandController;