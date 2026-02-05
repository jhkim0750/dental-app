"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, ChevronLeft, ChevronRight, 
  Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Upload, Type, Palette, X, Paperclip, Eraser, PenTool, Minus, Undo, Redo, CheckSquare 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";

const Label = ({ children, className }: any) => <label className={className}>{children}</label>;

interface ChecklistPanelProps {
  patient: any;
}

const PRESET_TYPES = ["BOS", "Attachment", "Vertical Ridge", "Power Ridge", "Bite Ramp", "IPR", "BC", "TAG", "기타"];

const getTypeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("bos")) return "text-blue-600";
  if (t.includes("attachment")) return "text-purple-600";
  if (t.includes("ipr")) return "text-red-600";
  if (t.includes("ridge")) return "text-orange-600";
  if (t.includes("bite")) return "text-emerald-600";
  if (t.includes("bc")) return "text-cyan-600";
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
  const [memoText, setMemoText] = useState("");
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [fontColor, setFontColor] = useState("#334155");
  
  // 캔버스 상태
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  
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

  // 1. 환자가 바뀌면 초기화 및 데이터 로드
  useEffect(() => {
    setMemoText("");
    setUploadedImage(null);
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

  // 히스토리 저장
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

  // Undo/Redo
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

  // 단축키
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


  // --- 그리기 핸들러 ---
  const getCanvasPoint = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startAction = (e: React.MouseEvent) => {
    if (!uploadedImage) return;
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
                    ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                    resolve(null);
                };
            });
            ctx.drawImage(canvas, 0, 0);
            finalImage = tempCanvas.toDataURL("image/png");
        }
    }

    await store.saveSummary(patient.id, {
      image: finalImage ?? undefined, 
      memo: memoText
    });

    if (finalImage) {
        setUploadedImage(finalImage); 
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
          setHistory([]); setHistoryStep(-1);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImage(null);
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

  // --- Rule & Status Logic ---
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
  const getMainRulesForStep = (step: number) => getRulesForStep(step).filter((r: Rule) => !r.type.toLowerCase().includes("attachment"));
  const getAttachmentRulesForStep = (step: number) => getRulesForStep(step).filter((r: Rule) => r.type.toLowerCase().includes("attachment"));
  
  const getStatus = (rule: Rule, step: number) => { if (step === rule.startStep) return "NEW"; if (step === rule.endStep) return "REMOVE"; return "CHECK"; };
  const isChecked = (ruleId: string, step: number) => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === ruleId && s.checked);

  // 스텝 완료 여부 (어태치먼트 포함 전체 룰 기준)
  const isStepCompleted = (step: number, rules: Rule[]) => {
      if (rules.length === 0) return false;
      return rules.every(r => isChecked(r.id, step));
  };

  const renderCard = (rule: Rule, step: number, isTiny = false) => {
    const status = getStatus(rule, step); const checked = isChecked(rule.id, step); const typeColorClass = getTypeColor(rule.type);
    return (
      <div key={rule.id} onClick={() => store.toggleChecklistItem(patient.id, step, rule.id)}
        className={cn("rounded cursor-pointer transition-all flex flex-col relative group select-none", isTiny ? "p-1.5 mb-1.5 shadow-sm" : "p-3 mb-2 border", checked ? "bg-slate-100 text-slate-400 grayscale" : "bg-white hover:ring-2 hover:ring-blue-200", status === "NEW" && !checked && "border-l-4 border-l-green-500 shadow-md", status === "REMOVE" && !checked && "border-l-4 border-l-red-500 shadow-md")}>
        <div className="flex justify-between items-start">
          <span className={cn("font-bold text-slate-800", isTiny ? "text-[11px]" : "text-lg")}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}</span>
          <div className="flex gap-1 items-center">
            {status === "NEW" && <span className="bg-green-100 text-green-700 px-1 rounded-[3px] font-bold text-[9px]">NEW</span>}
            {status === "REMOVE" && <span className="bg-red-100 text-red-700 px-1 rounded-[3px] font-bold text-[9px]">REM</span>}
             <div className={cn("rounded flex items-center justify-center transition-colors", isTiny ? "w-3 h-3 border" : "w-5 h-5 border", checked ? "bg-slate-500 border-slate-500" : "bg-white border-slate-300")}>{checked && <CheckCheck className="text-white w-full h-full p-[1px]" />}</div>
          </div>
        </div>
        <div className={cn("font-bold truncate mt-0.5", typeColorClass, isTiny && "text-[10px]")}>{rule.type}</div>
        {rule.note && <div className={cn("text-slate-400 truncate", isTiny ? "text-[9px]" : "mt-1")}>{rule.note}</div>}
      </div>
    );
  };

  const renderFullScreenGrid = () => {
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i);
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
        <div className="flex-1 p-6 overflow-auto">
             {/* 1. Main Rules */}
             <div className="mb-8">
                 <h3 className="text-xl font-bold text-blue-800 mb-3 border-l-4 border-blue-600 pl-3 flex items-center gap-2"><Layout className="w-5 h-5"/> Main Rules</h3>
                 <div className="grid grid-cols-10 gap-2 min-w-[1400px]">
                     {stepsToShow.map((step) => {
                        const rules = getMainRulesForStep(step);
                        const isCompleted = isStepCompleted(step, getRulesForStep(step));
                        
                        return (
                            <div key={`main-${step}`} className={cn(
                                "rounded-lg min-h-[250px] flex flex-col shadow-sm transition-all relative overflow-hidden bg-white",
                                step > totalSteps ? "bg-slate-100 opacity-30 border-dashed border" : "",
                                // ✨ [핵심] 완료 시: 초록색 안쪽 테두리 (Green Inset Ring)
                                isCompleted ? "ring-2 ring-green-500 ring-inset border-transparent" : "border"
                            )}>
                                <div className={cn(
                                    "p-2 border-b font-bold text-xs text-center sticky top-0 z-10 flex justify-between items-center", 
                                    step===0 ? "bg-yellow-50" : "bg-slate-50 text-slate-700",
                                    // 완료 시 헤더 하단 선 색상 변경
                                    isCompleted && "border-b-green-100 bg-green-50/30"
                                )}>
                                  <span className="flex-1 text-center pl-4">{step === 0 ? "PRE" : `STEP ${step}`}</span>
                                  {step <= totalSteps && getRulesForStep(step).length > 0 && (
                                      <button onClick={() => store.checkAllInStep(patient.id, step)} className="hover:bg-slate-200 p-1 rounded transition-colors text-slate-400 hover:text-slate-600" title="Check All">
                                          <CheckSquare className="w-3.5 h-3.5"/>
                                      </button>
                                  )}
                                </div>
                                <div className="p-1 space-y-1 flex-1 overflow-y-auto">{step <= totalSteps && rules.map((rule: Rule) => renderCard(rule, step, true))}</div>
                            </div>
                        );
                     })}
                 </div>
             </div>
             {/* 2. Attachments Only */}
             <div className="mb-10 pt-4 border-t-2 border-dashed border-slate-300">
                 <h3 className="text-xl font-bold text-green-800 mb-3 border-l-4 border-green-600 pl-3 flex items-center gap-2 mt-4"><Paperclip className="w-5 h-5"/> Attachments Only</h3>
                 <div className="grid grid-cols-10 gap-2 min-w-[1400px]">
                     {stepsToShow.map((step) => {
                        const isCompleted = isStepCompleted(step, getRulesForStep(step));
                        return (
                            <div key={`att-${step}`} className={cn(
                                "rounded-lg min-h-[150px] flex flex-col shadow-sm transition-all relative overflow-hidden",
                                step > totalSteps ? "bg-slate-100 opacity-30 border-dashed border" : "bg-slate-50/50",
                                // ✨ [핵심] 여기도 동일하게 초록색 테두리 적용
                                isCompleted ? "ring-2 ring-green-500 ring-inset border-transparent bg-white" : "border"
                            )}>
                                 <div className={cn(
                                     "p-1.5 border-b text-[10px] font-bold text-slate-400 text-center",
                                     isCompleted && "border-b-green-100 bg-green-50/30 text-green-600"
                                 )}>
                                    {step === 0 ? "PRE" : `STEP ${step}`}
                                 </div>
                                <div className="p-1 space-y-1 flex-1 overflow-y-auto">{step <= totalSteps && getAttachmentRulesForStep(step).map((rule: Rule) => renderCard(rule, step, true))}</div>
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
        {/* 왼쪽 패널 (기존 동일) */}
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

        {/* 오른쪽 패널 (기존 동일) */}
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
                       <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                       <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1"/> Upload</Button>
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-slate-500 hover:bg-slate-100"><Eraser className="w-4 h-4 mr-1"/> Clear Draw</Button>}
                       {uploadedImage && <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-1"/> Remove All</Button>}
                    </div>
                 </div>

                 <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative mb-4 min-h-[400px]" ref={containerRef}>
                    {uploadedImage ? (
                       <>
                         <img src={uploadedImage} alt="Background" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"/>
                         <canvas ref={canvasRef} className={cn("absolute inset-0 w-full h-full cursor-crosshair touch-none", currentTool === 'text' && "cursor-text", currentTool === 'eraser' && "cursor-cell")}
                            onMouseDown={startAction} onMouseMove={moveAction} onMouseUp={endAction} onMouseLeave={endAction}/>
                         {textInput && (
                           <input autoFocus className="absolute z-50 border-2 border-blue-500 bg-white px-2 py-1 text-base shadow-lg outline-none min-w-[150px] rounded"
                             style={{ left: textInput.x, top: textInput.y, color: fontColor, fontFamily: "sans-serif", fontWeight: "bold" }}
                             value={textInput.value} onChange={(e) => setTextInput({ ...textInput, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleTextComplete()} onBlur={handleTextComplete}/>
                         )}
                       </>
                    ) : (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400"><FileImage className="w-12 h-12 mb-2 opacity-50"/><p>Upload a graph image to start drawing</p></div>
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