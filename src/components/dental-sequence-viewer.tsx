"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Html, useProgress, OrthographicCamera, ArcballControls } from "@react-three/drei";
import { STLLoader } from "three-stdlib";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Loader2, X, Eye, EyeOff, Download } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ✅ [유지] 선생님의 3Shape 스타일 조작 설정 매니저
function ControlsManager({ controlsRef }: { controlsRef: any }) {
  const { controls } = useThree();
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (ctrl) {
      ctrl.minZoom = 0.1;  
      ctrl.maxZoom = 1000; 
      ctrl.cursorZoom = false; // ✨ 회전 축 고정 유지
      if (typeof ctrl.setMouseAction === 'function') {
        ctrl.setMouseAction('PAN', 0);    // 좌클릭 이동
        ctrl.setMouseAction('PAN', 1);    // 휠클릭 이동
        ctrl.setMouseAction('ROTATE', 2); // 우클릭 회전
      }
      ctrl.enableAnimations = false; 
      ctrl.dampingFactor = 10;
      ctrl.wMax = 0; 
    }
  }, [controls, controlsRef]);
  return null;
}

// ✅ [유지] 정답 회전값 및 렌더링 로직
function Model({ url, isVisible, opacity, color }: { url: string; isVisible: boolean; opacity: number; color: string }) {
  if (!url) return null;
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh 
      geometry={geometry} 
      visible={isVisible} 
      rotation={[Math.PI / 2, 0, 0]} // ✨ 출력 정방향 회전 유지
    >
      <meshStandardMaterial 
        color={color} 
        roughness={0.6} 
        metalness={0.1} 
        transparent={opacity < 1} 
        opacity={opacity} 
        side={2} 
      />
    </mesh>
  );
}

function Loader() {
  const { progress } = useProgress();
  return <Html center><div className="text-white font-bold flex gap-2"><Loader2 className="animate-spin"/> {progress.toFixed(0)}%</div></Html>;
}

// ✅ [유지] 카메라 시점 복귀 로직
function CameraController({ view, trigger, controlsRef }: { view: string, trigger: number, controlsRef: any }) {
  const { camera } = useThree();
  useEffect(() => {
    const distance = 300; 
    if (controlsRef.current) controlsRef.current.reset(); 
    camera.up.set(0, 0, 1);
    switch (view) {
      case "front": camera.position.set(0, -distance, 0); break;
      case "back": camera.position.set(0, distance, 0); break;
      case "right": camera.position.set(-distance, 0, 0); break;
      case "left": camera.position.set(distance, 0, 0); break;
      case "upper": camera.position.set(0, 0, distance); camera.up.set(0, 1, 0); break;
      case "lower": camera.position.set(0, 0, -distance); camera.up.set(0, -1, 0); break;
    }
    camera.lookAt(0, 0, 0);
  }, [view, trigger, camera, controlsRef]);
  return null;
}

// ✨ Firebase 데이터 구조에 맞춘 타입
interface StepFiles {
  step: number;
  upper: string;
  lower: string;
}

interface DentalSequenceViewerProps {
  steps: StepFiles[]; 
  onClose?: () => void;
}

export default function DentalSequenceViewer({ steps, onClose }: DentalSequenceViewerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const maxStep = steps && steps.length > 0 ? steps.length - 1 : 0;

  const [showUpper, setShowUpper] = useState(true);
  const [showLower, setShowLower] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [cameraView, setCameraView] = useState("front");
  const [viewTrigger, setViewTrigger] = useState(0); 
  const controlsRef = useRef<any>(null);

  const changeView = (view: string) => {
    setCameraView(view);
    setViewTrigger(prev => prev + 1); 
  };

  // ✅ [유지] 전체 다운로드 로직
  const handleDownloadAll = async () => {
    if (!steps || steps.length === 0) return;
    setIsDownloading(true);
    const zip = new JSZip();
    const folderName = `Dental_Case_${new Date().toISOString().slice(0, 10)}`;
    try {
      const promises = steps.map(async (step, index) => {
        if (step.upper) {
          const res = await fetch(step.upper);
          zip.file(`Step_${index}/Upper.stl`, await res.blob());
        }
        if (step.lower) {
          const res = await fetch(step.lower);
          zip.file(`Step_${index}/Lower.stl`, await res.blob());
        }
      });
      await Promise.all(promises);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
    } catch (error) {
      alert("다운로드 중 오류가 발생했습니다.");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && maxStep > 0) {
      interval = setInterval(() => {
        setCurrentStep((prev) => (prev >= maxStep ? (setIsPlaying(false), prev) : prev + 1));
      }, 500); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, maxStep]);

  if (!steps || steps.length === 0) return <div className="text-white flex justify-center items-center h-full">No models loaded.</div>;

  return (
    <div className="w-full h-full bg-[#1e1e1e] relative flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        <Canvas shadows className="bg-gradient-to-b from-gray-800 to-gray-900">
          <OrthographicCamera makeDefault zoom={10} near={0.1} far={2000} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[0, -200, 100]} intensity={1.0} /> 
          <directionalLight position={[0, 200, 100]} intensity={0.8} /> 
          <directionalLight position={[0, 0, 200]} intensity={1.0} /> 
          <directionalLight position={[0, 0, -200]} intensity={0.8} /> 

          <Suspense fallback={<Loader />}>
             {steps.map((step, index) => (
                <group key={index} visible={index === currentStep}>
                  {/* Firebase URL을 직접 전달 */}
                  <Model url={step.upper} isVisible={showUpper} opacity={opacity} color="#707070" />
                  <Model url={step.lower} isVisible={showLower} opacity={opacity} color="#707070" />
                </group>
              ))}
          </Suspense>

          <CameraController view={cameraView} trigger={viewTrigger} controlsRef={controlsRef} />
          <ControlsManager controlsRef={controlsRef} />
          <ArcballControls ref={controlsRef} makeDefault />
        </Canvas>

        {/* UI 버튼들 (기존과 동일) */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
            <Button variant="secondary" onClick={handleDownloadAll} disabled={isDownloading} className="bg-green-600 hover:bg-green-700 text-white shadow-xl">
                {isDownloading ? <Loader2 className="animate-spin mr-2 w-4 h-4"/> : <Download className="mr-2 w-4 h-4"/>} 
                Save to PC
            </Button>
            {onClose && (
                <Button variant="secondary" onClick={onClose} className="rounded-full w-10 h-10 p-0 hover:bg-red-500 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                </Button>
            )}
        </div>

        {/* 좌측 패널 (기존과 동일) */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-50">
            <div className="bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10 text-white w-48 shadow-xl">
                <div className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Visibility</div>
                <div className="flex gap-2 mb-2">
                    <Button size="sm" variant={showUpper ? "default" : "secondary"} className="flex-1 text-xs" onClick={() => setShowUpper(!showUpper)}>
                        Maxilla {showUpper ? <Eye className="w-3 h-3 ml-1"/> : <EyeOff className="w-3 h-3 ml-1"/>}
                    </Button>
                    <Button size="sm" variant={showLower ? "default" : "secondary"} className="flex-1 text-xs" onClick={() => setShowLower(!showLower)}>
                        Mandible {showLower ? <Eye className="w-3 h-3 ml-1"/> : <EyeOff className="w-3 h-3 ml-1"/>}
                    </Button>
                </div>
                <div className="text-xs font-bold text-gray-400 mb-1 mt-3 uppercase tracking-wider">Opacity</div>
                <input type="range" min="0.1" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full accent-blue-500" />
            </div>

            <div className="bg-black/60 backdrop-blur-md p-2 rounded-lg border border-white/10 text-white grid grid-cols-3 gap-1 shadow-xl">
                 <div className="col-span-3 text-[10px] text-center text-gray-400 font-bold mb-1">CAMERA VIEW</div>
                 {["upper", "front", "lower", "right", "back", "left"].map((v) => (
                   <Button key={v} size="sm" variant="ghost" className="h-8 text-xs bg-gray-800/50 hover:bg-blue-600 capitalize" onClick={() => changeView(v)}>{v}</Button>
                 ))}
            </div>
        </div>
      </div>

      {/* 하단 재생바 (기존과 동일) */}
      <div className="h-20 bg-slate-800 border-t border-slate-700 flex items-center px-6 gap-4 shrink-0 z-50">
         <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="text-white hover:bg-slate-700" onClick={() => setCurrentStep(0)}><SkipBack className="w-5 h-5"/></Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-slate-700" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause className="w-6 h-6"/> : <Play className="w-6 h-6"/>}</Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-slate-700" onClick={() => setCurrentStep(maxStep)}><SkipForward className="w-5 h-5"/></Button>
         </div>
         <div className="flex-1 flex flex-col gap-1">
             <input type="range" min="0" max={maxStep} step="1" value={currentStep} onChange={(e) => { setIsPlaying(false); setCurrentStep(Number(e.target.value)); }} className="w-full h-2 bg-slate-600 rounded-lg accent-blue-500" />
             <div className="flex justify-between w-full px-1">
                {Array.from({ length: maxStep + 1 }).map((_, i) => (
                    <span key={i} className={`text-[10px] select-none cursor-pointer ${i === currentStep ? 'text-blue-400 font-bold' : 'text-slate-500'}`} onClick={() => { setIsPlaying(false); setCurrentStep(i); }}>{i}</span>
                ))}
             </div>
         </div>
         <div className="flex flex-col items-center w-12 border-l border-slate-700 pl-4">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Step</span>
            <span className="text-xl font-mono font-bold text-blue-400">{currentStep}</span>
         </div>
      </div>
    </div>
  );
}