"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, ChevronLeft, ChevronRight, 
  Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Upload, Type, Palette, X, Paperclip, Eraser, PenTool, Minus, Undo, Redo, CheckSquare, CheckCircle2,
  ImagePlus, Move, Scaling
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";

const Label = ({ children, className }: any) => <label className={className}>{children}</label>;

interface ChecklistPanelProps {
  patient: any;
}

// 오버레이 이미지 타입 정의
interface OverlayImage {
  id: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PRESET_TYPES = ["BOS", "Attachment", "Vertical Ridge", "Power Ridge", "Bite Ramp", "IPR", "BC", "TAG", "기타"];

const getTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("bos")) return "text-blue-600";
  if (t.includes("attachment")) return "text-green-600";
  if (t.includes("ipr")) return "text-purple-600";
  if (t.includes("bc")) return "text-red-600";
  if (t.includes("ridge")) return "text-orange-600";
  if (t.includes("bite")) return "text-emerald-600";
  if (t.includes("tag")) return "text-pink-600";
  return "text-slate-700";
};

export function ChecklistPanel({ patient }: ChecklistPanelProps) {
  const store = usePatientStoreHydrated();
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [pageStartStep, setPageStartStep] = useState(0);

  // --- 입력 상태 ---
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");

  // --- Summary & Canvas 상태 ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null); // 추가 이미지용 인풋
  const [memoText, setMemoText] = useState("");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [fontColor, setFontColor] = useState("#334155");
  
  // 캔버스 상태
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // ✨ 오버레이 이미지 상태
  const [overlays, setOverlays] = useState<OverlayImage[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<number | null>(null);
  const [isResizingOverlay, setIsResizingOverlay] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [currentTool, setCurrentTool] = useState<"draw" | "line" | "eraser" | "text">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);

  // Undo/Redo 상태
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // 1. 초기화 및 데이터 로드
  useEffect(() => {
    setPageStartStep(0);
    setMemoText("");
    setUploadedImage(null);
    setOverlays([]); // 오버레이 초기화
    setHistory([]);
    setHistoryStep(-1);
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (patient.summary) {
      if (patient.summary.memo) setMemoText(patient.summary.memo);
      if (patient.summary.image) {
        setUploadedImage(patient.summary.image);
      }
    }
  }, [patient.id, patient.summary]);

  // 2. 캔버스 사이즈 및 초기 히스토리
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
       canvas.width = container.offsetWidth;
       canvas.height = container.offsetHeight;
       
       const ctx = canvas.getContext("2d");
       if (ctx && history.length === 0) {
           const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
           setHistory([initialData]);
           setHistoryStep(0);
       }
    }
  }, [uploadedImage, isGridOpen]);

  // ✨ 붙여넣기 (Ctrl+V) 핸들러 수정
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result as string;
              
              if (!uploadedImage) {
                // 배경이 없으면 배경으로 설정
                setUploadedImage(result);
                setHistory([]);
                setHistoryStep(-1);
                const canvas = canvasRef.current;
                if (canvas) {
                    const ctx = canvas.getContext("2d");
                    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
              } else {
                // 배경이 있으면 오버레이(스티커)로 추가
                addOverlayImage(result);
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [uploadedImage]);

  // ✨ 오버레이 이미지 추가 함수
  const addOverlayImage = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        // 기본 크기 제한 (너무 크면 줄임)
        let width = img.width;
        let height = img.height;
        const maxSize = 200;
        if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width *= ratio;
            height *= ratio;
        }

        setOverlays(prev => [...prev, {
            id: Date.now(),
            src,
            x: 50, // 기본 위치
            y: 50,
            width,
            height
        }]);
    };
  };

  // ✨ 드래그 앤 드랍 핸들러 (배경 or 오버레이 결정)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (!uploadedImage) {
             // 배경으로 설정
             setUploadedImage(result);
             setHistory([]); setHistoryStep(-1);
             const canvas = canvasRef.current;
             if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
          } else {
             // 오버레이로 추가
             addOverlayImage(result);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // ✨ 오버레이 조작 핸들러 (이동 및 리사이즈)
  const handleOverlayMouseDown = (e: React.MouseEvent, id: number, type: 'move' | 'resize') => {
      e.stopPropagation(); // 캔버스 그리기 방지
      const overlay = overlays.find(o => o.id === id);
      if (!overlay) return;

      setActiveOverlayId(id);
      setIsResizingOverlay(type === 'resize');
      setDragOffset({ x: e.clientX, y: e.clientY });
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
      if (activeOverlayId === null) return;

      const deltaX = e.clientX - dragOffset.x;
      const deltaY = e.clientY - dragOffset.y;

      setOverlays(prev => prev.map(o => {
          if (o.id !== activeOverlayId) return o;
          
          if (isResizingOverlay) {
              // 리사이즈 모드
              return { ...o, width: Math.max(20, o.width + deltaX), height: Math.max(20, o.height + deltaY) };
          } else {
              // 이동 모드
              return { ...o, x: o.x + deltaX, y: o.y + deltaY };
          }
      }));

      setDragOffset({ x: e.clientX, y: e.clientY });
  }, [activeOverlayId, dragOffset, isResizingOverlay]);

  const handleGlobalMouseUp = useCallback(() => {
      setActiveOverlayId(null);
      setIsResizingOverlay(false);
  }, []);

  useEffect(() => {
      if (activeOverlayId !== null) {
          window.addEventListener('mousemove', handleGlobalMouseMove);
          window.addEventListener('mouseup', handleGlobalMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleGlobalMouseMove);
          window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
  }, [activeOverlayId, handleGlobalMouseMove, handleGlobalMouseUp]);

  // 오버레이 삭제
  const removeOverlay = (id: number) => {
      setOverlays(prev => prev.filter(o => o.id !== id));
  };


  // --- 히스토리 및 그리기 로직 ---
  const saveHistory = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
          const newData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const newHistory = history.slice(0, historyStep + 1);
          newHistory.push(newData);
          setHistory(newHistory);
          setHistoryStep(newHistory.length - 1);
      }
  };

  const handleUndo = useCallback(() => {
      if (historyStep > 0) {
          const prevStep = historyStep - 1;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx && history[prevStep]) {
              ctx.putImageData(history[prevStep], 0, 0);
              setHistoryStep(prevStep);
          }
      }
  }, [history, historyStep]);

  const handleRedo = useCallback(() => {
      if (historyStep < history.length - 1) {
          const nextStep = historyStep + 1;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx && history[nextStep]) {
              ctx.putImageData(history[nextStep], 0, 0);
              setHistoryStep(nextStep);
          }
      }
  }, [history, historyStep]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) handleRedo(); else handleUndo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startAction = (e: React.MouseEvent) => {
    if (!uploadedImage) return;
    // 오버레이 조작 중이면 그리기 시작 안함
    if (activeOverlayId !== null) return;

    const { x, y } = getCanvasPoint(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    if (currentTool === 'text') {
      e.preventDefault();
      setTextInput({ x, y, value: "" }); 
      return;
    }

    setIsDrawing(true);
    setStartPos({ x, y });
    
    if (currentTool === 'line') setSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = currentTool === 'eraser' ? 20 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    if (currentTool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = fontColor;
    }
  };

  const moveAction = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;
    const { x, y } = getCanvasPoint(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    if (currentTool === 'line' && snapshot) {
      ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (currentTool === 'draw' || currentTool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const endAction = () => {
    if (isDrawing) {
        setIsDrawing(false);
        setStartPos(null);
        setSnapshot(null);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) ctx.globalCompositeOperation = 'source-over';
        saveHistory();
    }
  };

  const handleTextComplete = () => {
    if (!textInput || !textInput.value) {
      setTextInput(null);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = fontColor;
      ctx.fillText(textInput.value, textInput.x, textInput.y + 12);
      saveHistory();
    }
    setTextInput(null);
  };

  // ✨ [수정됨] 저장 로직: 배경 + 캔버스 그림 + 오버레이 이미지 병합
  const handleSaveSummary = async () => {
    let finalImage = uploadedImage;
    if (containerRef.current && uploadedImage && canvasRef.current) {
        const canvas = canvasRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
            // 1. 배경 이미지 그리기 (비율 유지)
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = uploadedImage;
            await new Promise((resolve) => {
                img.onload = () => {
                    const hRatio = tempCanvas.width / img.width;
                    const vRatio = tempCanvas.height / img.height;
                    const ratio = Math.min(hRatio, vRatio);
                    const centerShift_x = (tempCanvas.width - img.width * ratio) / 2;
                    const centerShift_y = (tempCanvas.height - img.height * ratio) / 2;
                    ctx.drawImage(img, 0, 0, img.width, img.height, centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
                    resolve(null);
                };
            });

            // 2. 캔버스 그림(펜, 텍스트) 합치기
            ctx.drawImage(canvas, 0, 0);

            // 3. ✨ 오버레이 이미지들 합치기 (z-index 순서대로)
            for (const overlay of overlays) {
                const oImg = new Image();
                oImg.src = overlay.src;
                await new Promise((resolve) => {
                    oImg.onload = () => {
                        ctx.drawImage(oImg, overlay.x, overlay.y, overlay.width, overlay.height);
                        resolve(null);
                    }
                });
            }

            finalImage = tempCanvas.toDataURL("image/png");
        }
    }

    await store.saveSummary(patient.id, {
      image: finalImage ?? undefined, 
      memo: memoText
    });

    if (finalImage) {
        setUploadedImage(finalImage); 
        setOverlays([]); // 저장 후 오버레이는 배경에 병합되었으므로 초기화
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
            setHistoryStep(0);
        }
    }
    alert("Summary Saved! (저장 완료)");
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
          setUploadedImage(reader.result as string);
          setOverlays([]);
          setHistory([]); setHistoryStep(-1);
      };
      reader.readAsDataURL(file);
    }
  };

  // 오버레이 전용 업로드 핸들러
  const handleOverlayUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            addOverlayImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
    if (overlayInputRef.current) overlayInputRef.current.value = "";
  }

  const handleRemoveImage = () => {
    setUploadedImage(null);
    setOverlays([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHistory([]); setHistoryStep(-1);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveHistory();
        }
    }
  };

  // --- 기존 Rule 로직 ---
  const toggleTooth = (t: string) => setSelectedTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const handleSaveRules = async () => {
    const finalType = selectedType === "기타" ? customType : selectedType;
    if (!finalType) return alert("Please enter a type name.");
    const teethToSave = selectedTeeth.length === 0 ? [0] : selectedTeeth.map(t => parseInt(t));
    if (editingRuleId) {
      await store.updateRule(patient.id, { id: editingRuleId, type: finalType, tooth: teethToSave[0], startStep, endStep, note });
      setEditingRuleId(null);
    } else {
      for (const tooth of teethToSave) {
        await store.addRule(patient.id, { type: finalType, tooth, startStep, endStep, note });
      }
    }
    setSelectedTeeth([]); setNote(""); if (selectedType === "기타") setCustomType("");
  };
  const handleEditClick = (rule: Rule) => {
    setEditingRuleId(rule.id);
    if (PRESET_TYPES.includes(rule.type)) { setSelectedType(rule.type); setCustomType(""); } 
    else { setSelectedType("기타"); setCustomType(rule.type); }
    setSelectedTeeth(rule.tooth === 0 ? [] : [rule.tooth.toString()]);
    setStartStep(rule.startStep); setEndStep(rule.endStep); setNote(rule.note || "");
  };
  const cancelEdit = () => { setEditingRuleId(null); setSelectedTeeth([]); setNote(""); setStartStep(1); setEndStep(10); };
  const handleDeleteRule = async (ruleId: string) => { if (confirm("Delete this rule?")) { await store.deleteRule(patient.id, ruleId); if (editingRuleId === ruleId) cancelEdit(); }};
  
  const getRulesForStep = (step: number) => patient.rules.filter((r: Rule) => step >= r.startStep && step <= r.endStep).sort((a: Rule, b: Rule) => a.tooth - b.tooth);
  
  const getGroupedRules = (step: number) => {
    const allRules = getRulesForStep(step);
    const isAtt = (r: Rule) => r.type.toLowerCase().includes("attachment");
    const genRules = allRules.filter((r: Rule) => r.tooth === 0 && !isAtt(r));
    const upperRules = allRules.filter((r: Rule) => r.tooth >= 10 && r.tooth < 30 && !isAtt(r));
    const lowerRules = allRules.filter((r: Rule) => r.tooth >= 30 && !isAtt(r));
    const attRules = allRules.filter((r: Rule) => isAtt(r));
    return { genRules, upperRules, lowerRules, attRules };
  };
  
  const getStatus = (rule: Rule, step: number) => { if (step === rule.startStep) return "NEW"; if (step === rule.endStep) return "REMOVE"; return "CHECK"; };
  const isChecked = (ruleId: string, step: number) => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === ruleId && s.checked);
  const areRulesCompleted = (rules: Rule[], step: number) => {
      if (rules.length === 0) return false;
      return rules.every(r => isChecked(r.id, step));
  };

  const renderCard = (rule: Rule, step: number, isTiny = false) => {
    const status = getStatus(rule, step); const checked = isChecked(rule.id, step); const typeColorClass = getTypeColor(rule.type);
    return (
      <div key={rule.id} onClick={() => store.toggleChecklistItem(patient.id, step, rule.id)}
        className={cn("rounded cursor-pointer transition-all flex flex-col relative group select-none border", isTiny ? "p-1.5 mb-1.5 shadow-sm" : "p-3 mb-2", checked ? "bg-slate-100 text-slate-400 grayscale border-slate-200" : "bg-white hover:ring-2 hover:ring-blue-200 border-slate-200", status === "NEW" && !checked && "border-l-4 border-l-green-500 shadow-md", status === "REMOVE" && !checked && "border-l-4 border-l-red-500 shadow-md")}>
        <div className="flex justify-between items-start">
          <span className={cn("font-bold text-slate-800", isTiny ? "text-[11px]" : "text-lg")}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}</span>
          <div className="flex gap-1 items-center">
            {status === "NEW" && <span className="bg-green-100 text-green-700 px-1 rounded-[3px] font-bold text-[9px]">NEW</span>}
            {status === "REMOVE" && <span className="bg-red-100 text-red-700 px-1 rounded-[3px] font-bold text-[9px]">REM</span>}
             <div className={cn("rounded flex items-center justify-center transition-colors", isTiny ? "w-3 h-3 border" : "w-5 h-5 border", checked ? "bg-slate-500 border-slate-500" : "bg-white border-slate-300")}>{checked && <CheckCheck className="text-white w-full h-full p-[1px]" />}</div>
          </div>
        </div>
        <div className={cn("font-bold truncate mt-0.5", typeColorClass, isTiny && "text-[10px]")}>{rule.type}</div>
        {rule.note && <div className={cn("text-slate-400 whitespace-pre-wrap break-words leading-tight", isTiny ? "text-[9px]" : "mt-1")}>{rule.note}</div>}
      </div>
    );
  };

  const renderFullScreenGrid = () => {
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i);
    let maxGenCount = 0; let maxUpperCount = 0; let maxLowerCount = 0;
    stepsToShow.forEach(step => {
        const { genRules, upperRules, lowerRules } = getGroupedRules(step);
        maxGenCount = Math.max(maxGenCount, genRules.length);
        maxUpperCount = Math.max(maxUpperCount, upperRules.length);
        maxLowerCount = Math.max(maxLowerCount, lowerRules.length);
    });
    const getMinHeightStyle = (count: number) => { if (count === 0) return {}; return { minHeight: `${32 + (count * 52) + 10}px` }; };

    return (
      <div className="fixed inset-0 z-[9999] bg-slate-100 flex flex-col animate-in fade-in duration-200">
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm shrink-0">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Layout className="w-6 h-6 text-blue-600"/> Full Checklist Grid</h2>
            <div className="flex gap-4 items-center">
                <div className="flex gap-2">
                    <Button variant="outline" disabled={pageStartStep <= 0} onClick={() => setPageStartStep(Math.max(0, pageStartStep - 10))}><ChevronLeft className="w-4 h-4 mr-1"/> Prev 10</Button>
                    <Button variant="outline" disabled={pageStartStep + 10 > totalSteps} onClick={() => setPageStartStep(Math.min(totalSteps, pageStartStep + 10))}>Next 10 <ChevronRight className="w-4 h-4 ml-1"/></Button>
                </div>
                <Button variant="destructive" onClick={() => setIsGridOpen(false)}><X className="w-5 h-5 mr-1"/> Close</Button>
            </div>
        </div>
        <div className="flex-1 p-6 overflow-auto bg-slate-50">
             <div className="mb-8">
                 <h3 className="text-xl font-bold text-blue-800 mb-3 border-l-4 border-blue-600 pl-3 flex items-center gap-2"><Layout className="w-5 h-5"/> Main Rules</h3>
                 <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                     {stepsToShow.map((step) => {
                        if (step > totalSteps) return null;
                        const { genRules, upperRules, lowerRules, attRules } = getGroupedRules(step);
                        const allRulesInStep = [...genRules, ...upperRules, ...lowerRules, ...attRules];
                        const isStepAllDone = areRulesCompleted(allRulesInStep, step);
                        const isGenDone = areRulesCompleted(genRules, step);
                        const isUpperDone = areRulesCompleted(upperRules, step);
                        const isLowerDone = areRulesCompleted(lowerRules, step);
                        return (
                            <div key={`main-${step}`} className="flex flex-col gap-3">
                                <div className={cn("p-2 font-bold text-xs text-center sticky top-0 z-10 flex justify-between items-center rounded-lg shadow-sm border", step===0 ? "bg-yellow-100 border-yellow-200 text-yellow-800" : (isStepAllDone ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-600 border-slate-200"))}>
                                  <span className="flex-1 text-center pl-4">{step === 0 ? "PRE" : `STEP ${step}`}</span>
                                  {step <= totalSteps && allRulesInStep.length > 0 && <button onClick={() => store.checkAllInStep(patient.id, step)} className={cn("p-1 rounded transition-colors", isStepAllDone ? "text-blue-200 hover:text-white hover:bg-blue-500" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100")} title="Check All"><CheckSquare className="w-3.5 h-3.5"/></button>}
                                </div>
                                <div className="space-y-3 flex-1">
                                    {maxGenCount > 0 && <div className={cn("bg-white rounded-lg p-1 border shadow-sm transition-all flex flex-col overflow-hidden", (genRules.length > 0 && isGenDone) ? "ring-2 ring-green-500 ring-inset border-transparent shadow-md" : "border-slate-200")} style={getMinHeightStyle(maxGenCount)}><div className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1 bg-slate-50 mb-1 rounded-sm border-b border-slate-100 flex items-center justify-between"><span>General</span>{genRules.length > 0 && isGenDone && <CheckCircle2 className="w-3 h-3 text-green-500"/>}</div>{genRules.map((rule: Rule) => renderCard(rule, step, true))}</div>}
                                    {maxUpperCount > 0 && <div className={cn("bg-white rounded-lg p-1 border shadow-sm transition-all flex flex-col overflow-hidden", (upperRules.length > 0 && isUpperDone) ? "ring-2 ring-green-500 ring-inset border-transparent shadow-md" : "border-slate-200")} style={getMinHeightStyle(maxUpperCount)}><div className="text-[9px] font-bold text-blue-600 uppercase px-2 py-1 bg-blue-50/50 mb-1 rounded-sm border-b border-blue-100 flex items-center justify-between"><span>Maxilla</span>{upperRules.length > 0 && isUpperDone && <CheckCircle2 className="w-3 h-3 text-green-500"/>}</div>{upperRules.map((rule: Rule) => renderCard(rule, step, true))}</div>}
                                    {maxLowerCount > 0 && <div className={cn("bg-white rounded-lg p-1 border shadow-sm transition-all flex flex-col overflow-hidden", (lowerRules.length > 0 && isLowerDone) ? "ring-2 ring-green-500 ring-inset border-transparent shadow-md" : "border-slate-200")} style={getMinHeightStyle(maxLowerCount)}><div className="text-[9px] font-bold text-orange-600 uppercase px-2 py-1 bg-orange-50/50 mb-1 rounded-sm border-b border-orange-100 flex items-center justify-between"><span>Mandible</span>{lowerRules.length > 0 && isLowerDone && <CheckCircle2 className="w-3 h-3 text-green-500"/>}</div>{lowerRules.map((rule: Rule) => renderCard(rule, step, true))}</div>}
                                </div>
                            </div>
                        );
                     })}
                 </div>
             </div>
             <div className="mb-10 pt-4 border-t-2 border-dashed border-slate-300">
                 <h3 className="text-xl font-bold text-green-800 mb-3 border-l-4 border-green-600 pl-3 flex items-center gap-2 mt-4"><Paperclip className="w-5 h-5"/> Attachments Only</h3>
                 <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                     {stepsToShow.map((step) => {
                        if (step > totalSteps) return null;
                        const { attRules } = getGroupedRules(step);
                        const isAttDone = areRulesCompleted(attRules, step);
                        return (
                            <div key={`att-${step}`} className="flex flex-col">
                                {attRules.length > 0 ? <div className={cn("rounded-lg flex flex-col shadow-sm transition-all bg-white relative overflow-hidden", isAttDone ? "ring-2 ring-green-500 ring-inset border-transparent shadow-md" : "border border-slate-200")}><div className="p-1.5 border-b text-[10px] font-bold text-slate-400 text-center bg-slate-50/50 flex justify-between items-center px-3"><span>{step === 0 ? "PRE" : `STEP ${step}`}</span>{isAttDone && <CheckCircle2 className="w-3 h-3 text-green-500"/>}</div><div className="p-1 space-y-1 flex-1 overflow-y-auto">{attRules.map((rule: Rule) => renderCard(rule, step, true))}</div></div> : <div className="rounded-lg h-24 border border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center"><span className="text-[10px] text-slate-300">No Att</span></div>}
                            </div>
                        );
                     })}
                 </div>
             </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex h-full">
        <div className="w-[340px] border-r bg-white flex flex-col h-full overflow-hidden shrink-0">
           <div className="p-4 border-b bg-slate-50 shrink-0"><h2 className="font-bold">Rule Definition</h2></div>
           <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1">
                 <Label className="text-xs font-bold text-slate-500">Item Type</Label>
                 <select className="w-full border p-2 rounded" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                    {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
                 {selectedType === "기타" && <input className="w-full border p-2 rounded mt-1 text-sm bg-yellow-50" placeholder="직접 입력하세요..." value={customType} onChange={(e) => setCustomType(e.target.value)} />}
              </div>
              <div className="space-y-1"><Label className="text-xs font-bold text-slate-500">Select Teeth</Label><ToothGrid selectedTeeth={selectedTeeth} onToggle={toggleTooth} /></div>
              <div className="flex gap-2">
                 <div className="flex-1"><Label className="text-xs font-bold text-slate-500">Start</Label><input type="number" className="w-full border p-2 rounded" value={startStep} onChange={(e) => setStartStep(Number(e.target.value))} /></div>
                 <div className="flex-1"><Label className="text-xs font-bold text-slate-500">End</Label><div className="flex gap-1"><input type="number" className="w-full border p-2 rounded" value={endStep} onChange={(e) => setEndStep(Number(e.target.value))} /><Button variant="outline" className="px-2 text-xs" onClick={() => setEndStep(totalSteps)}>End</Button></div></div>
              </div>
              <div className="space-y-1"><Label className="text-xs font-bold text-slate-500">Note</Label><input className="w-full border p-2 rounded" placeholder="e.g. Mesial" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <div className="flex gap-2">
                {editingRuleId && <Button variant="outline" onClick={cancelEdit} className="flex-1">Cancel</Button>}
                <Button onClick={handleSaveRules} className={cn("flex-1 gap-2", editingRuleId ? "bg-orange-500 hover:bg-orange-600" : "")}>{editingRuleId ? <><Save className="w-4 h-4"/> Update</> : <><Plus className="w-4 h-4"/> Add Rule</>}</Button>
              </div>
              <hr className="my-4"/>
              <div className="space-y-2 pb-10">
                 <h3 className="text-xs font-bold text-slate-500 uppercase">Existing Rules ({patient.rules.length})</h3>
                 {patient.rules.map((rule: Rule) => (
                    <div key={rule.id} className={cn("text-xs border p-2 rounded flex justify-between items-center group transition-colors", editingRuleId === rule.id ? "bg-orange-50 border-orange-200" : "bg-slate-50")}>
                       <div><span className={cn("font-bold mr-1", getTypeColor(rule.type))}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`} {rule.type}</span><span className="text-slate-500">({rule.startStep}-{rule.endStep})</span></div>
                       <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEditClick(rule)} className="text-slate-400 hover:text-blue-500 p-1"><Pencil className="w-3 h-3"/></button>
                          <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3 h-3"/></button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* 오른쪽 패널 */}
        <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden">
           <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm shrink-0">
             <div className="flex items-center gap-2"><FileImage className="w-5 h-5 text-blue-600"/><h3 className="text-lg font-bold text-slate-800">Work Summary</h3></div>
             <div className="flex gap-2">
                <Button onClick={handleSaveSummary} className="gap-2 bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4"/> Save Summary</Button>
                <Button onClick={() => setIsGridOpen(true)} className="gap-2 bg-slate-800 hover:bg-slate-700"><Layout className="w-4 h-4"/> Checklist View</Button>
             </div>
           </div>
           
           <div className="flex-1 p-6 flex flex-col bg-slate-100 overflow-auto">
              <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col h-full">
                 <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg border">
                        <Button variant={currentTool === 'draw' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setCurrentTool('draw')} title="Pen"><PenTool className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'line' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setCurrentTool('line')} title="Straight Line"><Minus className="w-4 h-4 -rotate-45"/></Button>
                        <Button variant={currentTool === 'text' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setCurrentTool('text')} title="Insert Text"><Type className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'eraser' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setCurrentTool('eraser')} title="Eraser"><Eraser className="w-4 h-4"/></Button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" title="Color" />
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleUndo} disabled={historyStep <= 0} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRedo} disabled={historyStep >= history.length - 1} title="Redo (Ctrl+Shift+Z)"><Redo className="w-4 h-4"/></Button>
                    </div>
                    <div className="flex gap-2">
                       {/* 오버레이 전용 버튼 */}
                       <input type="file" accept="image/*" className="hidden" ref={overlayInputRef} onChange={handleOverlayUpload} />
                       <Button variant="outline" size="sm" onClick={() => overlayInputRef.current?.click()} className="text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100"><ImagePlus className="w-4 h-4 mr-1"/> Add Image</Button>
                       
                       <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                       <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1"/> BG Upload</Button>
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-slate-500 hover:bg-slate-100"><Eraser className="w-4 h-4 mr-1"/> Clear Draw</Button>}
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-1"/> Remove All</Button>}
                    </div>
                 </div>

                 {/* ✨ 캔버스 영역 + 오버레이 */}
                 <div 
                    className={cn("flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative mb-4 min-h-[400px]", isDragging && "border-blue-500 bg-blue-50")}
                    ref={containerRef}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                 >
                    {uploadedImage ? (
                       <>
                         <img src={uploadedImage} alt="Background" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"/>
                         <canvas ref={canvasRef} className={cn("absolute inset-0 w-full h-full cursor-crosshair touch-none z-10", currentTool === 'text' && "cursor-text", currentTool === 'eraser' && "cursor-cell")}
                            onMouseDown={startAction} onMouseMove={moveAction} onMouseUp={endAction} onMouseLeave={endAction}/>
                         
                         {/* ✨ 오버레이 이미지 렌더링 (z-index 20) */}
                         {overlays.map((overlay) => (
                             <div 
                                key={overlay.id}
                                className={cn("absolute group cursor-move select-none", activeOverlayId === overlay.id ? "z-50 ring-2 ring-blue-500" : "z-20")}
                                style={{ 
                                    left: overlay.x, 
                                    top: overlay.y, 
                                    width: overlay.width, 
                                    height: overlay.height 
                                }}
                                onMouseDown={(e) => handleOverlayMouseDown(e, overlay.id, 'move')}
                             >
                                 <img src={overlay.src} alt="Overlay" className="w-full h-full object-fill pointer-events-none" />
                                 {/* 삭제 버튼 */}
                                 <button onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                                 {/* 리사이즈 핸들 */}
                                 <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100" onMouseDown={(e) => handleOverlayMouseDown(e, overlay.id, 'resize')}>
                                     <div className="w-2 h-2 bg-blue-500 rounded-full absolute bottom-0 right-0 border border-white"/>
                                 </div>
                             </div>
                         ))}

                         {textInput && (
                           <input autoFocus className="absolute z-50 border-2 border-blue-500 bg-white px-2 py-1 text-base shadow-lg outline-none min-w-[150px] rounded"
                             style={{ left: textInput.x, top: textInput.y, color: fontColor, fontFamily: "sans-serif", fontWeight: "bold" }}
                             value={textInput.value} onChange={(e) => setTextInput({ ...textInput, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleTextComplete()} onBlur={handleTextComplete}/>
                         )}
                       </>
                    ) : (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                           <FileImage className="w-12 h-12 mb-2 opacity-50"/>
                           <p className="font-bold">Upload an image</p>
                           <p className="text-sm">Drag & drop or Paste (Ctrl+V)</p>
                       </div>
                    )}
                 </div>

                 <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Memo</Label>
                    <textarea placeholder="Write additional notes here..." value={memoText} onChange={(e) => setMemoText(e.target.value)}
                       className={cn("w-full p-3 border rounded-lg resize-none h-32 focus:outline-blue-500 shadow-sm", fontSize === "sm" && "text-sm", fontSize === "base" && "text-base", fontSize === "lg" && "text-lg")}
                       style={{ color: fontColor, backgroundColor: "#fffbeb", borderColor: "#fde68a" }}/>
                 </div>
              </div>
           </div>
        </div>
      </div>
      {isGridOpen && renderFullScreenGrid()}
    </>
  );
}