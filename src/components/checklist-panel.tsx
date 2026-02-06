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

// ✨ 아이템 타입 정의
type ItemType = 'image' | 'text' | 'line';

interface CanvasItem {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  zIndex: number;
  // 공통
  color?: string;
  size?: number; 
  // 이미지
  src?: string;
  width?: number;
  height?: number;
  // 텍스트
  text?: string;
  // 선 (끝점)
  x2?: number;
  y2?: number;
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

  // Rule 입력 상태
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");

  // 캔버스 관련 Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // 펜 그리기용 (Raster)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✨ 상태 관리
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  // Undo/Redo를 위한 History (아이템 배열 전체를 저장)
  const [history, setHistory] = useState<CanvasItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 툴 설정
  const [currentTool, setCurrentTool] = useState<"select" | "draw" | "line" | "eraser" | "text">("select");
  const [mainColor, setMainColor] = useState("#334155");
  const [toolSize, setToolSize] = useState<number>(20); 

  // 드래그 상태 관리
  const [dragState, setDragState] = useState<{
      isDragging: boolean;
      action: "move" | "resize_img" | "resize_line_start" | "resize_line_end" | "draw_pen" | "draw_line" | null;
      startX: number;
      startY: number;
      offsetX: number; 
      offsetY: number;
  }>({
      isDragging: false, action: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0
  });

  const [textInput, setTextInput] = useState<{x: number, y: number, value: string} | null>(null);

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // 1. 초기화
  useEffect(() => {
    setPageStartStep(0);
    setItems([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedId(null);
    
    // 캔버스 클리어
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.width = canvas.parentElement?.offsetWidth || 800;
        canvas.height = canvas.parentElement?.offsetHeight || 600;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 저장된 이미지 로드
    if (patient.summary && patient.summary.image) {
       const img = new Image();
       img.src = patient.summary.image;
       img.onload = () => {
           const initialItem: CanvasItem = {
               id: Date.now(),
               type: 'image',
               src: patient.summary.image!,
               x: 0, y: 0,
               width: img.width > 800 ? 800 : img.width,
               height: img.height > 600 ? 600 : img.height,
               zIndex: 0
           };
           setItems([initialItem]);
           setHistory([[initialItem]]);
           setHistoryIndex(0);
       }
    }
  }, [patient.id]);

  // ============================================================
  // ✨ [핵심 수정] 함수들을 사용하는 곳보다 위로 끌어올림
  // ============================================================

  // --- History Management (Undo/Redo) ---
  const recordHistory = (newItems: CanvasItem[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newItems);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          setItems(history[prevIndex]);
          setHistoryIndex(prevIndex);
          setSelectedId(null); 
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setItems(history[nextIndex]);
          setHistoryIndex(nextIndex);
          setSelectedId(null);
      }
  };

  // --- Actions ---
  const clearPenLayer = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // 펜 히스토리는 별도 관리하지 않으므로 여기선 생략
      }
  };

  const clearAll = () => {
      if(confirm("Clear all content?")) {
          setItems([]);
          recordHistory([]); 
          const ctx = canvasRef.current?.getContext("2d");
          if(ctx && canvasRef.current) ctx.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
      }
  };

  const deleteSelectedItem = () => {
      if (selectedId) {
          const newItems = items.filter(i => i.id !== selectedId);
          setItems(newItems);
          recordHistory(newItems);
          setSelectedId(null);
      }
  };

  // ✨ [에러 수정] moveLayer 함수를 여기로 이동!
  const moveLayer = (direction: 'up' | 'down') => {
      if (!selectedId) return;
      const idx = items.findIndex(i => i.id === selectedId);
      if (idx === -1) return;
      const newItems = [...items];
      if (direction === 'up' && idx < items.length - 1) {
          [newItems[idx], newItems[idx+1]] = [newItems[idx+1], newItems[idx]];
      } else if (direction === 'down' && idx > 0) {
          [newItems[idx], newItems[idx-1]] = [newItems[idx-1], newItems[idx]];
      }
      setItems(newItems);
      recordHistory(newItems);
  };

  // --- Adding Items ---
  const addImage = (src: string) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > 400) { const r = 400/w; w = 400; h = h*r; }
          
          const newItem: CanvasItem = {
              id: Date.now(), type: 'image', src, x: 50, y: 50, width: w, height: h, zIndex: items.length
          };
          const newItems = [...items, newItem];
          setItems(newItems);
          recordHistory(newItems);
          setSelectedId(newItem.id);
          setCurrentTool('select');
      };
  };

  const confirmText = () => {
      if (textInput && textInput.value.trim()) {
          const newItem: CanvasItem = {
              id: Date.now(), type: 'text', text: textInput.value,
              x: textInput.x, y: textInput.y, color: mainColor, size: toolSize, zIndex: items.length
          };
          const newItems = [...items, newItem];
          setItems(newItems);
          recordHistory(newItems);
          setSelectedId(newItem.id);
      }
      setTextInput(null);
      setCurrentTool('select');
  };

  // --- Mouse Event Helpers ---
  const getPos = (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // --- MOUSE DOWN ---
  const handleMouseDown = (e: React.MouseEvent) => {
      const { x, y } = getPos(e);

      // 1. 그리기 (Pen/Eraser)
      if (currentTool === 'draw' || currentTool === 'eraser') {
          setDragState({ isDragging: true, action: 'draw_pen', startX: x, startY: y, offsetX: 0, offsetY: 0 });
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineWidth = currentTool === 'eraser' ? toolSize : 3;
              ctx.lineCap = 'round'; ctx.lineJoin = 'round';
              ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : mainColor;
              ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
          }
          return;
      }

      // 2. 선 그리기 시작
      if (currentTool === 'line') {
          const tempLine: CanvasItem = {
              id: -1, type: 'line', x: x, y: y, x2: x, y2: y, color: mainColor, size: 3, zIndex: 999
          };
          setItems(p => [...p, tempLine]);
          setDragState({ isDragging: true, action: 'draw_line', startX: x, startY: y, offsetX: 0, offsetY: 0 });
          return;
      }

      // 3. 텍스트 추가
      if (currentTool === 'text') {
          setTextInput({ x, y, value: "" });
          return;
      }

      // 4. 선택 모드: 배경 클릭시 선택 해제
      if (currentTool === 'select') {
          setSelectedId(null);
      }
  };

  // --- ITEM MOUSE DOWN (이동/리사이즈) ---
  const handleItemMouseDown = (e: React.MouseEvent, item: CanvasItem, action: typeof dragState.action) => {
      if (currentTool !== 'select') return;
      e.stopPropagation(); // 배경 전파 방지

      const { x, y } = getPos(e);
      setSelectedId(item.id);

      // 이동 시 클릭 지점과 객체 원점 간의 거리(Offset) 계산
      let offsetX = 0, offsetY = 0;
      if (action === 'move') {
          offsetX = x - item.x;
          offsetY = y - item.y;
      }

      setDragState({
          isDragging: true,
          action: action,
          startX: x, startY: y,
          offsetX, offsetY
      });
  };

  // --- MOUSE MOVE ---
  const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getPos(e);

      // 1. 펜 그리기
      if (dragState.isDragging && dragState.action === 'draw_pen') {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) { ctx.lineTo(x, y); ctx.stroke(); }
          return;
      }

      // 2. 선 그리기 (미리보기)
      if (dragState.isDragging && dragState.action === 'draw_line') {
          setItems(prev => prev.map(i => i.id === -1 ? { ...i, x2: x, y2: y } : i));
          return;
      }

      if (!dragState.isDragging || !selectedId) return;

      // 3. 아이템 이동/리사이즈 적용
      setItems(prevItems => prevItems.map(item => {
          if (item.id !== selectedId) return item;

          switch (dragState.action) {
              case 'move':
                  if (item.type === 'line') {
                      const dx = x - dragState.offsetX - item.x;
                      const dy = y - dragState.offsetY - item.y;
                      return { ...item, x: item.x + dx, y: item.y + dy, x2: (item.x2 || 0) + dx, y2: (item.y2 || 0) + dy };
                  }
                  return { ...item, x: x - dragState.offsetX, y: y - dragState.offsetY };
              
              case 'resize_img':
                  return { ...item, width: Math.max(20, x - item.x), height: Math.max(20, y - item.y) };
              
              case 'resize_line_start':
                  return { ...item, x: x, y: y }; // 시작점 이동
              
              case 'resize_line_end':
                  return { ...item, x2: x, y2: y }; // 끝점 이동
              
              default:
                  return item;
          }
      }));
  };

  // --- MOUSE UP ---
  const handleMouseUp = () => {
      if (!dragState.isDragging) return;

      // 펜 그리기 종료
      if (dragState.action === 'draw_pen') {
          const ctx = canvasRef.current?.getContext('2d');
          if(ctx) { ctx.closePath(); ctx.globalCompositeOperation = 'source-over'; }
      }

      // 선 그리기 확정
      if (dragState.action === 'draw_line') {
          const newItems = items.map(i => i.id === -1 ? { ...i, id: Date.now() } : i);
          setItems(newItems);
          recordHistory(newItems);
          setCurrentTool('select');
      } 
      // 이동/리사이즈 완료
      else if (['move', 'resize_img', 'resize_line_start', 'resize_line_end'].includes(dragState.action || '')) {
          recordHistory(items);
      }

      setDragState({ ...dragState, isDragging: false, action: null });
  };

  // --- 키보드 이벤트 ---
  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (textInput) return; 
          if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedItem();
          if ((e.ctrlKey || e.metaKey)) {
              if (e.key.toLowerCase() === 'z') {
                  e.preventDefault();
                  if (e.shiftKey) handleRedo(); else handleUndo();
              } else if (e.key.toLowerCase() === 'y') { 
                  e.preventDefault();
                  handleRedo();
              }
          }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [selectedId, textInput, historyIndex, history]);

  // --- 파일 드랍 ---
  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => addImage(ev.target?.result as string);
          reader.readAsDataURL(file);
      }
  };

  // --- 저장 ---
  const handleSave = async () => {
      if (!containerRef.current || !canvasRef.current) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      for (const item of items) {
          if (item.type === 'image' && item.src) {
              const img = new Image();
              img.src = item.src;
              img.crossOrigin = 'anonymous';
              await new Promise(r => { img.onload = r; img.onerror = r; });
              ctx.drawImage(img, item.x, item.y, item.width!, item.height!);
          } else if (item.type === 'line') {
              ctx.beginPath();
              ctx.moveTo(item.x, item.y);
              ctx.lineTo(item.x2!, item.y2!);
              ctx.strokeStyle = item.color!;
              ctx.lineWidth = item.size!;
              ctx.stroke();
          } else if (item.type === 'text') {
              ctx.font = `bold ${item.size}px sans-serif`;
              ctx.fillStyle = item.color!;
              ctx.textBaseline = 'top';
              const lines = item.text!.split('\n');
              lines.forEach((line, i) => {
                  ctx.fillText(line, item.x, item.y + (i * item.size! * 1.2));
              });
          }
      }

      ctx.drawImage(canvasRef.current, 0, 0);

      const finalImage = tempCanvas.toDataURL('image/png');
      await store.saveSummary(patient.id, { image: finalImage, memo: '' });
      alert("Saved!");
  };

  // --- 기존 룰 로직 ---
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
                        <Button variant={currentTool === 'select' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('select')} className={cn(currentTool === 'select' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Select"><MousePointer2 className="w-4 h-4"/></Button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant={currentTool === 'draw' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('draw')} className={cn(currentTool === 'draw' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Pen"><PenTool className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'line' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('line')} className={cn(currentTool === 'line' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Line"><Minus className="w-4 h-4 -rotate-45"/></Button>
                        <Button variant={currentTool === 'text' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('text')} className={cn(currentTool === 'text' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Text"><Type className="w-4 h-4"/></Button>
                        <Button variant={currentTool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setCurrentTool('eraser')} className={cn(currentTool === 'eraser' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Eraser"><Eraser className="w-4 h-4"/></Button>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files?.[0]) { const reader = new FileReader(); reader.onload=(ev)=>addImage(ev.target?.result as string); reader.readAsDataURL(e.target.files[0]); } }} />
                        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Add Image"><ImageIcon className="w-4 h-4"/></Button>

                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <input type="color" value={mainColor} onChange={(e) => setMainColor(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                        <div className="flex items-center gap-1 ml-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Size</span>
                            <input type="range" min="5" max="50" value={toolSize} onChange={(e) => setToolSize(Number(e.target.value))} className="w-20 accent-blue-600" />
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                       {selectedId && (
                           <>
                               <Button variant="ghost" size="sm" onClick={() => moveLayer('up')}><BringToFront className="w-4 h-4"/></Button>
                               <Button variant="ghost" size="sm" onClick={() => moveLayer('down')}><SendToBack className="w-4 h-4"/></Button>
                               <Button variant="ghost" size="sm" onClick={deleteSelectedItem} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4"/></Button>
                               <div className="w-px h-4 bg-slate-300 mx-1"></div>
                           </>
                       )}
                       <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400">Clear All</Button>
                    </div>
                 </div>

                 {/* 캔버스 영역 */}
                 <div 
                    className={cn("flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative select-none", 
                        currentTool === 'draw' && "cursor-crosshair",
                        currentTool === 'eraser' && "cursor-cell",
                        currentTool === 'text' && "cursor-text",
                        currentTool === 'line' && "cursor-crosshair",
                        currentTool === 'select' && "cursor-default"
                    )}
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={handleDrop}
                 >
                    {/* (1) 펜 그리기 레이어 (최하단) */}
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

                    {/* (2) 아이템 렌더링 (순서 = z-index) */}
                    {items.map((item) => {
                        const isSelected = selectedId === item.id;
                        const commonStyle: React.CSSProperties = {
                            left: item.x, top: item.y, zIndex: items.indexOf(item) + 1,
                            pointerEvents: currentTool === 'select' ? 'auto' : 'none' 
                        };

                        if (item.type === 'image') {
                            return (
                                <div key={item.id} className={cn("absolute", isSelected && "ring-2 ring-blue-500")}
                                    style={{ ...commonStyle, width: item.width, height: item.height }}
                                    onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                >
                                    <img src={item.src} className="w-full h-full object-fill pointer-events-none" />
                                    {isSelected && currentTool === 'select' && (
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-nwse-resize"
                                            onMouseDown={(e) => handleItemMouseDown(e, item, 'resize_img')} />
                                    )}
                                </div>
                            );
                        } 
                        
                        if (item.type === 'text') {
                            return (
                                <div key={item.id} className={cn("absolute whitespace-pre-wrap px-1 border border-transparent", isSelected && "border-blue-500")}
                                    style={{ ...commonStyle, color: item.color, fontSize: item.size, fontWeight: 'bold' }}
                                    onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                >
                                    {item.text}
                                </div>
                            );
                        }

                        if (item.type === 'line') {
                            // 선: 컨테이너 전체를 덮는 개별 SVG로 렌더링
                            return (
                                <svg key={item.id} className="absolute overflow-visible" 
                                    style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: items.indexOf(item) + 1, pointerEvents: 'none' }}
                                >
                                    {/* 투명한 굵은 선 (클릭 판정용) */}
                                    <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={Math.max(item.size || 3, 20)}
                                        className={cn(currentTool === 'select' ? "pointer-events-auto cursor-move" : "")}
                                        onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                    />
                                    {/* 실제 보이는 선 */}
                                    <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={item.size}
                                        className={cn(currentTool === 'select' ? "pointer-events-none" : "", isSelected && "opacity-80")}
                                    />
                                    {/* 양 끝점 핸들 (선택 시) */}
                                    {isSelected && currentTool === 'select' && (
                                        <>
                                            <circle cx={item.x} cy={item.y} r={6} fill="blue" className="pointer-events-auto cursor-pointer"
                                                onMouseDown={(e) => handleItemMouseDown(e, item, 'resize_line_start')} />
                                            <circle cx={item.x2} cy={item.y2} r={6} fill="blue" className="pointer-events-auto cursor-pointer"
                                                onMouseDown={(e) => handleItemMouseDown(e, item, 'resize_line_end')} />
                                        </>
                                    )}
                                </svg>
                            );
                        }
                    })}

                    {/* (3) 텍스트 입력창 */}
                    {textInput && (
                        <textarea autoFocus 
                            className="absolute z-[999] border-2 border-blue-500 bg-white/90 px-2 py-1 shadow-lg outline-none min-w-[100px] rounded resize-none overflow-hidden"
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
                                    confirmText();
                                }
                            }}
                            onBlur={confirmText}
                        />
                    )}

                    {items.length === 0 && history.length === 0 && !textInput && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
                           <FileImage className="w-16 h-16 mb-4 opacity-50"/>
                           <p className="font-bold text-lg">Add Images or Draw</p>
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