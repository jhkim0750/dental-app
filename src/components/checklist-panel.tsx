"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, ChevronLeft, ChevronRight, 
  Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Upload, Type, Palette, X, Paperclip, Eraser, PenTool, Minus, Undo, Redo, CheckSquare, CheckCircle2,
  Image as ImageIcon, MousePointer2, BringToFront, SendToBack, GripHorizontal, MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";

const Label = ({ children, className }: any) => <label className={className}>{children}</label>;

interface ChecklistPanelProps {
  patient: any;
}

// 아이템 타입 정의
type ItemType = 'image' | 'text' | 'line';

interface CanvasItem {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  zIndex: number;
  color?: string;
  size?: number; 
  src?: string;
  width?: number;
  height?: number;
  text?: string;
  x2?: number;
  y2?: number;
}

interface PenStroke {
  points: { x: number, y: number }[];
  color: string;
  size: number;
  tool: 'draw' | 'eraser';
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

  // 캔버스 Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 상태 관리
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [penStrokes, setPenStrokes] = useState<PenStroke[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<{items: CanvasItem[], strokes: PenStroke[]}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 툴 설정
  const [currentTool, setCurrentTool] = useState<"select" | "draw" | "line" | "eraser" | "text">("select");
  const [mainColor, setMainColor] = useState("#334155");
  const [toolSize, setToolSize] = useState<number>(20); 

  // 드래그 상태
  const [dragState, setDragState] = useState<{
      isDragging: boolean;
      action: "move" | "resize" | "draw_pen" | "draw_line" | null;
      resizeHandle?: string;
      startX: number;
      startY: number;
      offsetX: number; 
      offsetY: number;
      initialItem?: CanvasItem;
  }>({
      isDragging: false, action: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0
  });

  // ✨ 텍스트 입력 상태 (수정 모드 포함)
  // id가 있으면 '기존 텍스트 수정', 없으면 '새 텍스트 생성'
  const [textInput, setTextInput] = useState<{id?: number, x: number, y: number, value: string, width?: number} | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: number } | null>(null);

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // 1. 초기화 & 데이터 로드
  useEffect(() => {
    setPageStartStep(0);
    setItems([]);
    setPenStrokes([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedId(null);
    setContextMenu(null);
    
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.width = canvas.parentElement?.offsetWidth || 800;
        canvas.height = canvas.parentElement?.offsetHeight || 600;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (patient.summary) {
       if (patient.summary.memo && patient.summary.memo.startsWith('{')) {
           try {
               const savedData = JSON.parse(patient.summary.memo);
               if (savedData.items) setItems(savedData.items);
               if (savedData.penStrokes) setPenStrokes(savedData.penStrokes);
               setHistory([{ items: savedData.items || [], strokes: savedData.penStrokes || [] }]);
               setHistoryIndex(0);
               return; 
           } catch (e) { console.error("JSON Parse Error", e); }
       }

       if (patient.summary.image) {
           const img = new Image();
           img.src = patient.summary.image;
           img.onload = () => {
               const containerW = containerRef.current?.offsetWidth || 800;
               const containerH = containerRef.current?.offsetHeight || 600;
               let w = img.width;
               let h = img.height;
               if (w > containerW || h > containerH) {
                   const ratio = Math.min(containerW / w, containerH / h) * 0.9;
                   w *= ratio;
                   h *= ratio;
               }
               const initialItem: CanvasItem = {
                   id: Date.now(), type: 'image', src: patient.summary.image!,
                   x: (containerW - w) / 2, y: (containerH - h) / 2,
                   width: w, height: h, zIndex: 0
               };
               setItems([initialItem]);
               setHistory([{ items: [initialItem], strokes: [] }]);
               setHistoryIndex(0);
           }
       }
    }
  }, [patient.id]);

  // 펜 스트로크 렌더링
  useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      penStrokes.forEach(stroke => {
          if (stroke.points.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          ctx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(255,255,255,1)' : stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
          ctx.stroke();
      });
      ctx.globalCompositeOperation = 'source-over';
  }, [penStrokes]);

  // 속성 동기화
  useEffect(() => {
      if (selectedId) {
          const item = items.find(i => i.id === selectedId);
          if (item) {
              if (item.color) setMainColor(item.color);
              if (item.size) setToolSize(item.size);
          }
      }
  }, [selectedId]);

  // ✨ 텍스트 입력 중일 때 툴바 속성 변경 시 입력창에도 반영
  useEffect(() => {
      // 입력 중이 아니라면 무시
      if (!textInput) return;
      // 입력 중이라면 색상/크기 변경 시 시각적 업데이트는 렌더링에서 처리됨 (style prop)
  }, [mainColor, toolSize]);


  // ============================================================
  // 기능 함수들
  // ============================================================

  const recordHistory = (newItems: CanvasItem[], newStrokes: PenStroke[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ items: newItems, strokes: newStrokes });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          setItems(history[prevIndex].items);
          setPenStrokes(history[prevIndex].strokes);
          setHistoryIndex(prevIndex);
          setSelectedId(null); 
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setItems(history[nextIndex].items);
          setPenStrokes(history[nextIndex].strokes);
          setHistoryIndex(nextIndex);
          setSelectedId(null);
      }
  };

  const clearAll = () => {
      if(confirm("Clear all content?")) {
          setItems([]);
          setPenStrokes([]);
          recordHistory([], []);
      }
  };

  const clearPenLayer = () => {
      setPenStrokes([]);
      recordHistory(items, []);
  };

  const deleteSelectedItem = () => {
      if (selectedId) {
          const newItems = items.filter(i => i.id !== selectedId);
          setItems(newItems);
          recordHistory(newItems, penStrokes);
          setSelectedId(null);
      }
  };

  const handleDeleteFromMenu = () => {
      if (contextMenu) {
          const newItems = items.filter(i => i.id !== contextMenu.itemId);
          setItems(newItems);
          recordHistory(newItems, penStrokes);
          setContextMenu(null);
          setSelectedId(null);
      }
  };

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
      recordHistory(newItems, penStrokes);
  };

  const handlePropertyChange = (type: 'color' | 'size', value: string | number) => {
      if (type === 'color') setMainColor(value as string);
      else setToolSize(value as number);

      // 선택된 아이템이 있으면 즉시 변경
      if (selectedId) {
          const newItems = items.map(item => {
              if (item.id === selectedId) {
                  return { ...item, [type]: value };
              }
              return item;
          });
          setItems(newItems);
          if (!dragState.isDragging) recordHistory(newItems, penStrokes);
      }
  };

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
          recordHistory(newItems, penStrokes);
          setSelectedId(newItem.id);
          setCurrentTool('select');
      };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                  addImage(reader.result);
              }
          };
          reader.readAsDataURL(file);
      }
      e.target.value = "";
  };

  // ✨ 텍스트 완료 (생성 또는 수정)
  const confirmText = () => {
      // 내용이 없으면 취소 (단, 수정 중이었다면 삭제할지 말지 결정 - 여기선 삭제)
      if (!textInput) return;
      
      const trimmedText = textInput.value.trim();
      let newItems = [...items];

      if (!trimmedText) {
          // 내용 비었으면 항목 삭제 (기존 수정 중이었으면 제거)
          if (textInput.id) {
              newItems = newItems.filter(i => i.id !== textInput.id);
          }
      } else {
          if (textInput.id) {
              // ✨ 기존 텍스트 수정
              newItems = newItems.map(i => i.id === textInput.id ? { ...i, text: trimmedText, color: mainColor, size: toolSize, width: textInput.width } : i);
          } else {
              // ✨ 새 텍스트 생성
              const newItem: CanvasItem = {
                  id: Date.now(), type: 'text', text: trimmedText,
                  x: textInput.x, y: textInput.y, color: mainColor, size: toolSize, zIndex: items.length,
                  width: 200, // 기본 너비
                  height: toolSize * 1.5
              };
              newItems.push(newItem);
              setSelectedId(newItem.id);
          }
      }

      setItems(newItems);
      recordHistory(newItems, penStrokes);
      setTextInput(null);
      setCurrentTool('select'); 
  };

  // ✨ 텍스트 더블 클릭 -> 수정 모드 진입
  const handleTextDoubleClick = (item: CanvasItem) => {
      if (item.type !== 'text') return;
      
      // 해당 텍스트의 속성을 툴바에 반영
      setMainColor(item.color || "#000");
      setToolSize(item.size || 20);
      
      // 입력창 열기 (기존 내용 포함)
      setTextInput({
          id: item.id,
          x: item.x,
          y: item.y,
          value: item.text || "",
          width: item.width
      });
      
      // 현재 툴을 텍스트로 변경 (선택사항)
      setCurrentTool('text');
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const lines = text.split('\n');
      let lineCounter = 0;
      lines.forEach((line) => {
          const words = line.split(''); 
          let currentLine = '';
          for(let n = 0; n < words.length; n++) {
              const testLine = currentLine + words[n];
              const metrics = ctx.measureText(testLine);
              const testWidth = metrics.width;
              if (testWidth > maxWidth && n > 0) {
                  ctx.fillText(currentLine, x, y + (lineCounter * lineHeight));
                  currentLine = words[n];
                  lineCounter++;
              } else {
                  currentLine = testLine;
              }
          }
          ctx.fillText(currentLine, x, y + (lineCounter * lineHeight));
          lineCounter++;
      });
  };

  // --- 이벤트 핸들러 ---
  const getPos = (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (contextMenu) { setContextMenu(null); return; }
      const { x, y } = getPos(e);

      if (currentTool === 'draw' || currentTool === 'eraser') {
          const newStroke: PenStroke = {
              points: [{ x, y }],
              color: mainColor,
              size: toolSize,
              tool: currentTool === 'eraser' ? 'eraser' : 'draw'
          };
          setPenStrokes(prev => [...prev, newStroke]);
          setDragState({ isDragging: true, action: 'draw_pen', startX: x, startY: y, offsetX: 0, offsetY: 0 });
          return;
      }

      if (currentTool === 'line') {
          const tempLine: CanvasItem = {
              id: -1, type: 'line', x: x, y: y, x2: x, y2: y, color: mainColor, size: 3, zIndex: 999
          };
          setItems(p => [...p, tempLine]);
          setDragState({ isDragging: true, action: 'draw_line', startX: x, startY: y, offsetX: 0, offsetY: 0 });
          return;
      }

      if (currentTool === 'text') {
          e.preventDefault(); 
          if (textInput) confirmText();
          else setTextInput({ x, y, value: "" });
          return;
      }

      if (currentTool === 'select') {
          setSelectedId(null);
      }
  };

  const handleItemMouseDown = (e: React.MouseEvent, item: CanvasItem, action: typeof dragState.action) => {
      if (currentTool !== 'select') return;
      e.stopPropagation(); 
      if (e.button === 2) return;

      const { x, y } = getPos(e);
      setSelectedId(item.id);

      let offsetX = 0, offsetY = 0;
      if (action === 'move') {
          offsetX = x - item.x;
          offsetY = y - item.y;
      }

      setDragState({
          isDragging: true, action: action, startX: x, startY: y, offsetX, offsetY,
          initialItem: { ...item }
      });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, item: CanvasItem, handle: string) => {
      e.stopPropagation();
      const { x, y } = getPos(e);
      setDragState({
          isDragging: true, action: 'resize', resizeHandle: handle,
          startX: x, startY: y, offsetX: 0, offsetY: 0,
          initialItem: { ...item }
      });
  };

  const handleItemContextMenu = (e: React.MouseEvent, itemId: number) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      if(rect) {
          setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, itemId });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getPos(e);

      if (dragState.isDragging && dragState.action === 'draw_pen') {
          setPenStrokes(prev => {
              const last = prev[prev.length - 1];
              const updated = { ...last, points: [...last.points, { x, y }] };
              return [...prev.slice(0, -1), updated];
          });
          return;
      }

      if (dragState.isDragging && dragState.action === 'draw_line') {
          setItems(prev => prev.map(i => i.id === -1 ? { ...i, x2: x, y2: y } : i));
          return;
      }

      if (!dragState.isDragging || !selectedId) return;

      setItems(prevItems => prevItems.map(item => {
          if (item.id !== selectedId) return item;

          if (dragState.action === 'move') {
              if (item.type === 'line') {
                  const dx = x - dragState.offsetX - item.x;
                  const dy = y - dragState.offsetY - item.y;
                  return { ...item, x: item.x + dx, y: item.y + dy, x2: (item.x2 || 0) + dx, y2: (item.y2 || 0) + dy };
              }
              return { ...item, x: x - dragState.offsetX, y: y - dragState.offsetY };
          } 
          else if (dragState.action === 'resize' && dragState.initialItem) {
              const init = dragState.initialItem;
              const dx = x - dragState.startX;
              const dy = y - dragState.startY;
              let newX = init.x, newY = init.y, newW = init.width || 0, newH = init.height || 0;

              if (item.type === 'line') {
                  if (dragState.resizeHandle === 'start') return { ...item, x: x, y: y };
                  if (dragState.resizeHandle === 'end') return { ...item, x2: x, y2: y };
                  return item;
              }

              if (item.type === 'text') {
                  if (dragState.resizeHandle?.includes('e')) newW = Math.max(50, init.width! + dx);
                  if (dragState.resizeHandle?.includes('w')) { newW = Math.max(50, init.width! - dx); newX = init.x + dx; }
                  return { ...item, x: newX, width: newW };
              }

              if (dragState.resizeHandle?.includes('e')) newW = Math.max(20, init.width! + dx);
              if (dragState.resizeHandle?.includes('w')) { newW = Math.max(20, init.width! - dx); newX = init.x + dx; }
              if (dragState.resizeHandle?.includes('s')) newH = Math.max(20, init.height! + dy);
              if (dragState.resizeHandle?.includes('n')) { newH = Math.max(20, init.height! - dy); newY = init.y + dy; }

              return { ...item, x: newX, y: newY, width: newW, height: newH };
          }
          return item;
      }));
  };

  const handleMouseUp = () => {
      if (!dragState.isDragging) return;

      if (dragState.action === 'draw_pen') {
          recordHistory(items, penStrokes);
      }
      else if (dragState.action === 'draw_line') {
          const newItems = items.map(i => i.id === -1 ? { ...i, id: Date.now() } : i);
          setItems(newItems);
          recordHistory(newItems, penStrokes);
          setCurrentTool('select');
      } 
      else if (dragState.action) {
          recordHistory(items, penStrokes);
      }

      setDragState({ ...dragState, isDragging: false, action: null });
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (textInput) return;
          if (e.key === 'Delete') deleteSelectedItem();
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
      
      const handlePaste = (e: ClipboardEvent) => {
        const clipboardItems = e.clipboardData?.items;
        if (!clipboardItems) return;
        for (let i = 0; i < clipboardItems.length; i++) {
            if (clipboardItems[i].type.indexOf("image") !== -1) {
                const blob = clipboardItems[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (ev) => addImage(ev.target?.result as string);
                    reader.readAsDataURL(blob);
                }
            }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener("paste", handlePaste);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener("paste", handlePaste);
      };
  }, [selectedId, textInput, historyIndex, history]);

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => addImage(ev.target?.result as string);
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
              wrapText(ctx, item.text || '', item.x, item.y, item.width || 200, (item.size || 20) * 1.2);
          }
      }

      ctx.drawImage(canvasRef.current, 0, 0);

      const finalImage = tempCanvas.toDataURL('image/png');
      const saveData = { items, penStrokes }; 

      await store.saveSummary(patient.id, { 
          image: finalImage, 
          memo: JSON.stringify(saveData) 
      });
      alert("Saved! (Editable data preserved)");
  };

  // Rule 로직
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
      <div key={rule.id} onClick={() => store.toggleChecklistItem(patient.id, step, rule.id)} className={cn("rounded cursor-pointer flex flex-col relative border select-none", isTiny ? "p-1.5 mb-1.5" : "p-3 mb-2", checked ? "bg-slate-100 text-slate-400 grayscale" : "bg-white hover:ring-2 hover:ring-blue-200", status === "NEW" && !checked && "border-l-4 border-l-green-500", status === "REMOVE" && !checked && "border-l-4 border-l-red-500")}>
        <div className="flex justify-between items-start"><span className={cn("font-bold", isTiny ? "text-[11px]" : "text-lg")}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}</span><div className={cn("w-4 h-4 border rounded flex items-center justify-center", checked ? "bg-slate-500" : "bg-white")}>{checked && <CheckCheck className="text-white w-3 h-3"/>}</div></div>
        <div className={cn("font-bold truncate mt-0.5", getTypeColor(rule.type), isTiny && "text-[10px]")}>{rule.type}</div>
        {rule.note && <div className={cn("text-slate-400 whitespace-pre-wrap break-words leading-tight", isTiny ? "text-[9px]" : "mt-1")}>{rule.note}</div>}
      </div>
    );
  };
  const renderFullScreenGrid = () => {
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i);
    let maxGenCount = 0; let maxUpperCount = 0; let maxLowerCount = 0;
    stepsToShow.forEach(step => { if (step > totalSteps) return; const { genRules, upperRules, lowerRules } = getGroupedRules(step); maxGenCount = Math.max(maxGenCount, genRules.length); maxUpperCount = Math.max(maxUpperCount, upperRules.length); maxLowerCount = Math.max(maxLowerCount, lowerRules.length); });
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
                        
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Add Image"><ImageIcon className="w-4 h-4"/></Button>

                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <input type="color" value={mainColor} onChange={(e) => handlePropertyChange('color', e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                        <div className="flex items-center gap-1 ml-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Size</span>
                            <input type="range" min="5" max="100" value={toolSize} onChange={(e) => handlePropertyChange('size', Number(e.target.value))} className="w-20 accent-blue-600" />
                        </div>
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4"/></Button>
                        <Button variant="ghost" size="icon" onClick={handleRedo} title="Redo (Ctrl+Y)"><Redo className="w-4 h-4"/></Button>
                    </div>
                    
                    <div className="flex gap-2">
                       {selectedId && (
                           <>
                               <Button variant="ghost" size="sm" onClick={() => moveLayer('up')} title="Bring Forward"><BringToFront className="w-4 h-4"/></Button>
                               <Button variant="ghost" size="sm" onClick={() => moveLayer('down')} title="Send Backward"><SendToBack className="w-4 h-4"/></Button>
                               <div className="w-px h-4 bg-slate-300 mx-1"></div>
                               <Button variant="ghost" size="sm" onClick={deleteSelectedItem} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4"/></Button>
                           </>
                       )}
                       <div className="w-px h-4 bg-slate-300 mx-1"></div>
                       <Button variant="ghost" size="sm" onClick={clearPenLayer} className="text-slate-500">Clear Pen</Button>
                       <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-400">Clear All</Button>
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
                    {/* (1) 아이템 렌더링 */}
                    {items.map((item) => {
                        // 수정 중인 아이템은 화면에서 숨김 (입력창이 대체)
                        if (textInput && textInput.id === item.id) return null;

                        const isSelected = selectedId === item.id;
                        const commonStyle: React.CSSProperties = {
                            left: item.x, top: item.y, zIndex: items.indexOf(item) + 1,
                            pointerEvents: currentTool === 'select' ? 'auto' : 'none' 
                        };

                        const renderResizeHandles = () => {
                            if (!isSelected || currentTool !== 'select') return null;
                            const handles = [
                                { pos: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } },
                                { pos: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
                                { pos: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } },
                                { pos: 'e',  style: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' } },
                                { pos: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } },
                                { pos: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
                                { pos: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } },
                                { pos: 'w',  style: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' } },
                            ];
                            return handles.map(h => (
                                <div key={h.pos} className="absolute w-2.5 h-2.5 bg-white border border-blue-500 z-50"
                                    style={h.style}
                                    onMouseDown={(e) => handleResizeMouseDown(e, item, h.pos)}
                                />
                            ));
                        };

                        if (item.type === 'image') {
                            return (
                                <div key={item.id} className={cn("absolute", isSelected && "ring-1 ring-blue-500")}
                                    style={{ ...commonStyle, width: item.width, height: item.height }}
                                    onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                    onContextMenu={(e) => handleItemContextMenu(e, item.id)}
                                >
                                    <img src={item.src} className="w-full h-full object-fill pointer-events-none" />
                                    {renderResizeHandles()}
                                </div>
                            );
                        } 
                        
                        if (item.type === 'text') {
                            return (
                                <div key={item.id} className={cn("absolute whitespace-pre-wrap px-1 border border-transparent", isSelected && "border-blue-500")}
                                    style={{ ...commonStyle, color: item.color, fontSize: item.size, fontWeight: 'bold', width: item.width, lineHeight: '1.2' }}
                                    onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                    onContextMenu={(e) => handleItemContextMenu(e, item.id)}
                                    // ✨ 더블 클릭 시 수정 모드 진입
                                    onDoubleClick={(e) => { e.stopPropagation(); handleTextDoubleClick(item); }}
                                >
                                    {item.text}
                                    {renderResizeHandles()}
                                </div>
                            );
                        }

                        if (item.type === 'line') {
                            return (
                                <svg key={item.id} className="absolute overflow-visible" 
                                    style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: items.indexOf(item) + 1, pointerEvents: 'none' }}
                                >
                                    <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={Math.max(item.size || 3, 20)}
                                        className={cn(currentTool === 'select' ? "pointer-events-auto cursor-move" : "")}
                                        onMouseDown={(e) => handleItemMouseDown(e, item, 'move')}
                                        onContextMenu={(e) => handleItemContextMenu(e, item.id)}
                                    />
                                    <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={item.size}
                                        className={cn(currentTool === 'select' ? "pointer-events-none" : "", isSelected && "opacity-80")}
                                    />
                                    {isSelected && currentTool === 'select' && (
                                        <>
                                            <circle cx={item.x} cy={item.y} r={5} fill="white" stroke="blue" strokeWidth={2} className="pointer-events-auto cursor-pointer"
                                                onMouseDown={(e) => handleResizeMouseDown(e, item, 'start')} />
                                            <circle cx={item.x2} cy={item.y2} r={5} fill="white" stroke="blue" strokeWidth={2} className="pointer-events-auto cursor-pointer"
                                                onMouseDown={(e) => handleResizeMouseDown(e, item, 'end')} />
                                        </>
                                    )}
                                </svg>
                            );
                        }
                    })}

                    {/* (2) 펜 그리기 레이어 */}
                    <canvas 
                        ref={canvasRef} 
                        className={cn("absolute inset-0 w-full h-full touch-none z-[9999]", 
                            (currentTool === 'draw' || currentTool === 'eraser') ? "pointer-events-auto" : "pointer-events-none"
                        )} 
                    />

                    {/* (3) 텍스트 입력창 (생성 및 수정용) */}
                    {textInput && (
                        <textarea autoFocus 
                            className="absolute z-[10000] border-2 border-blue-500 bg-white/90 px-2 py-1 shadow-lg outline-none rounded resize-none overflow-hidden"
                            style={{ 
                                left: textInput.x, top: textInput.y, 
                                width: textInput.width ? textInput.width : 'auto', minWidth: '100px',
                                color: mainColor, fontSize: toolSize, fontWeight: "bold", height: "auto", lineHeight: '1.2' 
                            }}
                            value={textInput.value} 
                            onMouseDown={(e) => e.stopPropagation()} 
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

                    {/* (4) 우클릭 메뉴 */}
                    {contextMenu && (
                        <div 
                            className="absolute z-[10001] bg-white border border-slate-200 shadow-xl rounded-md py-1 min-w-[100px] animate-in fade-in zoom-in-95 duration-100"
                            style={{ left: contextMenu.x, top: contextMenu.y }}
                            onMouseDown={(e) => e.stopPropagation()} 
                        >
                            <button 
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                onClick={handleDeleteFromMenu}
                            >
                                <Trash2 className="w-4 h-4"/> Delete
                            </button>
                        </div>
                    )}

                    {items.length === 0 && penStrokes.length === 0 && !textInput && (
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