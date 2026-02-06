"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, ChevronLeft, ChevronRight, 
  Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Upload, Type, Palette, X, Paperclip, Eraser, PenTool, Minus, Undo, Redo, CheckSquare, CheckCircle2,
  Image as ImageIcon, MousePointer2, BringToFront, SendToBack, GripHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";

const Label = ({ children, className }: any) => <label className={className}>{children}</label>;

interface ChecklistPanelProps {
  patient: any;
}

// ✨ 모든 오브젝트를 통합 관리하는 타입 (PPT 방식)
type CanvasItemType = 'image' | 'text' | 'line';

interface BaseItem {
  id: number;
  type: CanvasItemType;
  x: number;
  y: number;
  zIndex: number;
}

interface ImageItem extends BaseItem {
  type: 'image';
  src: string;
  width: number;
  height: number;
}

interface TextItem extends BaseItem {
  type: 'text';
  text: string;
  color: string;
  fontSize: number;
  width?: number; // 텍스트 박스 너비 (줄바꿈용)
}

interface LineItem extends BaseItem {
  type: 'line';
  x2: number;
  y2: number;
  color: string;
  width: number; // 선 굵기
}

type CanvasItem = ImageItem | TextItem | LineItem;

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

  // --- 룰 입력 상태 ---
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");

  // --- 캔버스 상태 ---
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // 펜 그리기용 (Raster)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✨ PPT 방식: 모든 아이템을 하나의 배열로 관리
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 툴 설정
  const [currentTool, setCurrentTool] = useState<"select" | "draw" | "line" | "eraser" | "text">("select");
  const [mainColor, setMainColor] = useState("#334155");
  const [toolSize, setToolSize] = useState<number>(20); // 폰트크기, 선굵기, 지우개크기 통합

  // 드래그/리사이즈 상태
  const [isDragging, setIsDragging] = useState(false); // 파일 드래그 여부
  const [dragAction, setDragAction] = useState<"move" | "resize" | "draw" | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);

  // 텍스트 입력
  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);

  // 펜 히스토리
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // 1. 초기화
  useEffect(() => {
    setPageStartStep(0);
    setItems([]);
    setSelectedId(null);
    setHistory([]);
    setHistoryStep(-1);
    
    // 캔버스 초기화 (흰색 배경)
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.width = canvas.parentElement?.offsetWidth || 800;
        canvas.height = canvas.parentElement?.offsetHeight || 600;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "transparent";
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // 저장된 이미지 불러오기 (배경 이미지처럼 첫 번째 아이템으로 추가)
    if (patient.summary && patient.summary.image) {
       const img = new Image();
       img.src = patient.summary.image;
       img.onload = () => {
           // 기존 이미지는 수정 불가능한 배경으로 깔기보다, 수정 가능한 이미지 아이템으로 추가
           const newItem: ImageItem = {
               id: Date.now(),
               type: 'image',
               src: patient.summary.image!,
               x: 0, y: 0,
               width: img.width > 600 ? 600 : img.width, // 적절히 리사이즈
               height: img.height > 400 ? 400 : img.height,
               zIndex: 0
           };
           setItems([newItem]);
       }
    }
  }, [patient.id]);

  // 2. 캔버스 리사이즈 감지
  useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if(container && canvas && history.length === 0) {
          canvas.width = container.offsetWidth;
          canvas.height = container.offsetHeight;
      }
  }, []);

  // --- 핵심 기능 함수들 ---

  // 펜 히스토리 저장
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

  // Undo/Redo
  const handleUndo = () => {
      if (historyStep > 0) {
          const prevStep = historyStep - 1;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx && history[prevStep]) {
              ctx.putImageData(history[prevStep], 0, 0);
              setHistoryStep(prevStep);
          }
      } else if (historyStep === 0) {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if(canvas && ctx) ctx.clearRect(0,0, canvas.width, canvas.height);
          setHistoryStep(-1);
      }
  };

  const handleRedo = () => {
      if (historyStep < history.length - 1) {
          const nextStep = historyStep + 1;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx && history[nextStep]) {
              ctx.putImageData(history[nextStep], 0, 0);
              setHistoryStep(nextStep);
          }
      }
  };

  // 펜 지우기
  const clearPen = () => {
      const canvas = canvasRef.current;
      if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          saveHistory();
      }
  };

  // 전체 초기화
  const clearAll = () => {
      if(confirm("Clear all content?")) {
          setItems([]);
          clearPen();
          setSelectedId(null);
      }
  };

  // 아이템 추가 (이미지)
  const addItemImage = (src: string) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
          let w = img.width;
          let h = img.height;
          // 너무 크면 줄이기
          if (w > 400) {
              const ratio = 400 / w;
              w = 400;
              h = h * ratio;
          }
          const newItem: ImageItem = {
              id: Date.now(),
              type: 'image',
              src,
              x: 50, y: 50,
              width: w, height: h,
              zIndex: items.length
          };
          setItems(prev => [...prev, newItem]);
          setSelectedId(newItem.id);
          setCurrentTool('select');
      };
  };

  // 아이템 삭제 (선택된 것)
  const deleteSelectedItem = () => {
      if (selectedId) {
          setItems(prev => prev.filter(i => i.id !== selectedId));
          setSelectedId(null);
      }
  };

  // 레이어 순서 변경
  const changeZIndex = (direction: 'up' | 'down') => {
      if (!selectedId) return;
      const index = items.findIndex(i => i.id === selectedId);
      if (index === -1) return;

      const newItems = [...items];
      if (direction === 'up' && index < items.length - 1) {
          [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      } else if (direction === 'down' && index > 0) {
          [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
      }
      setItems(newItems);
  };

  // 텍스트 완료
  const handleTextComplete = () => {
      if (textInput && textInput.value.trim()) {
          const newItem: TextItem = {
              id: Date.now(),
              type: 'text',
              text: textInput.value,
              x: textInput.x,
              y: textInput.y,
              color: mainColor,
              fontSize: toolSize,
              zIndex: items.length
          };
          setItems(prev => [...prev, newItem]);
          setSelectedId(newItem.id);
      }
      setTextInput(null);
      setCurrentTool('select');
  };

  // --- 마우스 이벤트 핸들러 ---
  const getPoint = (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      const { x, y } = getPoint(e);

      // 1. 그리기 모드
      if (currentTool === 'draw' || currentTool === 'eraser') {
          setDragAction('draw');
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineWidth = currentTool === 'eraser' ? toolSize : 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : mainColor;
              ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
          }
          return;
      }

      // 2. 선 그리기
      if (currentTool === 'line') {
          setDragAction('draw');
          setStartPos({ x, y });
          return;
      }

      // 3. 텍스트 추가
      if (currentTool === 'text') {
          setTextInput({ x, y, value: "" });
          return;
      }

      // 4. 선택 모드 (바탕 클릭 시 선택 해제)
      if (currentTool === 'select') {
          // 아이템을 클릭했는지는 아이템 자체의 onMouseDown에서 처리됨.
          // 여기서 이벤트가 발생했다는 건 빈 공간을 눌렀다는 뜻.
          setSelectedId(null);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getPoint(e);

      // 그리기
      if (dragAction === 'draw' && (currentTool === 'draw' || currentTool === 'eraser')) {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
              ctx.lineTo(x, y);
              ctx.stroke();
          }
          return;
      }

      // 아이템 이동/리사이즈
      if (dragAction === 'move' && selectedId) {
          setItems(prev => prev.map(item => {
              if (item.id !== selectedId) return item;
              return { ...item, x: x - dragOffset.x, y: y - dragOffset.y };
          }));
      } else if (dragAction === 'resize' && selectedId) {
          setItems(prev => prev.map(item => {
              if (item.id !== selectedId) return item;
              if (item.type === 'image') {
                  return { ...item, width: Math.max(20, x - item.x), height: Math.max(20, y - item.y) };
              }
              if (item.type === 'line') {
                  return { ...item, x2: x, y2: y };
              }
              return item;
          }));
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      const { x, y } = getPoint(e);

      if (dragAction === 'draw') {
          if (currentTool === 'line' && startPos) {
              // 선 객체 생성
              const newItem: LineItem = {
                  id: Date.now(),
                  type: 'line',
                  x: startPos.x,
                  y: startPos.y,
                  x2: x, 
                  y2: y,
                  color: mainColor,
                  width: 3,
                  zIndex: items.length
              };
              setItems(prev => [...prev, newItem]);
              setSelectedId(newItem.id);
              setCurrentTool('select');
          } else {
              // 펜 그리기 종료
              const ctx = canvasRef.current?.getContext('2d');
              if(ctx) {
                  ctx.closePath();
                  ctx.globalCompositeOperation = 'source-over';
              }
              saveHistory();
          }
      }

      setDragAction(null);
      setStartPos(null);
  };

  // 키보드 삭제 / Undo
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedId && !textInput) deleteSelectedItem();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) handleRedo(); else handleUndo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, textInput, history, historyStep]);

  // 파일 붙여넣기 / 드랍
  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => addItemImage(ev.target?.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleSave = async () => {
      if (!containerRef.current || !canvasRef.current) return;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      // 1. 흰 배경
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // 2. 아이템 순서대로 그리기
      for (const item of items) {
          if (item.type === 'image') {
              const img = new Image();
              img.src = item.src;
              img.crossOrigin = "anonymous";
              await new Promise(r => { img.onload = r; img.onerror = r; });
              ctx.drawImage(img, item.x, item.y, item.width, item.height);
          } else if (item.type === 'line') {
              ctx.beginPath();
              ctx.moveTo(item.x, item.y);
              ctx.lineTo(item.x2, item.y2);
              ctx.strokeStyle = item.color;
              ctx.lineWidth = item.width;
              ctx.stroke();
          } else if (item.type === 'text') {
              ctx.font = `bold ${item.fontSize}px sans-serif`;
              ctx.fillStyle = item.color;
              ctx.textBaseline = 'top';
              const lines = item.text.split('\n');
              lines.forEach((line, i) => {
                  ctx.fillText(line, item.x, item.y + (i * item.fontSize * 1.2));
              });
          }
      }

      // 3. 펜 레이어 합치기
      ctx.drawImage(canvasRef.current, 0, 0);

      const finalImage = tempCanvas.toDataURL('image/png');
      await store.saveSummary(patient.id, { image: finalImage, memo: '' });
      alert("Saved!");
  };

  // --- 기존 룰 로직 (그리드) ---
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
  
  const getRulesForStep = (step: number) => (patient.rules || []).filter((r: Rule) => step >= r.startStep && step <= r.endStep).sort((a: Rule, b: Rule) => a.tooth - b.tooth);
  const getGroupedRules = (step: number) => {
    const allRules = getRulesForStep(step);
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
    let maxGenCount = 0; let maxUpperCount = 0; let maxLowerCount = 0;
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
                                <div className={cn("p-2 font-bold text-xs text-center rounded-lg border flex justify-between", step===0?"bg-yellow-100":isAllDone?"bg-blue-600 text-white":"bg-white")}><span>{step===0?"PRE":`STEP ${step}`}</span>{step<=totalSteps && <button onClick={()=>store.checkAllInStep(patient.id,step)}><CheckSquare className="w-3.5 h-3.5"/></button>}</div>
                                <div className="space-y-2">
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(genRules, step) && genRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxGenCount)}><div className="text-[9px] font-bold text-slate-400 px-1 mb-1">GENERAL</div>{genRules.map((r: Rule) => renderCard(r, step, true))}</div>
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(upperRules, step) && upperRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxUpperCount)}><div className="text-[9px] font-bold text-blue-400 px-1 mb-1">MAXILLA</div>{upperRules.map((r: Rule) => renderCard(r, step, true))}</div>
                                    <div className={cn("bg-white rounded-lg p-1 border flex flex-col", areRulesCompleted(lowerRules, step) && lowerRules.length>0 && "ring-2 ring-green-500 border-transparent")} style={getFixedStyle(maxLowerCount)}><div className="text-[9px] font-bold text-orange-400 px-1 mb-1">MANDIBLE</div>{lowerRules.map((r: Rule) => renderCard(r, step, true))}</div>
                                </div>
                            </div>
                        );
                     })}
                 </div>
             </div>
             <div className="mb-10 pt-4 border-t-2 border-dashed">
                 <h3 className="text-xl font-bold text-green-800 mb-3 pl-3 border-l-4 border-green-600">Attachments Only</h3>
                 <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                     {stepsToShow.map(step => {
                         if(step>totalSteps) return null;
                         const { attRules } = getGroupedRules(step);
                         return (
                             <div key={`att-${step}`} className={cn("rounded-lg bg-white border flex flex-col h-full min-h-[100px]", areRulesCompleted(attRules, step) && attRules.length>0 && "ring-2 ring-green-500 border-transparent")}>
                                 <div className="p-1.5 border-b text-[10px] text-center bg-slate-50">{step===0?"PRE":`STEP ${step}`}</div>
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
              {/* ... Rule 입력 폼 ... */}
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
                 <h3 className="text-xs font-bold text-slate-500 uppercase">Existing Rules ({patient.rules?.length || 0})</h3>
                 {(patient.rules || []).map((rule: Rule) => (
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

        {/* Right Panel: Canvas */}
        <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden">
           {/* 헤더 */}
           <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm shrink-0">
             <div className="flex items-center gap-2"><FileImage className="w-5 h-5 text-blue-600"/><h3 className="text-lg font-bold text-slate-800">Work Summary</h3></div>
             <div className="flex gap-2">
                <Button onClick={handleSave} className="gap-2 bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4"/> Save Summary</Button>
                <Button onClick={() => setIsGridOpen(true)} className="gap-2 bg-slate-800 hover:bg-slate-700"><Layout className="w-4 h-4"/> Checklist View</Button>
             </div>
           </div>
           
           <div className="flex-1 p-6 flex flex-col bg-slate-100 overflow-auto">
              <div className="bg-white p-4 rounded-lg shadow-sm flex flex-col h-full min-h-[600px] relative">
                 
                 {/* 툴바 */}
                 <div className="flex justify-between items-center mb-4 flex-wrap gap-2 sticky top-0 z-50 bg-white/90 backdrop-blur-sm p-2 border-b">
                    <div className="flex items-center gap-2">
                        <Button variant={currentTool === 'select' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('select')} title="Select (V)"><MousePointer2 className="w-4 h-4"/></Button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant={currentTool === 'draw' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('draw')} title="Pen (P)"><PenTool className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'line' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('line')} title="Line (L)"><Minus className="w-4 h-4 -rotate-45"/></Button>
                        <Button variant={currentTool === 'text' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('text')} title="Text (T)"><Type className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('eraser')} title="Eraser (E)"><Eraser className="w-4 h-4"/></Button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { 
                            if(e.target.files?.[0]) { 
                                const reader = new FileReader(); 
                                reader.onload=(ev)=>addItemImage(ev.target?.result as string); 
                                reader.readAsDataURL(e.target.files[0]); 
                            } 
                        }} />
                        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Add Image"><ImageIcon className="w-4 h-4"/></Button>

                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <input type="color" value={mainColor} onChange={(e) => setMainColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                        <div className="flex items-center gap-1 ml-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Size</span>
                            <input type="range" min="10" max="60" value={toolSize} onChange={(e) => setToolSize(Number(e.target.value))} className="w-20 accent-blue-600" />
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                       {selectedId && (
                           <>
                               <Button variant="ghost" size="sm" onClick={() => changeZIndex('up')} title="Bring Forward"><BringToFront className="w-4 h-4"/></Button>
                               <Button variant="ghost" size="sm" onClick={() => changeZIndex('down')} title="Send Backward"><SendToBack className="w-4 h-4"/></Button>
                               <div className="w-px h-4 bg-slate-300 mx-1"></div>
                               <Button variant="ghost" size="sm" onClick={deleteSelectedItem} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4"/></Button>
                           </>
                       )}
                       <div className="w-px h-4 bg-slate-300 mx-1"></div>
                       <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400">Clear All</Button>
                    </div>
                 </div>

                 {/* 캔버스 영역 */}
                 <div 
                    className={cn("flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative cursor-default", 
                        isDragging && "border-blue-500 bg-blue-50",
                        currentTool === 'draw' && "cursor-crosshair",
                        currentTool === 'text' && "cursor-text"
                    )}
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                 >
                    {/* (1) 이미지 & 텍스트 & 선 (오브젝트) */}
                    {items.map((item) => {
                        const isSelected = selectedId === item.id;
                        
                        if (item.type === 'image') {
                            return (
                                <div key={item.id}
                                    className={cn("absolute select-none", isSelected ? "ring-2 ring-blue-500 z-50" : "z-auto")}
                                    style={{ left: item.x, top: item.y, width: (item as ImageItem).width, height: (item as ImageItem).height, zIndex: item.zIndex }}
                                    onMouseDown={(e) => {
                                        if (currentTool !== 'select') return;
                                        e.stopPropagation();
                                        setSelectedId(item.id);
                                        setDragAction('move');
                                        setDragOffset({ x: e.clientX - item.x, y: e.clientY - item.y });
                                    }}
                                >
                                    <img src={(item as ImageItem).src} className="w-full h-full object-fill pointer-events-none" />
                                    {isSelected && (
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-nwse-resize"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setDragAction('resize');
                                                setDragOffset({ x: e.clientX, y: e.clientY }); // 리사이즈는 좌표만 저장
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        } 
                        
                        if (item.type === 'text') {
                            const tItem = item as TextItem;
                            return (
                                <div key={item.id}
                                    className={cn("absolute select-none px-1 border border-transparent whitespace-pre-wrap", isSelected ? "border-blue-500 z-50" : "z-auto")}
                                    style={{ left: item.x, top: item.y, color: tItem.color, fontSize: tItem.fontSize, fontWeight: 'bold', zIndex: item.zIndex }}
                                    onMouseDown={(e) => {
                                        if (currentTool !== 'select') return;
                                        e.stopPropagation();
                                        setSelectedId(item.id);
                                        setDragAction('move');
                                        setDragOffset({ x: e.clientX - item.x, y: e.clientY - item.y });
                                    }}
                                >
                                    {tItem.text}
                                </div>
                            );
                        }

                        if (item.type === 'line') {
                            const lItem = item as LineItem;
                            // 선은 SVG로 따로 그리지 않고 DIV 오버레이로 처리하거나, 
                            // 여기서는 간단히 SVG 레이어에 통합하지 않고 개별 SVG로 렌더링하여 클릭 감지
                            // (편의상 SVG 컨테이너를 따로 두지 않고 개별 렌더링)
                            const width = Math.abs(lItem.x2 - lItem.x);
                            const height = Math.abs(lItem.y2 - lItem.y);
                            const left = Math.min(lItem.x, lItem.x2);
                            const top = Math.min(lItem.y, lItem.y2);
                            
                            return (
                                <svg key={item.id} className="absolute pointer-events-none" style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: item.zIndex }}>
                                    <line 
                                        x1={lItem.x} y1={lItem.y} x2={lItem.x2} y2={lItem.y2}
                                        stroke={lItem.color} strokeWidth={lItem.width}
                                        className={cn("pointer-events-auto cursor-move", isSelected ? "stroke-blue-500 opacity-80" : "")}
                                        onMouseDown={(e) => {
                                            if (currentTool !== 'select') return;
                                            e.stopPropagation();
                                            setSelectedId(item.id);
                                            setDragAction('move');
                                            // 선 이동은 dx, dy 계산 필요
                                            setDragOffset({ x: e.clientX, y: e.clientY }); 
                                        }}
                                    />
                                    {isSelected && (
                                        <circle cx={lItem.x2} cy={lItem.y2} r={6} fill="blue" className="pointer-events-auto cursor-nwse-resize"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setSelectedId(item.id);
                                                setDragAction('resize');
                                            }}
                                        />
                                    )}
                                </svg>
                            );
                        }
                    })}

                    {/* (2) 펜 드로잉 레이어 (항상 최상위, pointer-events 제어) */}
                    <canvas 
                        ref={canvasRef} 
                        className={cn("absolute inset-0 w-full h-full touch-none z-40", (currentTool === 'draw' || currentTool === 'eraser') ? "pointer-events-auto" : "pointer-events-none")} 
                    />

                    {/* (3) 임시 라인 (그리는 중) */}
                    {dragAction === 'draw' && currentTool === 'line' && startPos && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-50">
                            <line x1={startPos.x} y1={startPos.y} x2={dragOffset.x || startPos.x} y2={dragOffset.y || startPos.y} stroke={mainColor} strokeWidth={toolSize/4} />
                        </svg>
                    )}

                    {/* (4) 텍스트 입력창 */}
                    {textInput && (
                        <textarea autoFocus 
                            className="absolute z-50 border-2 border-blue-500 bg-white/90 px-2 py-1 shadow-lg outline-none min-w-[200px] rounded resize-none overflow-hidden"
                            style={{ left: textInput.x, top: textInput.y, color: mainColor, fontSize: toolSize, fontWeight: "bold", height: "auto" }}
                            value={textInput.value} 
                            onChange={(e) => {
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                                setTextInput({ ...textInput, value: e.target.value })
                            }} 
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleTextComplete();
                                }
                            }}
                            onBlur={handleTextComplete}
                        />
                    )}

                    {items.length === 0 && history.length === 0 && !textInput && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
                           <FileImage className="w-16 h-16 mb-4 opacity-50"/>
                           <p className="font-bold text-lg">Drop image or Start drawing</p>
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