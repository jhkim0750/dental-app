"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, ChevronLeft, ChevronRight, 
  Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Upload, Type, Palette, X, Paperclip, Eraser, PenTool, Minus, Undo, Redo, CheckSquare, CheckCircle2,
  Image as ImageIcon, Move
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

// 오버레이 텍스트 타입 정의
interface OverlayText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
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
  const overlayInputRef = useRef<HTMLInputElement>(null);
  
  // 캔버스 & 오버레이 상태
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [overlays, setOverlays] = useState<OverlayImage[]>([]);
  const [textOverlays, setTextOverlays] = useState<OverlayText[]>([]);
  
  // 조작 관련 상태
  const [activeOverlayId, setActiveOverlayId] = useState<number | null>(null);
  const [activeTextId, setActiveTextId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizingOverlay, setIsResizingOverlay] = useState(false);

  const [currentTool, setCurrentTool] = useState<"draw" | "line" | "eraser" | "text" | "image">("draw");
  const [fontColor, setFontColor] = useState("#334155");
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);

  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // 1. 초기화
  useEffect(() => {
    setPageStartStep(0);
    setUploadedImage(null);
    setOverlays([]);
    setTextOverlays([]);
    setHistory([]);
    setHistoryStep(-1);
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (patient.summary) {
      if (patient.summary.image) {
        setUploadedImage(patient.summary.image);
      }
    }
  }, [patient.id, patient.summary]);

  // 2. 캔버스 사이즈
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

  // --- 히스토리 관리 ---
  const saveHistory = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
          const newData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const newHistory = history.slice(0, historyStep + 1);
          newHistory.push(newData);
          setHistory(newHistory);
          setHistoryStep(newHistory.length - 1);
      }
  }, [history, historyStep]);

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

  // --- 캔버스 클리어 및 이미지 제거 ---
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

  const handleRemoveImage = () => {
    setUploadedImage(null);
    setOverlays([]);
    setTextOverlays([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHistory([]); setHistoryStep(-1);
    }
  };

  // --- 오버레이 (이미지 & 텍스트) 조작 로직 ---
  const addOverlayImage = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxSize = 200;
        if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width *= ratio;
            height *= ratio;
        }
        setOverlays(prev => [...prev, { id: Date.now(), src, x: 50, y: 50, width, height }]);
        setCurrentTool("draw"); 
    };
  };

  const handleTextComplete = () => {
    if (!textInput || !textInput.value) {
      setTextInput(null);
      return;
    }
    setTextOverlays(prev => [...prev, {
        id: Date.now(),
        text: textInput.value,
        x: textInput.x,
        y: textInput.y,
        color: fontColor,
        fontSize: 16
    }]);
    setTextInput(null);
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
      const deltaX = e.clientX - dragOffset.x;
      const deltaY = e.clientY - dragOffset.y;

      if (activeOverlayId !== null) {
          setOverlays(prev => prev.map(o => {
              if (o.id !== activeOverlayId) return o;
              if (isResizingOverlay) {
                  return { ...o, width: Math.max(20, o.width + deltaX), height: Math.max(20, o.height + deltaY) };
              }
              return { ...o, x: o.x + deltaX, y: o.y + deltaY };
          }));
      } else if (activeTextId !== null) {
          setTextOverlays(prev => prev.map(t => {
              if (t.id !== activeTextId) return t;
              return { ...t, x: t.x + deltaX, y: t.y + deltaY };
          }));
      }
      setDragOffset({ x: e.clientX, y: e.clientY });
  }, [activeOverlayId, activeTextId, dragOffset, isResizingOverlay]);

  const handleGlobalMouseUp = useCallback(() => {
      setActiveOverlayId(null);
      setActiveTextId(null);
      setIsResizingOverlay(false);
  }, []);

  // --- Effects (이벤트 리스너) ---
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

  useEffect(() => {
      if (activeOverlayId !== null || activeTextId !== null) {
          window.addEventListener('mousemove', handleGlobalMouseMove);
          window.addEventListener('mouseup', handleGlobalMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleGlobalMouseMove);
          window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
  }, [activeOverlayId, activeTextId, handleGlobalMouseMove, handleGlobalMouseUp]);

  // --- 그리기 핸들러 ---
  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startAction = (e: React.MouseEvent) => {
    if (activeOverlayId !== null || activeTextId !== null) return;
    if (!uploadedImage) return; 

    const { x, y } = getCanvasPoint(e);
    
    if (currentTool === 'text') {
        e.preventDefault();
        setTextInput({ x, y, value: "" }); 
        return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

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

  // --- 저장 로직 ---
  const handleSaveSummary = async () => {
    let finalImage = uploadedImage;
    if (containerRef.current && uploadedImage && canvasRef.current) {
        const canvas = canvasRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
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

            ctx.drawImage(canvas, 0, 0);

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

            for (const textObj of textOverlays) {
                ctx.font = `bold ${textObj.fontSize}px sans-serif`;
                ctx.fillStyle = textObj.color;
                ctx.fillText(textObj.text, textObj.x, textObj.y + 12);
            }

            finalImage = tempCanvas.toDataURL("image/png");
        }
    }

    await store.saveSummary(patient.id, {
      image: finalImage ?? undefined, 
      memo: ""
    });

    if (finalImage) {
        setUploadedImage(finalImage); 
        setOverlays([]);
        setTextOverlays([]);
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            setHistory([ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)]);
            setHistoryStep(0);
        }
    }
    alert("Summary Saved!");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isOverlay: boolean) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              if (isOverlay) {
                  addOverlayImage(reader.result as string);
              } else {
                  setUploadedImage(reader.result as string);
                  setOverlays([]); setTextOverlays([]);
                  setHistory([]); setHistoryStep(-1);
              }
          };
          reader.readAsDataURL(file);
      }
      e.target.value = "";
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const res = ev.target?.result as string;
                        uploadedImage ? addOverlayImage(res) : setUploadedImage(res);
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploadedImage]);

  // --- 룰 로직 ---
  const toggleTooth = (t: string) => setSelectedTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const handleSaveRules = async () => { 
    const finalType = selectedType === "기타" ? customType : selectedType;
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
    if (PRESET_TYPES.includes(rule.type)) { setSelectedType(rule.type); setCustomType(""); } else { setSelectedType("기타"); setCustomType(rule.type); }
    setSelectedTeeth(rule.tooth === 0 ? [] : [rule.tooth.toString()]);
    setStartStep(rule.startStep); setEndStep(rule.endStep); setNote(rule.note || "");
  };
  const cancelEdit = () => { setEditingRuleId(null); setSelectedTeeth([]); setNote(""); setStartStep(1); setEndStep(10); };
  const handleDeleteRule = async (ruleId: string) => { if (confirm("Delete?")) { await store.deleteRule(patient.id, ruleId); if (editingRuleId === ruleId) cancelEdit(); }};
  
  // ✨ [타입 명시] patient.rules가 any일 수 있으므로 r에 명시적 타입 지정
  const getRulesForStep = (step: number) => (patient.rules || []).filter((r: Rule) => step >= r.startStep && step <= r.endStep).sort((a: Rule, b: Rule) => a.tooth - b.tooth);
  
  const getGroupedRules = (step: number) => {
    const allRules = getRulesForStep(step);
    // ✨ [타입 명시] 여기도 r: Rule 추가
    const isAtt = (r: Rule) => r.type.toLowerCase().includes("attachment");
    return { 
        genRules: allRules.filter((r: Rule) => r.tooth === 0 && !isAtt(r)),
        upperRules: allRules.filter((r: Rule) => r.tooth >= 10 && r.tooth < 30 && !isAtt(r)),
        lowerRules: allRules.filter((r: Rule) => r.tooth >= 30 && !isAtt(r)),
        attRules: allRules.filter((r: Rule) => isAtt(r))
    };
  };
  
  const isChecked = (ruleId: string, step: number) => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === ruleId && s.checked);
  const areRulesCompleted = (rules: Rule[], step: number) => rules.length > 0 && rules.every((r: Rule) => isChecked(r.id, step));

  const renderCard = (rule: Rule, step: number, isTiny = false) => {
    const checked = isChecked(rule.id, step);
    const status = (step === rule.startStep) ? "NEW" : (step === rule.endStep ? "REMOVE" : "CHECK");
    return (
      <div key={rule.id} onClick={() => store.toggleChecklistItem(patient.id, step, rule.id)}
        className={cn("rounded cursor-pointer flex flex-col relative border select-none", isTiny ? "p-1.5 mb-1.5" : "p-3 mb-2", checked ? "bg-slate-100 text-slate-400 grayscale" : "bg-white hover:ring-2 hover:ring-blue-200", status === "NEW" && !checked && "border-l-4 border-l-green-500", status === "REMOVE" && !checked && "border-l-4 border-l-red-500")}>
        <div className="flex justify-between items-start"><span className={cn("font-bold", isTiny ? "text-[11px]" : "text-lg")}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}</span><div className={cn("w-4 h-4 border rounded flex items-center justify-center", checked ? "bg-slate-500" : "bg-white")}>{checked && <CheckCheck className="text-white w-3 h-3"/>}</div></div>
        <div className={cn("font-bold truncate mt-0.5", getTypeColor(rule.type), isTiny && "text-[10px]")}>{rule.type}</div>
        {rule.note && <div className={cn("text-slate-400 whitespace-pre-wrap break-words leading-tight", isTiny ? "text-[9px]" : "mt-1")}>{rule.note}</div>}
      </div>
    );
  };

  const renderFullScreenGrid = () => {
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i);
    
    let maxGenCount = 0;
    let maxUpperCount = 0;
    let maxLowerCount = 0;

    stepsToShow.forEach(step => {
        if (step > totalSteps) return;
        const { genRules, upperRules, lowerRules } = getGroupedRules(step);
        maxGenCount = Math.max(maxGenCount, genRules.length);
        maxUpperCount = Math.max(maxUpperCount, upperRules.length);
        maxLowerCount = Math.max(maxLowerCount, lowerRules.length);
    });

    const getFixedStyle = (count: number) => ({ minHeight: `${34 + (count * 64)}px` });

    return (
      <div className="fixed inset-0 z-[9999] bg-slate-100 flex flex-col animate-in fade-in">
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm shrink-0">
            <h2 className="text-2xl font-bold flex items-center gap-2"><Layout className="text-blue-600"/> Full Checklist Grid</h2>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setPageStartStep(Math.max(0, pageStartStep - 10))}>Prev 10</Button><Button variant="outline" onClick={() => setPageStartStep(Math.min(totalSteps, pageStartStep + 10))}>Next 10</Button><Button variant="destructive" onClick={() => setIsGridOpen(false)}>Close</Button></div>
        </div>
        <div className="flex-1 p-6 overflow-auto bg-slate-50">
             <div className="mb-8">
                 <h3 className="text-xl font-bold text-blue-800 mb-3 pl-3 border-l-4 border-blue-600">Main Rules</h3>
                 <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                     {stepsToShow.map((step) => {
                        if (step > totalSteps) return <div key={step} className="opacity-0 w-full"/>;
                        
                        const { genRules, upperRules, lowerRules } = getGroupedRules(step);
                        const isAllDone = areRulesCompleted([...genRules, ...upperRules, ...lowerRules], step);
                        
                        return (
                            <div key={`main-${step}`} className="flex flex-col gap-2">
                                <div className={cn("p-2 font-bold text-xs text-center rounded-lg border flex justify-between", step===0?"bg-yellow-100":isAllDone?"bg-blue-600 text-white":"bg-white")}>
                                    <span>{step===0?"PRE":`STEP ${step}`}</span>
                                    {step<=totalSteps && <button onClick={()=>store.checkAllInStep(patient.id,step)}><CheckSquare className="w-3.5 h-3.5"/></button>}
                                </div>
                                <div className="space-y-2">
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(genRules, step) && genRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxGenCount)}>
                                        <div className="text-[9px] font-bold text-slate-400 px-1 mb-1">GENERAL</div>
                                        {/* ✨ [핵심 수정] 여기서 (r: Rule) 타입 명시 */}
                                        {genRules.map((r: Rule) => renderCard(r, step, true))}
                                    </div>
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(upperRules, step) && upperRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxUpperCount)}>
                                        <div className="text-[9px] font-bold text-blue-400 px-1 mb-1">MAXILLA</div>
                                        {upperRules.map((r: Rule) => renderCard(r, step, true))}
                                    </div>
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(lowerRules, step) && lowerRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxLowerCount)}>
                                        <div className="text-[9px] font-bold text-orange-400 px-1 mb-1">MANDIBLE</div>
                                        {lowerRules.map((r: Rule) => renderCard(r, step, true))}
                                    </div>
                                </div>
                            </div>
                        );
                     })}
                 </div>
             </div>
             {/* Attachments */}
             <div className="mb-10 pt-4 border-t-2 border-dashed">
                 <h3 className="text-xl font-bold text-green-800 mb-3 pl-3 border-l-4 border-green-600">Attachments Only</h3>
                 <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                     {stepsToShow.map(step => {
                         if(step>totalSteps) return null;
                         const { attRules } = getGroupedRules(step);
                         return (
                             <div key={`att-${step}`} className={cn("rounded-lg bg-white border flex flex-col h-full min-h-[100px]", areRulesCompleted(attRules, step) && attRules.length>0 && "ring-2 ring-green-500 border-transparent")}>
                                 <div className="p-1.5 border-b text-[10px] text-center bg-slate-50">{step===0?"PRE":`STEP ${step}`}</div>
                                 {/* ✨ [핵심 수정] 여기도 (r: Rule) 타입 명시 */}
                                 <div className="p-1 flex-1">{attRules.map((r: Rule) => renderCard(r, step, true))}</div>
                             </div>
                         )
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
        {/* Left Panel */}
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

        {/* Right Panel */}
        <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden">
           <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm shrink-0">
             <div className="flex items-center gap-2"><FileImage className="w-5 h-5 text-blue-600"/><h3 className="text-lg font-bold text-slate-800">Work Summary</h3></div>
             <div className="flex gap-2">
                <Button onClick={handleSaveSummary} className="gap-2 bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4"/> Save Summary</Button>
                <Button onClick={() => setIsGridOpen(true)} className="gap-2 bg-slate-800 hover:bg-slate-700"><Layout className="w-4 h-4"/> Checklist View</Button>
             </div>
           </div>
           
           <div className="flex-1 p-6 flex flex-col bg-slate-100 overflow-auto">
              <div className="bg-white p-4 rounded-lg shadow-sm flex flex-col h-full min-h-[600px]">
                 <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg border">
                        <Button variant={currentTool === 'draw' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('draw')} title="Pen"><PenTool className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'line' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('line')} title="Line"><Minus className="w-4 h-4 -rotate-45"/></Button>
                        <Button variant={currentTool === 'text' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('text')} title="Text (Click to add)"><Type className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('eraser')} title="Eraser"><Eraser className="w-4 h-4"/></Button>
                        
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        
                        <input type="file" accept="image/*" className="hidden" ref={overlayInputRef} onChange={(e) => handleFileUpload(e, true)} />
                        <Button variant="ghost" size="icon" onClick={() => overlayInputRef.current?.click()} title="Add Image Sticker"><ImageIcon className="w-4 h-4"/></Button>

                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant="ghost" size="icon" onClick={handleUndo} disabled={historyStep <= 0}><Undo className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" onClick={handleRedo} disabled={historyStep >= history.length - 1}><Redo className="w-4 h-4"/></Button>
                    </div>
                    
                    <div className="flex gap-2">
                       <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e, false)} />
                       <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1"/> Upload Image</Button>
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-slate-500"><Eraser className="w-4 h-4 mr-1"/> Clear</Button>}
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="text-red-500"><Trash2 className="w-4 h-4 mr-1"/> Reset All</Button>}
                    </div>
                 </div>

                 <div 
                    className={cn("flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative", isDragging && "border-blue-500 bg-blue-50")}
                    ref={containerRef}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault(); setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if(file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => uploadedImage ? addOverlayImage(ev.target?.result as string) : setUploadedImage(ev.target?.result as string);
                            reader.readAsDataURL(file);
                        }
                    }}
                 >
                    {uploadedImage ? (
                       <>
                         <img src={uploadedImage} alt="Background" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"/>
                         <canvas ref={canvasRef} className={cn("absolute inset-0 w-full h-full touch-none z-10", currentTool === 'text' ? "cursor-text" : "cursor-crosshair")}
                            onMouseDown={startAction} onMouseMove={moveAction} onMouseUp={endAction} onMouseLeave={endAction}/>
                         
                         {overlays.map((overlay) => (
                             <div key={overlay.id}
                                className={cn("absolute group cursor-move select-none", activeOverlayId === overlay.id ? "z-50 ring-2 ring-blue-500" : "z-20")}
                                style={{ left: overlay.x, top: overlay.y, width: overlay.width, height: overlay.height }}
                                onMouseDown={(e) => { e.stopPropagation(); setActiveOverlayId(overlay.id); setDragOffset({x: e.clientX, y: e.clientY}); setIsResizingOverlay(false); }}
                             >
                                 <img src={overlay.src} className="w-full h-full object-fill pointer-events-none" />
                                 <button onClick={(e) => { e.stopPropagation(); setOverlays(p => p.filter(o => o.id !== overlay.id)); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X className="w-3 h-3"/></button>
                                 <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100" 
                                      onMouseDown={(e) => { e.stopPropagation(); setActiveOverlayId(overlay.id); setDragOffset({x: e.clientX, y: e.clientY}); setIsResizingOverlay(true); }}/>
                             </div>
                         ))}

                         {textOverlays.map((t) => (
                             <div key={t.id}
                                className={cn("absolute cursor-move select-none px-2 py-1 border border-transparent hover:border-blue-300 rounded z-30", activeTextId === t.id && "border-blue-500")}
                                style={{ left: t.x, top: t.y, color: t.color, fontSize: t.fontSize, fontWeight: 'bold' }}
                                onMouseDown={(e) => { e.stopPropagation(); setActiveTextId(t.id); setDragOffset({x: e.clientX, y: e.clientY}); }}
                             >
                                 {t.text}
                                 <button onClick={(e) => { e.stopPropagation(); setTextOverlays(p => p.filter(o => o.id !== t.id)); }} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-0.5 opacity-0 hover:opacity-100"><X className="w-3 h-3"/></button>
                             </div>
                         ))}

                         {textInput && (
                           <input autoFocus className="absolute z-50 border-2 border-blue-500 bg-white px-2 py-1 text-base shadow-lg outline-none min-w-[150px] rounded"
                             style={{ left: textInput.x, top: textInput.y, color: fontColor, fontWeight: "bold" }}
                             value={textInput.value} onChange={(e) => setTextInput({ ...textInput, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleTextComplete()} onBlur={handleTextComplete}/>
                         )}
                       </>
                    ) : (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                           <FileImage className="w-16 h-16 mb-4 opacity-30"/>
                           <p className="font-bold text-lg">Upload an Image</p>
                           <p className="text-sm">Drag & drop or Paste (Ctrl+V)</p>
                       </div>
                    )}
                 </div>
              </div>
           </div>
        </div>
      </div>
      {isGridOpen && renderFullScreenGrid()}
    </>
  );
}