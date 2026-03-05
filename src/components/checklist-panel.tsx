"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { 
  CheckCheck, Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Type, Eraser, PenTool, Minus, Undo, Redo, CheckSquare,
  Image as ImageIcon, MousePointer2, BringToFront, SendToBack, Highlighter,
  Loader2, Square, Circle, Triangle, Palette, Copy, Clipboard, ChevronDown,
  Crop, RotateCcw, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";
import { storage } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytes } from "firebase/storage";

const Label = ({ children, className }: any) => <label className={className}>{children}</label>;

interface ChecklistPanelProps {
  patient: any;
}

type ItemType = 'image' | 'text' | 'line' | 'rect' | 'circle' | 'triangle' | 'sticker';

interface CanvasItem {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  zIndex: number;
  width?: number;
  height?: number;
  text?: string;
  x2?: number; 
  y2?: number;
  strokeColor?: string; 
  fillColor?: string;   
  strokeWidth?: number; 
  color?: string; 
  size?: number;
  src?: string;
  cropL?: number;
  cropR?: number;
  cropT?: number;
  cropB?: number;
}

interface PenStroke {
  points: { x: number, y: number }[];
  color: string;
  size: number;
  tool: 'draw' | 'eraser' | 'highlighter';
}

interface SlideData {
  id: number;
  items: CanvasItem[];
  penStrokes: PenStroke[];
}

const UPPER_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER_TEETH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

const SlideThumbnail = ({ 
  items, penStrokes, isActive, index, onClick, onDelete, onDragStart, onDrop, onDuplicate 
}: { 
  items: CanvasItem[], penStrokes: PenStroke[], isActive: boolean, index: number, 
  onClick: () => void, onDelete: (e: React.MouseEvent) => void,
  onDragStart: (idx: number) => void, onDrop: (draggedIdx: number, targetIdx: number) => void, onDuplicate: (e: React.MouseEvent) => void
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragOver, setIsDragOver] = useState(false); 

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const scale = 0.15;
    canvas.width = 150; 
    canvas.height = 110; 

    const drawThumbnail = async () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const imageCache: Record<number, HTMLImageElement> = {};
      const imageItems = items.filter(i => i.type === 'image' && i.src);
      
      if (imageItems.length > 0) {
        await Promise.all(imageItems.map(item => new Promise<void>((resolve) => {
          const img = new Image();
          img.src = item.src!;
          img.crossOrigin = "anonymous";
          img.onload = () => { imageCache[item.id] = img; resolve(); };
          img.onerror = () => resolve();
        })));
      }

      ctx.save();
      ctx.scale(scale, scale); 

      items.forEach(item => {
        ctx.lineWidth = item.strokeWidth || item.size || 2;
        ctx.strokeStyle = item.strokeColor || item.color || "#000";
        ctx.fillStyle = item.fillColor || "transparent";

        if (item.type === 'image' && item.src) {
          const img = imageCache[item.id];
          if (img) {
            const cl = item.cropL || 0, cr = item.cropR || 0;
            const ct = item.cropT || 0, cb = item.cropB || 0;
            const totalW = item.width! + cl + cr;
            const totalH = item.height! + ct + cb;
            const sx = (cl / totalW) * img.width;
            const sy = (ct / totalH) * img.height;
            const sw = (item.width! / totalW) * img.width;
            const sh = (item.height! / totalH) * img.height;

            ctx.drawImage(img, sx, sy, sw, sh, item.x, item.y, item.width!, item.height!);
          }
        } else if (item.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(item.x, item.y);
          ctx.lineTo(item.x2!, item.y2!);
          ctx.stroke();
        } else if (item.type === 'text') {
          ctx.font = `bold ${item.size || 20}px sans-serif`;
          ctx.fillStyle = item.color || "#000";
          ctx.fillText(item.text || '', item.x, item.y + (item.size || 20));
        } else if (item.type === 'sticker') {
          ctx.beginPath();
          ctx.arc(item.x + item.width! / 2, item.y + item.height! / 2, item.width! / 2, 0, Math.PI * 2);
          ctx.fillStyle = item.color?.includes('blue') ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)';
          ctx.fill();
          ctx.font = `bold ${item.size}px sans-serif`;
          ctx.fillStyle = item.color || '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.text || '', item.x + item.width! / 2, item.y + item.height! / 2);
        } else if (item.type === 'rect') {
          ctx.beginPath();
          ctx.rect(item.x, item.y, item.width!, item.height!);
          if (item.fillColor && item.fillColor !== 'transparent') ctx.fill();
          ctx.stroke();
        } else if (item.type === 'circle') {
          ctx.beginPath();
          ctx.ellipse(item.x + item.width!/2, item.y + item.height!/2, Math.abs(item.width!)/2, Math.abs(item.height!)/2, 0, 0, 2 * Math.PI);
          if (item.fillColor && item.fillColor !== 'transparent') ctx.fill();
          ctx.stroke();
        } else if (item.type === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(item.x + item.width! / 2, item.y); 
          ctx.lineTo(item.x, item.y + item.height!);   
          ctx.lineTo(item.x + item.width!, item.y + item.height!); 
          ctx.closePath();
          if (item.fillColor && item.fillColor !== 'transparent') ctx.fill();
          ctx.stroke();
        }
      });

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      penStrokes.forEach(stroke => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        if (stroke.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'multiply';
          ctx.strokeStyle = stroke.color + '40'; 
          ctx.lineWidth = stroke.size * 2;
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.size;
        }
        if (stroke.tool !== 'eraser') ctx.stroke();
      });

      ctx.restore();
    };

    drawThumbnail();

  }, [items, penStrokes]);

  return (
    <div 
      draggable 
      onDragStart={(e) => { e.dataTransfer.setData('slideIdx', index.toString()); onDragStart(index); }} 
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} 
      onDragLeave={() => setIsDragOver(false)} 
      onDrop={(e) => { 
          e.preventDefault(); 
          setIsDragOver(false); 
          onDrop(parseInt(e.dataTransfer.getData('slideIdx')), index); 
      }}
      className={cn(
          "w-full aspect-[4/3] bg-white border-2 rounded cursor-pointer relative group shadow-sm transition-all overflow-hidden", 
          isActive ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-400",
          isDragOver && "border-t-[6px] border-t-blue-500 shadow-lg scale-[1.02]" 
      )} 
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />
      <div className="absolute top-1 left-1 bg-slate-100/80 text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border border-slate-300">{index + 1}</div>
      
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-10">
          <button onClick={onDuplicate} className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm" title="Duplicate"><Copy className="w-3 h-3"/></button>
          <button onClick={onDelete} className="p-1 bg-red-500 text-white rounded hover:bg-red-600 shadow-sm" title="Delete"><Trash2 className="w-3 h-3"/></button>
      </div>
    </div>
  );
};

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

const compressImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image(); 
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas"); 
      const ctx = canvas.getContext("2d"); 
      if (!ctx) return reject("Canvas error");
      const MAX_WIDTH = 1600; 
      let width = img.width; 
      let height = img.height;
      if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      canvas.width = width; 
      canvas.height = height; 
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { if (blob) resolve(blob); else reject("Compression failed"); }, "image/jpeg", 0.7);
    }; 
    img.onerror = (e) => reject(e);
  });
};

export function ChecklistPanel({ patient }: ChecklistPanelProps) {
  const store = usePatientStoreHydrated();
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [pageStartStep, setPageStartStep] = useState(0);
  const [isImageUploading, setIsImageUploading] = useState(false);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ruleFormRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [redrawTrigger, setRedrawTrigger] = useState(0);

  const [slides, setSlides] = useState<SlideData[]>([{ id: 1, items: [], penStrokes: [] }]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const currentSlide = slides[currentSlideIndex] || { items: [], penStrokes: [] };
  const items = currentSlide.items || [];
  const penStrokes = currentSlide.penStrokes || [];

  const [selectedIds, setSelectedIds] = useState<number[]>([]); 
  const [clipboard, setClipboard] = useState<CanvasItem[]>([]);
  const [pasteOffset, setPasteOffset] = useState(20);
   
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const [history, setHistory] = useState<SlideData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [currentTool, setCurrentTool] = useState<"select" | "draw" | "line" | "eraser" | "text" | "highlighter" | "rect" | "circle" | "triangle" | "sticker">("select");
  const [activeSticker, setActiveSticker] = useState<{num: string, color: string} | null>(null);
  
  const [cropModeId, setCropModeId] = useState<number | null>(null); 
   
  const [styleSettings, setStyleSettings] = useState({
      strokeColor: "#000000",
      fillColor: "transparent",
      strokeWidth: 3,
      fontSize: 20
  });

  const [toolConfigs, setToolConfigs] = useState<any>({
      draw: { strokeColor: "#000000", strokeWidth: 3 },
      line: { strokeColor: "#000000", strokeWidth: 3 },
      rect: { strokeColor: "#000000", strokeWidth: 3, fillColor: "transparent" },
      circle: { strokeColor: "#000000", strokeWidth: 3, fillColor: "transparent" },
      triangle: { strokeColor: "#000000", strokeWidth: 3, fillColor: "transparent" },
      text: { strokeColor: "#000000", fontSize: 20 },
      highlighter: { strokeColor: "#ffff00", strokeWidth: 15 }, 
      eraser: { strokeWidth: 20 }
  });

  const [dragState, setDragState] = useState<{ 
      isDragging: boolean; 
      action: "move" | "resize" | "draw_pen" | "draw_line" | "draw_shape" | "box_select" | "crop" | null; 
      resizeHandle?: string; 
      startX: number; 
      startY: number; 
      offsetX: number; 
      offsetY: number; 
      initialItem?: CanvasItem;
      initialItemsMap?: Record<number, { x: number, y: number, x2?: number, y2?: number }>;
      lockedAxis?: 'x' | 'y' | null;
      isCloning?: boolean;
      hasMoved?: boolean;
  }>({ isDragging: false, action: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const [textInput, setTextInput] = useState<{id?: number, x: number, y: number, value: string, width?: number} | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: number } | null>(null);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);

  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [isQuickEdit, setIsQuickEdit] = useState(false);
  const [editBuffer, setEditBuffer] = useState<Record<string, {note: string}>>({});

  const totalSteps = patient.total_steps || 21;

  useEffect(() => { 
    setPageStartStep(0); 
    const canvas = canvasRef.current; 
    if (canvas) { 
        canvas.width = canvas.parentElement?.offsetWidth || 800; 
        canvas.height = canvas.parentElement?.offsetHeight || 600; 
    } 
    if (patient.summary && patient.summary.memo && patient.summary.memo.startsWith('{')) { 
        try { 
            const savedData = JSON.parse(patient.summary.memo); 
            if (savedData.slides) { 
                setSlides(savedData.slides); 
                setHistory([savedData.slides]); 
                setHistoryIndex(0); 
            } 
        } catch (e) { 
            console.error("JSON Error", e); 
        } 
    } 
  }, [patient.id]);
   
  useEffect(() => {
    const handleResize = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (canvas && container) {
            canvas.width = container.offsetWidth;
            canvas.height = container.offsetHeight;
            setRedrawTrigger(prev => prev + 1);
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    setTimeout(handleResize, 100);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { 
      const canvas = canvasRef.current; 
      const ctx = canvas?.getContext("2d"); 
      if (!canvas || !ctx) return; 
      ctx.clearRect(0, 0, canvas.width, canvas.height); 
      ctx.lineCap = 'round'; 
      ctx.lineJoin = 'round'; 
      penStrokes.forEach(stroke => { 
          if (stroke.points.length < 2) return; 
          ctx.beginPath(); 
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y); 
          for (let i = 1; i < stroke.points.length; i++) {
              ctx.lineTo(stroke.points[i].x, stroke.points[i].y); 
          }
          if (stroke.tool === 'eraser') { 
              ctx.globalCompositeOperation = 'destination-out'; 
              ctx.lineWidth = stroke.size; 
              ctx.strokeStyle = 'rgba(0,0,0,1)'; 
          } 
          else if (stroke.tool === 'highlighter') { 
              ctx.globalCompositeOperation = 'multiply'; 
              ctx.strokeStyle = stroke.color + '40'; 
              ctx.lineWidth = stroke.size * 2; 
          } 
          else { 
              ctx.globalCompositeOperation = 'source-over'; 
              ctx.strokeStyle = stroke.color; 
              ctx.lineWidth = stroke.size; 
          } 
          ctx.stroke(); 
      }); 
      ctx.globalCompositeOperation = 'source-over'; 
  }, [penStrokes, currentSlideIndex, items, redrawTrigger]); 

  useEffect(() => { 
      const handleKeyDown = (e: KeyboardEvent) => { 
          const activeEl = document.activeElement;
          const isInputActive = activeEl instanceof HTMLElement && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
          if (isInputActive) return;

          if (textInput) return; 
           
          if (e.key === 'Delete') deleteSelectedItems(); 
           
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); handleCopy(); }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); handleDuplicate(); }

          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1; 
              let dx = 0, dy = 0;
              if (e.key === 'ArrowUp') dy = -step;
              if (e.key === 'ArrowDown') dy = step;
              if (e.key === 'ArrowLeft') dx = -step;
              if (e.key === 'ArrowRight') dx = step;
              moveSelectedItems(dx, dy);
          }

          if ((e.ctrlKey || e.metaKey)) { 
              if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) handleRedo(); else handleUndo(); } 
              else if (e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); } 
          } 
      }; 

      const handlePasteEvent = (e: ClipboardEvent) => { 
          const clipboardItems = e.clipboardData?.items; 
          let hasImage = false;
          if (clipboardItems) {
              for (let i = 0; i < clipboardItems.length; i++) { 
                  if (clipboardItems[i].type.indexOf("image") !== -1) { 
                      hasImage = true;
                      const blob = clipboardItems[i].getAsFile(); 
                      if (blob) uploadImageToFirebase(blob); 
                      e.preventDefault(); 
                      break;
                  } 
              } 
          }
          if (!hasImage && clipboard.length > 0) {
              e.preventDefault();
              handlePaste();
          }
      }; 

      window.addEventListener('keydown', handleKeyDown); 
      window.addEventListener('paste', handlePasteEvent); 
      return () => { 
          window.removeEventListener('keydown', handleKeyDown); 
          window.removeEventListener('paste', handlePasteEvent); 
      }; 
  }, [selectedIds, textInput, historyIndex, history, currentSlideIndex, patient.id, clipboard, pasteOffset, items]);

  const changeTool = (tool: typeof currentTool) => { 
      setCurrentTool(tool); 
      setActiveSticker(null); 
      setCropModeId(null); 
      if (tool === 'select') setSelectedIds([]); 
       
      const config = toolConfigs[tool];
      if (config) {
          setStyleSettings(prev => ({
              ...prev,
              strokeColor: config.strokeColor || prev.strokeColor,
              strokeWidth: config.strokeWidth || prev.strokeWidth,
              fillColor: config.fillColor || prev.fillColor,
              fontSize: config.fontSize || prev.fontSize
          }));
      }
  };
   
  const handleStyleChange = (key: keyof typeof styleSettings, value: string | number) => {
      setStyleSettings(prev => ({ ...prev, [key]: value }));
       
      if (currentTool === 'text' && key === 'strokeWidth') {
          setStyleSettings(prev => ({ ...prev, fontSize: value as number }));
      }

      if (currentTool !== 'select' && currentTool !== 'sticker') {
          setToolConfigs((prev: any) => ({
              ...prev,
              [currentTool]: {
                  ...prev[currentTool],
                  [key]: value,
                  ...(currentTool === 'text' && key === 'strokeWidth' ? { fontSize: value } : {})
              }
          }));
      }

      if (currentTool === 'select' && selectedIds.length > 0) {
          const newItems = items.map(item => {
              if (!selectedIds.includes(item.id)) return item; 
              const updates: any = { [key]: value };
              if (key === 'strokeColor') updates.color = value;
              if (key === 'strokeWidth') updates.size = value;
              if (key === 'strokeWidth' && item.type === 'text') updates.size = value;
              if (key === 'fontSize') updates.size = value;
              return { ...item, ...updates };
          });
          updateCurrentSlide(newItems, penStrokes);
      }
  };

  const updateCurrentSlide = (newItems: CanvasItem[], newStrokes: PenStroke[]) => { 
      setSlides(prev => {
          const newSlides = [...prev];
          newSlides[currentSlideIndex] = {
              ...newSlides[currentSlideIndex],
              items: newItems,
              penStrokes: newStrokes
          };
          return newSlides;
      });
      return newItems;
  };

  const recordHistory = (newSlides?: SlideData[]) => { const stateToSave = newSlides || slides; const newHistory = history.slice(0, historyIndex + 1); newHistory.push(JSON.parse(JSON.stringify(stateToSave))); setHistory(newHistory); setHistoryIndex(newHistory.length - 1); };
  const handleUndo = () => { if (historyIndex > 0) { const prevIndex = historyIndex - 1; setSlides(history[prevIndex]); setHistoryIndex(prevIndex); setSelectedIds([]); } };
  const handleRedo = () => { if (historyIndex < history.length - 1) { const nextIndex = historyIndex + 1; setSlides(history[nextIndex]); setHistoryIndex(nextIndex); setSelectedIds([]); } };
  
  const addSlide = () => { const newSlides = [...slides, { id: Date.now(), items: [], penStrokes: [] }]; setSlides(newSlides); setCurrentSlideIndex(newSlides.length - 1); recordHistory(newSlides); };
  const duplicateSlide = (e: React.MouseEvent, index: number) => { 
      e.stopPropagation(); 
      const cloned = JSON.parse(JSON.stringify(slides[index])); 
      cloned.id = Date.now(); 
      const newSlides = [...slides]; 
      newSlides.splice(index+1, 0, cloned); 
      setSlides(newSlides); 
      setCurrentSlideIndex(index+1); 
      recordHistory(newSlides); 
  };
  const deleteSlide = (index: number) => { if (slides.length <= 1) return; if (confirm("Delete this slide?")) { const newSlides = slides.filter((_, i) => i !== index); setSlides(newSlides); setCurrentSlideIndex(prev => Math.min(prev, newSlides.length - 1)); recordHistory(newSlides); } };
  const handleSlideDrop = (draggedIdx: number, targetIdx: number) => { 
      if (draggedIdx === targetIdx) return; 
      const newSlides = [...slides]; 
      const [removed] = newSlides.splice(draggedIdx, 1); 
      newSlides.splice(targetIdx, 0, removed); 
      setSlides(newSlides); 
      setCurrentSlideIndex(targetIdx); 
      recordHistory(newSlides); 
  };

  const clearAll = () => { if(confirm("Clear current slide?")) { updateCurrentSlide([], []); recordHistory(); } };
  const clearPenLayer = () => { updateCurrentSlide(items, []); recordHistory(); };
  const deleteSelectedItems = () => { if (selectedIds.length > 0) { const newItems = items.filter(i => !selectedIds.includes(i.id)); updateCurrentSlide(newItems, penStrokes); recordHistory(); setSelectedIds([]); setCropModeId(null); } };
  const handleDeleteFromMenu = () => { if (contextMenu) { const newItems = items.filter(i => i.id !== contextMenu.itemId); updateCurrentSlide(newItems, penStrokes); recordHistory(); setContextMenu(null); setSelectedIds([]); } };
  const moveLayer = (direction: 'up' | 'down') => { if (selectedIds.length === 0) return; const lastSelectedId = selectedIds[selectedIds.length - 1]; const idx = items.findIndex(i => i.id === lastSelectedId); if (idx === -1) return; const newItems = [...items]; if (direction === 'up' && idx < items.length - 1) { [newItems[idx], newItems[idx+1]] = [newItems[idx+1], newItems[idx]]; } else if (direction === 'down' && idx > 0) { [newItems[idx], newItems[idx-1]] = [newItems[idx-1], newItems[idx]]; } updateCurrentSlide(newItems, penStrokes); recordHistory(); };

  const addImage = (src: string) => { const img = new Image(); img.src = src; img.crossOrigin = "anonymous"; img.onload = () => { let w = img.width; let h = img.height; if (w > 400) { const r = 400/w; w = 400; h = h*r; } const newItem: CanvasItem = { id: Date.now(), type: 'image', src, x: 50, y: 50, width: w, height: h, zIndex: items.length }; const newItems = [...items, newItem]; updateCurrentSlide(newItems, penStrokes); recordHistory(); setSelectedIds([newItem.id]); setCurrentTool('select'); }; };
  const uploadImageToFirebase = async (file: File) => { setIsImageUploading(true); try { const compressedBlob = await compressImage(file); const storageRef = ref(storage, `patients/${patient.id}/images/${Date.now()}_${file.name}`); await uploadBytes(storageRef, compressedBlob); const url = await getDownloadURL(storageRef); addImage(url); } catch (error) { console.error("Image upload error:", error); alert("이미지 업로드 실패 (CORS 설정을 확인하세요)"); } finally { setIsImageUploading(false); } };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) uploadImageToFirebase(file); e.target.value = ""; };
  
  const handleDrop = (e: React.DragEvent) => { 
      e.preventDefault(); 
      const file = e.dataTransfer.files?.[0]; 
      if (file && file.type.startsWith('image/')) {
          uploadImageToFirebase(file); 
          return;
      }
      
      const stickerNum = e.dataTransfer.getData('sticker');
      if (stickerNum) {
          const { x, y } = getPos(e as any);
          const color = parseInt(stickerNum) < 30 ? '#2563eb' : '#dc2626'; 
          const newItems = [...items, { id: Date.now(), type: 'sticker' as ItemType, text: stickerNum, x: x-15, y: y-15, width: 30, height: 30, color: color, size: 14, zIndex: items.length }];
          updateCurrentSlide(newItems, penStrokes); 
          recordHistory(); 
          setCurrentTool('select'); 
          setSelectedIds([newItems[newItems.length-1].id]);
      }
  };
   
  const confirmText = () => { if (!textInput) return; const trimmedText = textInput.value.trim(); let newItems = [...items]; if (!trimmedText) { if (textInput.id) newItems = newItems.filter(i => i.id !== textInput.id); } else { if (textInput.id) { newItems = newItems.map(i => i.id === textInput.id ? { ...i, text: trimmedText, color: styleSettings.strokeColor, size: styleSettings.fontSize, width: textInput.width } : i); } else { newItems.push({ id: Date.now(), type: 'text', text: trimmedText, x: textInput.x, y: textInput.y, color: styleSettings.strokeColor, size: styleSettings.fontSize, zIndex: items.length, width: 200, height: styleSettings.fontSize * 1.5 }); setSelectedIds([newItems[newItems.length-1].id]); } } updateCurrentSlide(newItems, penStrokes); recordHistory(); setTextInput(null); setCurrentTool('select'); };
  const handleTextDoubleClick = (item: CanvasItem) => { if (item.type !== 'text') return; setStyleSettings(prev => ({ ...prev, strokeColor: item.color || "#000", fontSize: item.size || 20 })); setTextInput({ id: item.id, x: item.x, y: item.y, value: item.text || "", width: item.width }); setCurrentTool('text'); };
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => { const lines = text.split('\n'); let lineCounter = 0; lines.forEach((line) => { const words = line.split(''); let currentLine = ''; for(let n = 0; n < words.length; n++) { const testLine = currentLine + words[n]; const metrics = ctx.measureText(testLine); if (metrics.width > maxWidth && n > 0) { ctx.fillText(currentLine, x, y + (lineCounter * lineHeight)); currentLine = words[n]; lineCounter++; } else { currentLine = testLine; } } ctx.fillText(currentLine, x, y + (lineCounter * lineHeight)); lineCounter++; }); };
  const getPos = (e: React.MouseEvent | React.DragEvent) => { 
      const rect = containerRef.current?.getBoundingClientRect(); 
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
  };
   
  const handleCopy = () => { 
      const selectedItems = items.filter(i => selectedIds.includes(i.id)); 
      if (selectedItems.length > 0) {
          setClipboard(JSON.parse(JSON.stringify(selectedItems)));
          setPasteOffset(20);
          if (navigator.clipboard) { navigator.clipboard.writeText(""); }
      }
  };

  const handlePaste = () => { if (clipboard.length === 0) return; const newItems = [...items]; const newSelectedIds: number[] = []; const deepCopiedClipboard = JSON.parse(JSON.stringify(clipboard)); deepCopiedClipboard.forEach((clipItem: CanvasItem, index: number) => { const offset = pasteOffset; const newItem = { ...clipItem, id: Date.now() + index, x: clipItem.x + offset, y: clipItem.y + offset }; if (newItem.type === 'line') { newItem.x2 = (clipItem.x2 || 0) + offset; newItem.y2 = (clipItem.y2 || 0) + offset; } newItems.push(newItem); newSelectedIds.push(newItem.id); }); updateCurrentSlide(newItems, penStrokes); setSelectedIds(newSelectedIds); setPasteOffset(prev => prev + 20); recordHistory(); };
  const handleDuplicate = () => { const selectedItems = items.filter(i => selectedIds.includes(i.id)); if (selectedItems.length === 0) return; const newItems = [...items]; const newSelectedIds: number[] = []; const deepClones = JSON.parse(JSON.stringify(selectedItems)); deepClones.forEach((item: CanvasItem, index: number) => { const newItem = { ...item, id: Date.now() + index, x: item.x + 20, y: item.y + 20 }; if (newItem.type === 'line') { newItem.x2 = (item.x2 || 0) + 20; newItem.y2 = (item.y2 || 0) + 20; } newItems.push(newItem); newSelectedIds.push(newItem.id); }); updateCurrentSlide(newItems, penStrokes); setSelectedIds(newSelectedIds); recordHistory(); };
  const moveSelectedItems = (dx: number, dy: number) => { if (selectedIds.length === 0) return; const newItems = items.map(item => { if (selectedIds.includes(item.id)) { if (item.type === 'line') return { ...item, x: item.x + dx, y: item.y + dy, x2: (item.x2 || 0) + dx, y2: (item.y2 || 0) + dy }; return { ...item, x: item.x + dx, y: item.y + dy }; } return item; }); updateCurrentSlide(newItems, penStrokes); };

  const handleMouseDown = (e: React.MouseEvent) => { 
      if (!textInput && e.target === containerRef.current) e.preventDefault();
      if (contextMenu) { setContextMenu(null); return; } 
      
      if (e.target === containerRef.current || e.target === canvasRef.current) {
          setCropModeId(null);
      }

      const { x, y } = getPos(e); 
       
      if (['draw', 'eraser', 'highlighter'].includes(currentTool)) { 
          const newStroke: PenStroke = { points: [{ x, y }], color: styleSettings.strokeColor, size: styleSettings.strokeWidth, tool: currentTool as any }; 
          setSlides(prev => { const newSlides = [...prev]; const current = { ...newSlides[currentSlideIndex] }; current.penStrokes = [...current.penStrokes, newStroke]; newSlides[currentSlideIndex] = current; return newSlides; }); 
          setDragState({ isDragging: true, action: 'draw_pen', startX: x, startY: y, offsetX: 0, offsetY: 0 }); 
          return; 
      } 
      if (currentTool === 'line') { 
          const tempLine: CanvasItem = { id: -1, type: 'line', x: x, y: y, x2: x, y2: y, strokeColor: styleSettings.strokeColor, color: styleSettings.strokeColor, strokeWidth: styleSettings.strokeWidth, size: styleSettings.strokeWidth, zIndex: 999 }; 
          setSlides(prev => { const newSlides = [...prev]; const current = { ...newSlides[currentSlideIndex] }; current.items = [...current.items, tempLine]; newSlides[currentSlideIndex] = current; return newSlides; }); 
          setDragState({ isDragging: true, action: 'draw_line', startX: x, startY: y, offsetX: 0, offsetY: 0 }); 
          return; 
      } 
      if (['rect', 'circle', 'triangle'].includes(currentTool)) {
          const tempShape: CanvasItem = { id: -1, type: currentTool as ItemType, x: x, y: y, width: 0, height: 0, strokeColor: styleSettings.strokeColor, fillColor: styleSettings.fillColor, strokeWidth: styleSettings.strokeWidth, zIndex: 999 };
          setSlides(prev => { const newSlides = [...prev]; const current = { ...newSlides[currentSlideIndex] }; current.items = [...current.items, tempShape]; newSlides[currentSlideIndex] = current; return newSlides; });
          setDragState({ isDragging: true, action: 'draw_shape', startX: x, startY: y, offsetX: 0, offsetY: 0 }); 
          return;
      }
      if (currentTool === 'text') { 
          e.preventDefault(); 
          if (textInput) confirmText(); 
          else setTextInput({ x, y, value: "" }); 
          return; 
      } 
      
      if (currentTool === 'sticker' && activeSticker) {
          const newItems = [...items, { 
              id: Date.now(), type: 'sticker' as ItemType, text: activeSticker.num, 
              x: x-15, y: y-15, width: 30, height: 30, color: activeSticker.color, size: 14, zIndex: items.length 
          }];
          updateCurrentSlide(newItems, penStrokes); 
          recordHistory(); 
          setCurrentTool('select'); 
          setSelectedIds([newItems[newItems.length-1].id]); 
          return;
      }
       
      if (currentTool === 'select') {
          if (!e.ctrlKey && !e.shiftKey) setSelectedIds([]); 
          setSelectionBox({ x, y, w: 0, h: 0 }); 
          setDragState({ isDragging: true, action: 'box_select', startX: x, startY: y, offsetX: 0, offsetY: 0 });
      }
  };

  const handleItemMouseDown = (e: React.MouseEvent, item: CanvasItem, action: typeof dragState.action) => { 
      if (currentTool !== 'select') return; 
      e.stopPropagation(); 
      if (e.button === 2) return; 
      
      if (e.ctrlKey && item.type === 'text' && item.text?.includes('http')) {
          const urlMatch = item.text.match(/https?:\/\/[^\s]+/);
          if (urlMatch) { window.open(urlMatch[0], '_blank'); return; }
      }

      const { x, y } = getPos(e); 
       
      let newSelectedIds = [...selectedIds];
      const isAlreadySelected = newSelectedIds.includes(item.id);

      let isCloning = false;
      if (e.ctrlKey) {
          if (isAlreadySelected) {
              isCloning = true;
          } else {
              newSelectedIds.push(item.id);
          }
      } else if (e.shiftKey) {
          if (!isAlreadySelected) newSelectedIds.push(item.id);
      } else {
          if (!isAlreadySelected) newSelectedIds = [item.id];
      }
      setSelectedIds(newSelectedIds);
      
      if (item.id !== cropModeId) setCropModeId(null);
       
      const initialItemsMap: Record<number, { x: number, y: number, x2?: number, y2?: number }> = {};
      newSelectedIds.forEach(id => {
          const it = items.find(i => i.id === id);
          if (it) initialItemsMap[id] = { x: it.x, y: it.y, x2: it.x2, y2: it.y2 };
      });

      setStyleSettings(prev => ({
          ...prev,
          strokeColor: item.strokeColor || item.color || "#000",
          fillColor: item.fillColor || "transparent",
          strokeWidth: item.strokeWidth || item.size || 3,
          fontSize: item.size || 20
      }));

      let offsetX = x - item.x; 
      let offsetY = y - item.y; 
       
      setDragState({ 
          isDragging: true, action, startX: x, startY: y, offsetX, offsetY, 
          initialItem: { ...item }, initialItemsMap, lockedAxis: null, 
          isCloning,
          hasMoved: false
      }); 
  };

  const handleResizeMouseDown = (e: React.MouseEvent, item: CanvasItem, handle: string) => { 
      e.stopPropagation(); 
      const { x, y } = getPos(e); 
      const actionType = handle.startsWith('crop') ? 'crop' : 'resize';
      setDragState({ isDragging: true, action: actionType, resizeHandle: handle, startX: x, startY: y, offsetX: 0, offsetY: 0, initialItem: { ...item } }); 
  };
  
  const handleItemContextMenu = (e: React.MouseEvent, itemId: number) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      const rect = containerRef.current?.getBoundingClientRect(); 
      if(rect) {
          setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, itemId }); 
          setSelectedIds([itemId]); 
      }
  };
   
  const handleMouseMove = (e: React.MouseEvent) => { 
      const { x, y } = getPos(e); 
      
      if (currentTool === 'select' && e.ctrlKey && containerRef.current) {
          let hoveringLink = false;
          containerRef.current.style.cursor = 'default';
          items.forEach(item => {
              if (item.type === 'text' && item.text?.includes('http')) {
                  if (x > item.x && x < item.x + (item.width||0) && y > item.y && y < item.y + (item.size||20)*1.5) {
                      hoveringLink = true;
                  }
              }
          });
          if (hoveringLink) containerRef.current.style.cursor = 'pointer';
      }

      if (dragState.isDragging && !dragState.hasMoved) {
          const totalDx = Math.abs(x - dragState.startX);
          const totalDy = Math.abs(y - dragState.startY);
          if (totalDx > 5 || totalDy > 5) {
              setDragState(prev => ({ ...prev, hasMoved: true }));
          }
      }

      if (dragState.isDragging && dragState.action === 'draw_pen') { 
          setSlides(prev => { 
              const clone = [...prev]; const current = { ...clone[currentSlideIndex] }; 
              const strokes = [...current.penStrokes]; 
              const lastStroke = { ...strokes[strokes.length - 1] }; 
              lastStroke.points = [...lastStroke.points, { x, y }]; 
              strokes[strokes.length - 1] = lastStroke; 
              current.penStrokes = strokes; 
              clone[currentSlideIndex] = current; 
              return clone; 
          }); 
          return; 
      } 
      if (dragState.isDragging && dragState.action === 'draw_line') { 
          setSlides(prev => { 
              const clone = [...prev]; const current = { ...clone[currentSlideIndex] }; 
              current.items = current.items.map(i => { 
                  if (i.id !== -1) return i; 
                  let newX2 = x; let newY2 = y; 
                  if (e.shiftKey) { 
                      const dx = Math.abs(x - i.x); const dy = Math.abs(y - i.y); 
                      if (dx > dy) newY2 = i.y; else newX2 = i.x; 
                  } 
                  return { ...i, x2: newX2, y2: newY2 }; 
              }); 
              clone[currentSlideIndex] = current; 
              return clone; 
          }); 
          return; 
      } 
       
      if (dragState.isDragging && dragState.action === 'draw_shape') {
          setSlides(prev => { 
              const clone = [...prev]; const current = { ...clone[currentSlideIndex] }; 
              current.items = current.items.map(i => { 
                  if (i.id !== -1) return i; 
                   
                  let startX = dragState.startX;
                  let startY = dragState.startY;
                  let currentX = x;
                  let currentY = y;

                  let newX = Math.min(startX, currentX);
                  let newY = Math.min(startY, currentY);
                  let newW = Math.abs(currentX - startX);
                  let newH = Math.abs(currentY - startY);

                  if (e.shiftKey) { 
                      const max = Math.max(newW, newH); 
                      newW = max; newH = max;
                      if (currentX < startX) newX = startX - max;
                      if (currentY < startY) newY = startY - max;
                  } 
                  return { ...i, x: newX, y: newY, width: newW, height: newH }; 
              }); 
              clone[currentSlideIndex] = current; return clone; 
          }); 
          return;
      }

      if (dragState.isDragging && dragState.action === 'box_select') {
          const w = x - dragState.startX;
          const h = y - dragState.startY;
          setSelectionBox({ x: w > 0 ? dragState.startX : x, y: h > 0 ? dragState.startY : y, w: Math.abs(w), h: Math.abs(h) });
          const boxLeft = Math.min(dragState.startX, x); const boxRight = Math.max(dragState.startX, x);
          const boxTop = Math.min(dragState.startY, y); const boxBottom = Math.max(dragState.startY, y);

          const insideIds = items.filter(i => {
              const minIX = i.type === 'line' ? Math.min(i.x, i.x2!) : i.x;
              const maxIX = i.type === 'line' ? Math.max(i.x, i.x2!) : i.x + (i.width || 0);
              const minIY = i.type === 'line' ? Math.min(i.y, i.y2!) : i.y;
              const maxIY = i.type === 'line' ? Math.max(i.y, i.y2!) : i.y + (i.height || 0);
              return minIX < boxRight && maxIX > boxLeft && minIY < boxBottom && maxIY > boxTop;
          }).map(i => i.id);
          setSelectedIds(insideIds);
          return;
      }

      if (!dragState.isDragging || selectedIds.length === 0) return; 
       
      let currentLockedAxis = dragState.lockedAxis;
      if (dragState.isDragging && dragState.action === 'move' && e.shiftKey && !currentLockedAxis) {
          const dx = Math.abs(x - dragState.startX); const dy = Math.abs(y - dragState.startY);
          if (dx > 5 || dy > 5) { currentLockedAxis = dx > dy ? 'x' : 'y'; setDragState(prev => ({ ...prev, lockedAxis: currentLockedAxis })); }
      }

      if (dragState.isDragging && dragState.action === 'move' && dragState.isCloning) {
          if (Math.abs(x - dragState.startX) > 5 || Math.abs(y - dragState.startY) > 5) {
              const newItems = [...items]; const newSelectedIds: number[] = []; const newInitialMap: any = {};
              items.filter(i => selectedIds.includes(i.id)).forEach((it, idx) => {
                  const newItem = { ...it, id: Date.now() + idx }; newItems.push(newItem); newSelectedIds.push(newItem.id);
                  newInitialMap[newItem.id] = { x: it.x, y: it.y, x2: it.x2, y2: it.y2 };
              });
              updateCurrentSlide(newItems, penStrokes); setSelectedIds(newSelectedIds);
              setDragState(p => ({ ...p, isCloning: false, hasMoved: true, initialItemsMap: newInitialMap }));
              return;
          }
      }

      setSlides(prev => { 
          const clone = [...prev]; const current = { ...clone[currentSlideIndex] };
          current.items = current.items.map(item => { 
              if (selectedIds.includes(item.id)) {
                  if (dragState.action === 'move') { 
                      const dx = x - dragState.startX; const dy = y - dragState.startY;
                      const initialPos = dragState.initialItemsMap?.[item.id];
                      if (!initialPos) return item;
                      let nx = initialPos.x + dx; let ny = initialPos.y + dy;
                      if (e.shiftKey && currentLockedAxis) { if (currentLockedAxis === 'x') ny = initialPos.y; else nx = initialPos.x; }
                      if (item.type === 'line') {
                          let nx2 = (initialPos.x2 || 0) + dx; let ny2 = (initialPos.y2 || 0) + dy;
                          if (e.shiftKey && currentLockedAxis) { if (currentLockedAxis === 'x') ny2 = initialPos.y2!; else nx2 = initialPos.x2!; }
                          return { ...item, x: nx, y: ny, x2: nx2, y2: ny2 };
                      }
                      return { ...item, x: nx, y: ny }; 
                  } else if (dragState.action === 'crop' && dragState.initialItem && item.id === dragState.initialItem.id) {
                      const init = dragState.initialItem; 
                      const dx = x - dragState.startX; const dy = y - dragState.startY; 
                      let nX = init.x, nY = init.y, nW = init.width!, nH = init.height!;
                      let nCL = init.cropL || 0, nCR = init.cropR || 0, nCT = init.cropT || 0, nCB = init.cropB || 0;

                      if (dragState.resizeHandle === 'crop-l') {
                          const maxDx = init.width! - 10; 
                          const limitedDx = Math.min(dx, maxDx);
                          nX = init.x + limitedDx;
                          nW = init.width! - limitedDx;
                          nCL = (init.cropL || 0) + limitedDx;
                      } else if (dragState.resizeHandle === 'crop-r') {
                          const minDx = -(init.width! - 10);
                          const limitedDx = Math.max(dx, minDx);
                          nW = init.width! + limitedDx;
                          nCR = (init.cropR || 0) - limitedDx;
                      } else if (dragState.resizeHandle === 'crop-t') {
                          const maxDy = init.height! - 10;
                          const limitedDy = Math.min(dy, maxDy);
                          nY = init.y + limitedDy;
                          nH = init.height! - limitedDy;
                          nCT = (init.cropT || 0) + limitedDy;
                      } else if (dragState.resizeHandle === 'crop-b') {
                          const minDy = -(init.height! - 10);
                          const limitedDy = Math.max(dy, minDy);
                          nH = init.height! + limitedDy;
                          nCB = (init.cropB || 0) - limitedDy;
                      }
                      return { ...item, x: nX, y: nY, width: nW, height: nH, cropL: nCL, cropR: nCR, cropT: nCT, cropB: nCB };

                  } else if (dragState.action === 'resize' && dragState.initialItem && item.id === dragState.initialItem.id) { 
                      const init = dragState.initialItem; const dx = x - dragState.startX; const dy = y - dragState.startY; 
                      let newX = init.x, newY = init.y, newW = init.width || 0, newH = init.height || 0; 
                      const aspectRatio = (init.width || 1) / (init.height || 1);
                      if (item.type === 'line') { if (dragState.resizeHandle === 'start') return { ...item, x: x, y: y }; if (dragState.resizeHandle === 'end') return { ...item, x2: x, y2: y }; return item; } 
                      if (item.type === 'text') { if (dragState.resizeHandle?.includes('e')) newW = Math.max(50, init.width! + dx); if (dragState.resizeHandle?.includes('w')) { newW = Math.max(50, init.width! - dx); newX = init.x + dx; } return { ...item, x: newX, width: newW }; } 
                      
                      if (dragState.resizeHandle?.includes('e')) newW = init.width! + dx; if (dragState.resizeHandle?.includes('w')) { newW = init.width! - dx; newX = init.x + dx; } 
                      if (dragState.resizeHandle?.includes('s')) newH = init.height! + dy; if (dragState.resizeHandle?.includes('n')) { newH = init.height! - dy; newY = init.y + dy; } 
                      if (e.shiftKey && !item.type.includes('text')) {
                          if (dragState.resizeHandle?.includes('e') || dragState.resizeHandle?.includes('w')) { newH = newW / aspectRatio; if (dragState.resizeHandle?.includes('n')) newY = init.y + init.height! - newH; } 
                          else if (dragState.resizeHandle?.includes('n') || dragState.resizeHandle?.includes('s')) { newW = newH * aspectRatio; if (dragState.resizeHandle?.includes('w')) newX = init.x + init.width! - newW; }
                          else { newH = newW / aspectRatio; if (dragState.resizeHandle?.includes('n')) newY = init.y + init.height! - newH; }
                      }
                      
                      if (item.type === 'image') {
                          if (newW < 10) newW = 10; if (newH < 10) newH = 10;
                          const scaleX = newW / init.width!;
                          const scaleY = newH / init.height!;
                          return { ...item, x: newX, y: newY, width: newW, height: newH, 
                              cropL: (init.cropL || 0) * scaleX, cropR: (init.cropR || 0) * scaleX, 
                              cropT: (init.cropT || 0) * scaleY, cropB: (init.cropB || 0) * scaleY 
                          };
                      }

                      if (Math.abs(newW) < 10) newW = 10 * (newW < 0 ? -1 : 1); if (Math.abs(newH) < 10) newH = 10 * (newH < 0 ? -1 : 1);
                      return { ...item, x: newX, y: newY, width: newW, height: newH }; 
                  }
              }
              return item;
          }); 
          clone[currentSlideIndex] = current; return clone; 
      }); 
  };

  const handleMouseUp = () => { 
      if (!dragState.isDragging) return; 
       
      if (dragState.isCloning && !dragState.hasMoved && dragState.initialItem) {
          setSelectedIds(prev => prev.filter(id => id !== dragState.initialItem!.id));
      }

      if (dragState.action === 'draw_line' || dragState.action === 'draw_shape') { 
          let createdItem: CanvasItem | null = null;
          setSlides(prev => {
              const clone = [...prev]; const current = { ...clone[currentSlideIndex] };
              const tempIndex = current.items.findIndex(i => i.id === -1);
              if (tempIndex !== -1) {
                  const tempItem = current.items[tempIndex];
                  const isValid = tempItem.type === 'line' ? (Math.abs((tempItem.x2 || 0) - tempItem.x) > 5 || Math.abs((tempItem.y2 || 0) - tempItem.y) > 5) : (Math.abs(tempItem.width || 0) > 5 || Math.abs(tempItem.height || 0) > 5);
                  if (isValid) { const newItem = { ...tempItem, id: Date.now() }; current.items[tempIndex] = newItem; createdItem = newItem; }
                  else { current.items.splice(tempIndex, 1); }
              }
              clone[currentSlideIndex] = current; return clone;
          });
          setTimeout(() => { recordHistory(); if (createdItem) { setCurrentTool('select'); setSelectedIds([createdItem.id]); } }, 0);
      } else if (dragState.action === 'box_select') {
          setSelectionBox(null);
      }
      else recordHistory(); 
      setDragState({ ...dragState, isDragging: false, action: null, lockedAxis: null, isCloning: false }); 
  };

  const handleResetCrop = () => {
      const newItems = items.map(item => {
          if (selectedIds.includes(item.id) && item.type === 'image') {
              return { ...item, cropL: 0, cropR: 0, cropT: 0, cropB: 0 };
          }
          return item;
      });
      updateCurrentSlide(newItems, penStrokes); 
      recordHistory();
      setCropModeId(null); 
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
              img.crossOrigin = "anonymous"; 
              await new Promise(r => { img.onload = r; img.onerror = r; }); 
              
              const cl = item.cropL || 0, cr = item.cropR || 0;
              const ct = item.cropT || 0, cb = item.cropB || 0;
              const totalW = item.width! + cl + cr;
              const totalH = item.height! + ct + cb;
              const sx = (cl / totalW) * img.width;
              const sy = (ct / totalH) * img.height;
              const sw = (item.width! / totalW) * img.width;
              const sh = (item.height! / totalH) * img.height;
              ctx.drawImage(img, sx, sy, sw, sh, item.x, item.y, item.width!, item.height!);
          } else if (item.type === 'line') { 
              ctx.beginPath(); 
              ctx.moveTo(item.x, item.y); 
              ctx.lineTo(item.x2!, item.y2!); 
              ctx.strokeStyle = item.color || item.strokeColor || "#000"; 
              ctx.lineWidth = item.size || item.strokeWidth || 3; 
              ctx.stroke(); 
          } else if (item.type === 'text') { 
              ctx.font = `bold ${item.size}px sans-serif`; 
              ctx.fillStyle = item.color || item.strokeColor || "#000"; 
              ctx.textBaseline = 'top'; 
              wrapText(ctx, item.text || '', item.x, item.y, item.width || 200, (item.size || 20) * 1.2); 
          } else if (item.type === 'sticker') { 
              ctx.beginPath(); 
              ctx.arc(item.x + item.width!/2, item.y + item.height!/2, item.width!/2, 0, Math.PI*2);
              ctx.fillStyle = item.color?.includes('blue') ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)'; 
              ctx.fill();
              ctx.font = `bold ${item.size}px sans-serif`; 
              ctx.fillStyle = item.color || '#000'; 
              ctx.textAlign='center'; 
              ctx.textBaseline='middle'; 
              ctx.fillText(item.text||'', item.x+item.width!/2, item.y+item.height!/2);
          } else if (item.type === 'rect') { 
              ctx.beginPath(); ctx.rect(item.x, item.y, item.width!, item.height!); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke();
          } else if (item.type === 'circle') { 
              ctx.beginPath(); ctx.ellipse(item.x + item.width!/2, item.y + item.height!/2, Math.abs(item.width!)/2, Math.abs(item.height!)/2, 0, 0, 2 * Math.PI); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke();
          } else if (item.type === 'triangle') { 
              ctx.beginPath(); ctx.moveTo(item.x + item.width! / 2, item.y); ctx.lineTo(item.x, item.y + item.height!); ctx.lineTo(item.x + item.width!, item.y + item.height!); ctx.closePath(); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke(); 
          }
      } 
      
      ctx.drawImage(canvasRef.current, 0, 0); 
      const finalImage = tempCanvas.toDataURL('image/png'); 
      if (!store) return; 
      await store.saveSummary(patient.id, { image: finalImage, memo: JSON.stringify({ slides }) }); 
      alert("Saved!"); 
  };

  const toggleTooth = (t: string) => setSelectedTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  
  const handleSaveRules = async () => { 
      const finalType = selectedType === "기타" ? customType : selectedType; 
      const teethToSave = selectedTeeth.length === 0 ? [0] : selectedTeeth.map(t => parseInt(t)); 
      if (editingRuleId) { 
          if(store) await store.updateRule(patient.id, { id: editingRuleId, type: finalType, tooth: teethToSave[0], startStep, endStep, note }); 
          setEditingRuleId(null); 
      } else { 
          for (const tooth of teethToSave) { 
              if(store) await store.addRule(patient.id, { type: finalType, tooth, startStep, endStep, note }); 
          } 
      } 
      setSelectedTeeth([]); 
      setNote(""); 
      if (selectedType === "기타") setCustomType(""); 
  };
  
  const handleEditClick = (e: React.MouseEvent, rule: Rule) => { 
      e.stopPropagation(); 
      setEditingRuleId(rule.id); 
      if (PRESET_TYPES.includes(rule.type)) { setSelectedType(rule.type); setCustomType(""); } 
      else { setSelectedType("기타"); setCustomType(rule.type); } 
      setSelectedTeeth(rule.tooth === 0 ? [] : [rule.tooth.toString()]); 
      setStartStep(rule.startStep); 
      setEndStep(rule.endStep); 
      setNote(rule.note || ""); 
      
      if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
  };
  
  const cancelEdit = () => { 
      setEditingRuleId(null); setSelectedTeeth([]); setNote(""); setStartStep(1); setEndStep(10); 
  };
   
  const handleDeleteMultiRules = async () => {
      if (selectedRuleIds.length === 0) return;
      if (confirm(`선택한 ${selectedRuleIds.length}개의 규칙을 삭제하시겠습니까?`)) {
          for (const id of selectedRuleIds) {
              if (store) await store.deleteRule(patient.id, id); 
          }
          setSelectedRuleIds([]);
      }
  };

  const handleSaveQuickEdit = async () => {
      if (!store) return;
      const promises = Object.keys(editBuffer).map(ruleId => {
          const rule = patient.rules.find((r:any) => r.id === ruleId);
          if (rule) { return store.updateRule(patient.id, { ...rule, note: editBuffer[ruleId].note }); }
      });
      await Promise.all(promises);
      setEditBuffer({}); 
      setIsQuickEdit(false);
  };

  const getRulesForStep = (step: number) => (patient.rules || []).filter((r: Rule) => step >= r.startStep && step <= r.endStep).sort((a: Rule, b: Rule) => a.tooth - b.tooth);
  const getGroupedRules = (step: number) => { const allRules = getRulesForStep(step); const isAtt = (r: Rule) => r.type.toLowerCase().includes("attachment"); return { genRules: allRules.filter((r: Rule) => r.tooth === 0 && !isAtt(r)), upperRules: allRules.filter((r: Rule) => r.tooth >= 10 && r.tooth < 30 && !isAtt(r)), lowerRules: allRules.filter((r: Rule) => r.tooth >= 30 && !isAtt(r)), attRules: allRules.filter((r: Rule) => isAtt(r)) }; };
   
  const renderCard = (rule: Rule, step: number, isTiny = false) => { 
      const checked = patient.checklist_status.some((s: any) => s.step === step && s.ruleId === rule.id && s.checked); 
      const status = (step === rule.startStep) ? "NEW" : (step === rule.endStep ? "REMOVE" : "CHECK"); 
       
      return ( 
          <div key={rule.id} onClick={() => store && store.toggleChecklistItem(patient.id, step, rule.id)} className={cn("rounded cursor-pointer flex flex-col relative border select-none transition-all", isTiny ? "p-1.5 mb-1.5" : "p-3 mb-2", checked ? "bg-slate-50 border-green-500 ring-1 ring-green-500 text-slate-400" : "bg-white hover:ring-2 hover:ring-blue-200 border-slate-200", status === "NEW" && !checked && "border-l-4 border-l-green-500", status === "REMOVE" && !checked && "border-l-4 border-l-red-500")}> 
              <div className="flex justify-between items-start">
                  <span className={cn("font-bold", isTiny ? "text-[11px]" : "text-lg")}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}</span>
                  <div className={cn("w-4 h-4 border rounded flex items-center justify-center transition-colors", checked ? "bg-green-500 border-green-500" : "bg-white")}>{checked && <CheckCheck className="text-white w-3 h-3"/>}</div>
              </div> 
              <div className={cn("font-bold truncate mt-0.5", getTypeColor(rule.type), isTiny && "text-[10px]")}>{rule.type}</div> 
               
              {rule.note && (
                  <div className={cn(
                      "whitespace-pre-wrap break-words leading-tight rounded",
                      isTiny ? "text-[9px] p-0.5 mt-0.5" : "text-[11px] p-1.5 mt-1.5",
                      "bg-orange-50 text-slate-700 font-medium border border-orange-100/50"
                  )}>
                      {rule.note}
                  </div>
              )} 
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
                  <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setPageStartStep(Math.max(0, pageStartStep - 10))}>Prev 10</Button>
                      <Button variant="outline" onClick={() => setPageStartStep(Math.min(totalSteps, pageStartStep + 10))}>Next 10</Button>
                      <Button variant="destructive" onClick={() => setIsGridOpen(false)}>Close</Button>
                  </div> 
              </div> 
              <div className="flex-1 p-6 overflow-auto bg-slate-50"> 
                  <div className="mb-8"> 
                      <div className="grid grid-cols-10 gap-3 min-w-[1400px]"> 
                          {stepsToShow.map((step) => { 
                              if (step > totalSteps) return <div key={step} className="opacity-0 w-full"/>; 
                              
                              const { genRules, upperRules, lowerRules, attRules } = getGroupedRules(step); 
                              const allRulesInStep = [...genRules, ...upperRules, ...lowerRules, ...attRules]; 
                              
                              const isStepComplete = allRulesInStep.length > 0 && allRulesInStep.every(r => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === r.id && s.checked)); 
                              return ( 
                                  <div key={`main-${step}`} className="flex flex-col gap-2"> 
                                      <div className={cn("p-2 font-bold text-xs text-center rounded-lg border flex justify-between items-center transition-colors", isStepComplete ? "bg-blue-600 text-white border-blue-600 shadow-md" : (step===0?"bg-yellow-100":"bg-white"))}>
                                          <span>{step===0?"PRE":`STEP ${step}`}</span>
                                          {step<=totalSteps && <button onClick={()=>store && store.checkAllInStep(patient.id,step)} className={cn("rounded hover:bg-black/10 p-0.5", isStepComplete && "text-white")}><CheckSquare className="w-3.5 h-3.5"/></button>}
                                      </div> 
                                      <div className="space-y-2"> 
                                          <div className={cn("bg-white rounded-lg p-1 border flex flex-col")} style={getFixedStyle(maxGenCount)}><div className="text-[9px] font-bold text-slate-400 px-1 mb-1">GENERAL</div>{genRules.map((r: Rule) => renderCard(r, step, true))}</div> 
                                          <div className={cn("bg-white rounded-lg p-1 border flex flex-col")} style={getFixedStyle(maxUpperCount)}><div className="text-[9px] font-bold text-blue-400 px-1 mb-1">MAXILLA</div>{upperRules.map((r: Rule) => renderCard(r, step, true))}</div> 
                                          <div className={cn("bg-white rounded-lg p-1 border flex flex-col")} style={getFixedStyle(maxLowerCount)}><div className="text-[9px] font-bold text-orange-400 px-1 mb-1">MANDIBLE</div>{lowerRules.map((r: Rule) => renderCard(r, step, true))}</div> 
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
                                  <div key={`att-${step}`} className="rounded-lg bg-white border flex flex-col h-full min-h-[100px]"> 
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

  if (!store) return null;

  const safeRules = patient.rules || [];
  const maxillaRules = safeRules.filter((r:Rule) => r.tooth >= 11 && r.tooth <= 28);
  const mandibleRules = safeRules.filter((r:Rule) => r.tooth >= 31 && r.tooth <= 48);
  const generalRules = safeRules.filter((r:Rule) => r.tooth === 0);

  const handleRulesDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const action = e.dataTransfer.getData("action");
      if (action === "delete_rules") handleDeleteMultiRules();
  };

  return (
    <>
      <div className="flex h-full">
        <div className="w-[340px] border-r bg-white flex flex-col h-full overflow-hidden shrink-0 relative">
           <div ref={ruleFormRef} className={cn("p-4 border-b shrink-0 transition-colors duration-500", editingRuleId ? "bg-orange-50 border-orange-200" : "bg-slate-50")}>
               <h2 className="font-bold flex items-center gap-2">{editingRuleId ? <><Pencil className="w-4 h-4 text-orange-500"/> Editing Rule</> : "Rule Definition"}</h2>
           </div>
           
           <div ref={scrollContainerRef} className="p-4 space-y-4 overflow-y-auto flex-1 scroll-smooth">
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
              
              <div className="space-y-4 pb-10">
                 <div className="flex items-center justify-between">
                     <h3 className="text-xs font-bold text-slate-500 uppercase">Existing Rules ({safeRules.length})</h3>
                     <div className="flex gap-1.5">
                         {selectedRuleIds.length > 0 && !isQuickEdit && (
                             <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={handleDeleteMultiRules}>
                                 <Trash2 className="w-3 h-3 mr-1"/> 선택 삭제 ({selectedRuleIds.length})
                             </Button>
                         )}
                         {isQuickEdit ? (
                             <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleSaveQuickEdit}><Check className="w-3 h-3 mr-1"/> 완료</Button>
                         ) : (
                             <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsQuickEdit(true)}><Pencil className="w-3 h-3 mr-1"/> 빠른 편집</Button>
                         )}
                     </div>
                 </div>

                 {([
                     { title: "GENERAL", data: generalRules, color: "text-slate-400" },
                     { title: "MAXILLA (상악)", data: maxillaRules, color: "text-blue-500" },
                     { title: "MANDIBLE (하악)", data: mandibleRules, color: "text-red-500" }
                 ]).map(group => group.data.length > 0 && (
                     <div key={group.title} className="bg-slate-50 rounded-lg p-2 border shadow-sm">
                         <div className={cn("text-[10px] font-bold px-1 mb-2", group.color)}>{group.title}</div>
                         <div className="space-y-1.5">
                             {group.data.map((rule: Rule) => {
                                 const isSelected = selectedRuleIds.includes(rule.id);
                                 return (
                                     <div key={rule.id} 
                                          draggable={!isQuickEdit} 
                                          onDragStart={(e) => { 
                                              if(!isSelected) setSelectedRuleIds([rule.id]); 
                                              e.dataTransfer.setData("action", "delete_rules");
                                          }}
                                          onClick={() => {
                                              if(!isQuickEdit) {
                                                  setSelectedRuleIds(p => p.includes(rule.id) ? p.filter(id=>id!==rule.id) : [...p, rule.id]);
                                              }
                                          }}
                                          className={cn("text-xs border p-2 rounded flex items-center group transition-colors", isSelected ? "bg-blue-50 border-blue-300 ring-1 ring-blue-500" : "bg-white", !isQuickEdit && "cursor-pointer")}>
                                         
                                         {!isQuickEdit && (
                                             <input type="checkbox" className="mr-2 pointer-events-none w-3.5 h-3.5" checked={isSelected} readOnly />
                                         )}

                                         <div className="flex-1 overflow-hidden pointer-events-none">
                                             <div className="flex items-center gap-1">
                                                 <span className={cn("font-bold", getTypeColor(rule.type))}>{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`} {rule.type}</span>
                                                 <span className="text-slate-400 text-[10px]">({rule.startStep}-{rule.endStep})</span>
                                             </div>
                                             {isQuickEdit ? (
                                                 <input className="w-full mt-1 border-b border-dashed outline-none focus:border-blue-500 bg-transparent text-[11px] pointer-events-auto" 
                                                        defaultValue={rule.note} 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        onChange={(e) => setEditBuffer(p => ({...p, [rule.id]: {note: e.target.value}}))} 
                                                        placeholder="Note..." />
                                             ) : (
                                                 rule.note && <div className="text-[10px] text-slate-500 truncate mt-0.5">{rule.note}</div>
                                             )}
                                         </div>
                                         
                                         {!isQuickEdit && (
                                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                                 <button onClick={(e) => handleEditClick(e, rule)} className="text-slate-400 hover:text-blue-500 p-1"><Pencil className="w-3 h-3"/></button>
                                                 <button onClick={(e) => { e.stopPropagation(); store?.deleteRule(patient.id, rule.id); }} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3 h-3"/></button>
                                             </div>
                                         )}
                                     </div>
                                 )
                             })}
                         </div>
                     </div>
                 ))}

                 {!isQuickEdit && (
                     <div onDragOver={(e)=>e.preventDefault()} onDrop={handleRulesDrop} className="mt-6 border-2 border-dashed border-red-200 rounded-lg p-4 flex flex-col items-center justify-center text-red-400 hover:bg-red-50 transition-colors">
                         <Trash2 className="w-6 h-6 mb-1 opacity-50"/>
                         <span className="text-[10px] font-bold">Drag checked items here to Delete</span>
                     </div>
                 )}
              </div>
           </div>
        </div>

        <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden">
           <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm shrink-0">
             <div className="flex items-center gap-2"><FileImage className="w-5 h-5 text-blue-600"/><h3 className="text-lg font-bold text-slate-800">Work Summary</h3></div>
             <div className="flex gap-2">
                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                <Button onClick={handleSave} className="gap-2 bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4"/> Save Summary</Button>
                <Button onClick={() => setIsGridOpen(true)} className="gap-2 bg-white text-slate-700 border hover:bg-slate-50"><Layout className="w-4 h-4"/> Checklist View</Button>
             </div>
           </div>
           
           <div className="px-4 py-2 bg-slate-100 border-b flex items-center gap-4 overflow-x-auto shrink-0 select-none">
                <div className="flex items-center gap-1.5 border-r pr-4">
                    <span className="text-[10px] font-bold text-blue-600 mr-1">MAXILLA</span>
                    {UPPER_TEETH.map(num => (
                        <div key={num} draggable onDragStart={(e) => e.dataTransfer.setData('sticker', num.toString())} 
                             onClick={() => { setActiveSticker({num: num.toString(), color: '#2563eb'}); setCurrentTool('sticker'); }}
                             className={cn("w-6 h-6 flex items-center justify-center rounded-full border bg-white text-xs font-bold cursor-pointer hover:bg-blue-50 hover:border-blue-300 text-blue-600 transition-colors", currentTool==='sticker' && activeSticker?.num === num.toString() && "bg-blue-500 text-white border-blue-600")}>
                            {num}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-red-600 mr-1">MANDIBLE</span>
                    {LOWER_TEETH.map(num => (
                        <div key={num} draggable onDragStart={(e) => e.dataTransfer.setData('sticker', num.toString())} 
                             onClick={() => { setActiveSticker({num: num.toString(), color: '#dc2626'}); setCurrentTool('sticker'); }}
                             className={cn("w-6 h-6 flex items-center justify-center rounded-full border bg-white text-xs font-bold cursor-pointer hover:bg-red-50 hover:border-red-300 text-red-600 transition-colors", currentTool==='sticker' && activeSticker?.num === num.toString() && "bg-red-500 text-white border-red-600")}>
                            {num}
                        </div>
                    ))}
                </div>
           </div>

           <div className="flex-1 p-6 flex flex-row gap-4 bg-slate-100 overflow-hidden">
              <div className="w-28 flex flex-col gap-2 overflow-y-auto pr-2 shrink-0">
                  {slides.map((slide, index) => (
                      <SlideThumbnail 
                          key={slide.id} items={slide.items} penStrokes={slide.penStrokes} isActive={currentSlideIndex === index} index={index}
                          onClick={() => { setCurrentSlideIndex(index); setHistory([]); setHistoryIndex(-1); }}
                          onDelete={(e:any) => { e.stopPropagation(); deleteSlide(index); }}
                          onDuplicate={(e:any) => duplicateSlide(e, index)} 
                          onDragStart={() => {}} onDrop={handleSlideDrop} 
                      />
                  ))}
                  <Button variant="outline" className="w-full border-dashed h-20" onClick={addSlide}><Plus className="w-4 h-4 mr-1"/> Add Slide</Button>
              </div>

              <div className="flex-1 bg-white p-4 rounded-lg shadow-sm flex flex-col h-full min-h-[600px] relative">
                  {/* ✨ [수정됨] 높이를 64px로 강제 고정하여 속성창이 떠도 캔버스가 흔들리지 않음 */}
                  <div className="flex justify-between items-center mb-4 gap-2 sticky top-0 z-50 bg-white/90 backdrop-blur-sm p-2 border-b overflow-x-auto no-scrollbar min-h-[64px] shrink-0">
                     <div className="flex items-center gap-2 min-w-max">
                         <Button variant={currentTool === 'select' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('select')} className={cn(currentTool === 'select' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Select"><MousePointer2 className="w-4 h-4"/></Button>
                         <div className="w-px h-4 bg-slate-300 mx-1"></div>
                         <Button variant={currentTool === 'draw' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('draw')} className={cn(currentTool === 'draw' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Pen"><PenTool className="w-4 h-4"/></Button>
                         <Button variant={currentTool === 'highlighter' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('highlighter')} className={cn(currentTool === 'highlighter' && "bg-yellow-100 text-yellow-600 ring-2 ring-yellow-500")} title="Highlighter"><Highlighter className="w-4 h-4"/></Button>
                         <Button variant={currentTool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('eraser')} className={cn(currentTool === 'eraser' && "bg-pink-100 text-pink-600 ring-2 ring-pink-500")} title="Eraser"><Eraser className="w-4 h-4"/></Button>
                         <Button variant={currentTool === 'line' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('line')} className={cn(currentTool === 'line' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Line"><Minus className="w-4 h-4 -rotate-45"/></Button>
                         <Button variant={currentTool === 'rect' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('rect')} className={cn(currentTool === 'rect' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Rectangle"><Square className="w-4 h-4"/></Button>
                         <Button variant={currentTool === 'circle' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('circle')} className={cn(currentTool === 'circle' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Circle"><Circle className="w-4 h-4"/></Button>
                         <Button variant={currentTool === 'triangle' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('triangle')} className={cn(currentTool === 'triangle' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Triangle"><Triangle className="w-4 h-4"/></Button>
                         <div className="w-px h-4 bg-slate-300 mx-1"></div>
                         <Button variant={currentTool === 'text' ? 'secondary' : 'ghost'} size="icon" onClick={() => changeTool('text')} className={cn(currentTool === 'text' && "bg-blue-100 text-blue-600 ring-2 ring-blue-500")} title="Text"><Type className="w-4 h-4"/></Button>
                         
                         <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                         <Button variant="ghost" size="icon" onClick={() => !isImageUploading && fileInputRef.current?.click()} title="Add Image" disabled={isImageUploading}>
                             {isImageUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ImageIcon className="w-4 h-4"/>}
                         </Button>

                         {selectedIds.length === 1 && items.find(i => i.id === selectedIds[0])?.type === 'image' && (
                             <>
                                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                                <Button variant={cropModeId === selectedIds[0] ? 'secondary' : 'ghost'} size="sm" 
                                    onClick={() => setCropModeId(cropModeId === selectedIds[0] ? null : selectedIds[0])} 
                                    className={cn("h-8 gap-1", cropModeId === selectedIds[0] && "bg-green-100 text-green-700 ring-2 ring-green-500")}>
                                    <Crop className="w-3.5 h-3.5"/> 자르기
                                </Button>
                                {cropModeId === selectedIds[0] && (
                                    <Button variant="outline" size="sm" onClick={() => handleResetCrop()} className="h-8 gap-1 border-orange-200 text-orange-600 hover:bg-orange-50 ml-1">
                                        <RotateCcw className="w-3.5 h-3.5"/> 원본 복원
                                    </Button>
                                )}
                             </>
                         )}
                         
                         {/* ✨ [수정됨] 도구가 선택되거나 아이템이 선택되면 즉시 속성창(색/굵기)이 뜹니다! */}
                         {((currentTool === 'select' && selectedIds.length > 0) || ['draw', 'line', 'rect', 'circle', 'triangle', 'text', 'highlighter', 'eraser'].includes(currentTool)) && (
                            <div className="flex items-center gap-2 border px-2 py-1 rounded bg-slate-50 ml-2 shrink-0">
                               <div className="flex flex-col items-center gap-0.5">
                                   <span className="text-[8px] font-bold text-slate-400">Stroke</span>
                                   <input type="color" value={styleSettings.strokeColor} onChange={(e) => handleStyleChange('strokeColor', e.target.value)} className="w-5 h-5 p-0 border-0 rounded cursor-pointer" title="Stroke/Text Color"/>
                               </div>
                               
                               {/* Fill은 도형 관련 도구에서만 표시 */}
                               {(['rect', 'circle', 'triangle'].includes(currentTool) || (currentTool === 'select' && items.some(i => selectedIds.includes(i.id) && ['rect', 'circle', 'triangle'].includes(i.type)))) && (
                                   <div className="flex flex-col items-center gap-0.5">
                                       <span className="text-[8px] font-bold text-slate-400">Fill</span>
                                       <div className="relative w-5 h-5">
                                           <input type="color" value={styleSettings.fillColor === 'transparent' ? '#ffffff' : styleSettings.fillColor} onChange={(e) => handleStyleChange('fillColor', e.target.value)} className="w-full h-full p-0 border-0 rounded cursor-pointer" />
                                           <button onClick={() => handleStyleChange('fillColor', 'transparent')} className="absolute -top-3 -right-2 bg-white border rounded-[2px] text-[8px] px-0.5" title="Transparent">X</button>
                                       </div>
                                   </div>
                               )}
                               <div className="flex flex-col items-center w-16">
                                   <span className="text-[8px] font-bold text-slate-400">Width: {styleSettings.strokeWidth}</span>
                                   <input type="range" min="1" max="50" value={styleSettings.strokeWidth} onChange={(e) => handleStyleChange('strokeWidth', Number(e.target.value))} className="w-full accent-blue-600 h-1.5" />
                               </div>
                           </div>
                         )}
                     </div>
                     
                     <div className="flex gap-2 items-center min-w-max ml-auto">
                        <div className="relative">
                              <Button variant="ghost" size="icon" onClick={() => setIsEditMenuOpen(!isEditMenuOpen)} title="Edit Menu"><ChevronDown className="w-4 h-4"/></Button>
                              {isEditMenuOpen && (
                                  <div className="absolute right-0 top-full mt-1 bg-white border shadow-lg rounded-lg p-1 flex flex-col gap-1 z-50 min-w-[140px] animate-in fade-in zoom-in-95" onClick={() => setIsEditMenuOpen(false)}>
                                      <div className="text-[10px] font-bold text-slate-400 px-2 py-1">CLIPBOARD</div>
                                      <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 rounded text-sm w-full text-left" onClick={handleCopy} disabled={selectedIds.length === 0}><Copy className="w-3.5 h-3.5"/> Copy</button>
                                      <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 rounded text-sm w-full text-left" onClick={handlePaste} disabled={clipboard.length === 0}><Clipboard className="w-3.5 h-3.5"/> Paste</button>
                                      <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 rounded text-sm w-full text-left" onClick={handleDuplicate} disabled={selectedIds.length === 0}><Plus className="w-3.5 h-3.5"/> Duplicate</button>
                                  </div>
                              )}
                         </div>
                         <div className="w-px h-4 bg-slate-300 mx-1"></div>
                         <Button variant="ghost" size="icon" onClick={handleUndo} title="Undo (Ctrl+Z)"><Undo className="w-4 h-4"/></Button>
                         <Button variant="ghost" size="icon" onClick={handleRedo} title="Redo (Ctrl+Y)"><Redo className="w-4 h-4"/></Button>
                        
                        {selectedIds.length > 0 && (
                            <>
                                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                                <Button variant="ghost" size="sm" onClick={() => moveLayer('up')} title="Bring Forward"><BringToFront className="w-4 h-4"/></Button>
                                <Button variant="ghost" size="sm" onClick={() => moveLayer('down')} title="Send Backward"><SendToBack className="w-4 h-4"/></Button>
                                <Button variant="ghost" size="sm" onClick={deleteSelectedItems} className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4"/></Button>
                            </>
                        )}
                        <div className="w-px h-4 bg-slate-300 mx-1"></div>
                        <Button variant="ghost" size="sm" onClick={clearPenLayer} className="text-slate-500">Clear Pen</Button>
                        <Button variant="ghost" size="sm" onClick={clearAll} className="text-red-400">Clear All</Button>
                     </div>
                  </div>

                  <div className={cn("flex-1 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 overflow-hidden relative select-none", 
                    ['draw', 'highlighter', 'line', 'rect', 'circle', 'triangle'].includes(currentTool) && "cursor-crosshair", 
                    currentTool === 'eraser' && "cursor-cell", 
                    currentTool === 'text' && "cursor-text", 
                    currentTool === 'select' && "cursor-default",
                    currentTool === 'sticker' && "cursor-crosshair"
                  )} ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDragOver={handleDrop} onDrop={handleDrop}>
                     {items.map((item) => {
                         if (textInput && textInput.id === item.id) return null;
                         const isSelected = selectedIds.includes(item.id);
                         const showResizeHandles = isSelected && selectedIds.length === 1 && cropModeId !== item.id; 
                         const showCropHandles = cropModeId === item.id && item.type === 'image'; 
                         const commonStyle: React.CSSProperties = { left: item.x, top: item.y, zIndex: items.indexOf(item) + 1, pointerEvents: currentTool === 'select' ? 'auto' : 'none' };
                         
                         const renderResizeHandles = () => {
                             if (!showResizeHandles || currentTool !== 'select') return null;
                             const handles = [ { pos: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } }, { pos: 'n', style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } }, { pos: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } }, { pos: 'e', style: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' } }, { pos: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } }, { pos: 's', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } }, { pos: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } }, { pos: 'w', style: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' } } ];
                             return handles.map(h => ( <div key={h.pos} className="absolute w-2.5 h-2.5 bg-white border border-blue-500 z-50" style={h.style} onMouseDown={(e) => handleResizeMouseDown(e, item, h.pos)} /> ));
                         };

                         // ✨ [수정됨] 초록색 자르기 조절바 (선 전체를 잡고 이동 가능)
                         const renderCropHandles = () => {
                            if (!showCropHandles || currentTool !== 'select') return null;
                            const crops = [ 
                                { pos: 'crop-t', area: { top: -6, left: 0, right: 0, height: 12, cursor: 'ns-resize' }, mark: { top: -3, left: '50%', transform: 'translateX(-50%)', width: 24, height: 6 } }, 
                                { pos: 'crop-b', area: { bottom: -6, left: 0, right: 0, height: 12, cursor: 'ns-resize' }, mark: { bottom: -3, left: '50%', transform: 'translateX(-50%)', width: 24, height: 6 } }, 
                                { pos: 'crop-l', area: { top: 0, bottom: 0, left: -6, width: 12, cursor: 'ew-resize' }, mark: { top: '50%', left: -3, transform: 'translateY(-50%)', width: 6, height: 24 } }, 
                                { pos: 'crop-r', area: { top: 0, bottom: 0, right: -6, width: 12, cursor: 'ew-resize' }, mark: { top: '50%', right: -3, transform: 'translateY(-50%)', width: 6, height: 24 } } 
                            ];
                            return (
                                <>
                                    <div className="absolute inset-0 border-[3px] border-green-500 pointer-events-none z-40" />
                                    {crops.map(h => ( 
                                        <React.Fragment key={h.pos}>
                                            <div className="absolute z-50 bg-transparent" style={h.area} onMouseDown={(e) => handleResizeMouseDown(e, item, h.pos)} title="Drag to crop" />
                                            <div className="absolute bg-green-500 border border-white z-40 rounded-sm pointer-events-none shadow-sm" style={h.mark} />
                                        </React.Fragment>
                                    ))}
                                </>
                            );
                         }
                         
                         if (item.type === 'image') { 
                            const cl = item.cropL || 0, cr = item.cropR || 0, ct = item.cropT || 0, cb = item.cropB || 0;
                            return ( 
                                <div key={item.id} className={cn("absolute", isSelected && cropModeId !== item.id && "ring-1 ring-blue-500")} style={{ ...commonStyle, width: item.width, height: item.height, overflow: 'hidden' }} onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)}> 
                                    <img src={item.src} className="pointer-events-none" style={{ position: 'absolute', left: -cl, top: -ct, width: item.width! + cl + cr, height: item.height! + ct + cb, maxWidth: 'none' }} />
                                    {isSelected && selectedIds.length > 1 && <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none"/>} 
                                    {renderResizeHandles()} 
                                    {renderCropHandles()} 
                                </div> 
                            ); 
                         } 
                         if (item.type === 'text') { 
                             return ( 
                                 <div key={item.id} className={cn("absolute whitespace-pre-wrap px-1 border border-transparent group", isSelected && "border-blue-500")} style={{ ...commonStyle, color: item.strokeColor || item.color, fontSize: item.size, fontWeight: 'bold', width: item.width, lineHeight: '1.2' }} onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)} onDoubleClick={(e) => { e.stopPropagation(); handleTextDoubleClick(item); }}> 
                                     {item.text} 
                                     {item.text?.includes('http') && <div className="absolute -top-4 right-0 text-[9px] bg-black/60 text-white px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">Ctrl+Click to open link</div>} 
                                     {isSelected && selectedIds.length > 1 && <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none"/>} 
                                     {renderResizeHandles()} 
                                 </div> 
                             ); 
                         }
                         if (item.type === 'sticker') { 
                             return ( 
                                 <div key={item.id} className={cn("absolute flex items-center justify-center rounded-full", isSelected && "ring-1 ring-blue-500")} style={{ ...commonStyle, width: item.width, height: item.height, backgroundColor: item.color?.includes('blue') ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)', color: item.color, fontSize: item.size, fontWeight: 'bold' }} onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)}> 
                                     {item.text} 
                                     {renderResizeHandles()} 
                                 </div> 
                             ); 
                         }
                         if (item.type === 'line') { 
                             return ( 
                                 <svg key={item.id} className="absolute overflow-visible" style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: items.indexOf(item) + 1, pointerEvents: 'none' }}> 
                                     <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={Math.max(item.strokeWidth || item.size || 3, 20)} className={cn(currentTool === 'select' ? "pointer-events-auto cursor-move" : "")} onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)} /> 
                                     <line x1={item.x} y1={item.y} x2={item.x2} y2={item.y2} stroke={isSelected ? "#3b82f6" : (item.strokeColor || item.color)} strokeWidth={item.strokeWidth || item.size} className={cn(currentTool === 'select' ? "pointer-events-none" : "")} /> 
                                     {showResizeHandles && currentTool === 'select' && ( <> <circle cx={item.x} cy={item.y} r={5} fill="white" stroke="blue" strokeWidth={2} className="pointer-events-auto cursor-pointer" onMouseDown={(e) => handleResizeMouseDown(e, item, 'start')} /> <circle cx={item.x2} cy={item.y2} r={5} fill="white" stroke="blue" strokeWidth={2} className="pointer-events-auto cursor-pointer" onMouseDown={(e) => handleResizeMouseDown(e, item, 'end')} /> </> )} 
                                 </svg> 
                             ); 
                         }
                         if (['rect', 'circle', 'triangle'].includes(item.type)) { 
                             return ( 
                                 <div key={item.id} className="absolute" style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: items.indexOf(item) + 1, pointerEvents: currentTool === 'select' ? 'auto' : 'none' }} onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)}> 
                                     <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible"> 
                                         {item.type === 'rect' && <rect x="0" y="0" width="100" height="100" fill={item.fillColor || "transparent"} stroke={item.strokeColor || "#000"} strokeWidth={item.strokeWidth || 3} vectorEffect="non-scaling-stroke" />} 
                                         {item.type === 'circle' && <ellipse cx="50" cy="50" rx="50" ry="50" fill={item.fillColor || "transparent"} stroke={item.strokeColor || "#000"} strokeWidth={item.strokeWidth || 3} vectorEffect="non-scaling-stroke" />} 
                                         {item.type === 'triangle' && <polygon points="50,0 0,100 100,100" fill={item.fillColor || "transparent"} stroke={item.strokeColor || "#000"} strokeWidth={item.strokeWidth || 3} vectorEffect="non-scaling-stroke" />} 
                                     </svg> 
                                     {isSelected && selectedIds.length > 1 && <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none"/>} 
                                     {renderResizeHandles()} 
                                 </div> 
                             ); 
                         }
                     })}
                     {selectionBox && ( <div className="absolute border border-blue-500 bg-blue-200/30 z-[9999] pointer-events-none" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h }} /> )}
                     <canvas ref={canvasRef} className={cn("absolute inset-0 w-full h-full touch-none z-[9999]", (['draw', 'eraser', 'highlighter'].includes(currentTool)) ? "pointer-events-auto" : "pointer-events-none")} />
                     {textInput && ( <textarea autoFocus className="absolute z-[10000] border-2 border-blue-500 bg-white/90 px-2 py-1 shadow-lg outline-none rounded resize-none overflow-hidden" style={{ left: textInput.x, top: textInput.y, width: textInput.width ? textInput.width : 'auto', minWidth: '100px', color: styleSettings.strokeColor, fontSize: styleSettings.fontSize, fontWeight: "bold", height: "auto", lineHeight: '1.2' }} value={textInput.value} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; setTextInput({ ...textInput, value: e.target.value }) }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmText(); } }} onBlur={confirmText} /> )}
                     
                     {contextMenu && ( 
                         <div className="absolute z-[10001] bg-white border border-slate-200 shadow-xl rounded-md py-1 min-w-[120px] animate-in fade-in zoom-in-95 duration-100" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(e) => e.stopPropagation()}> 
                             {items.find(i => i.id === contextMenu.itemId)?.type === 'image' && (
                                 <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-b" onClick={() => { setCropModeId(contextMenu.itemId); setContextMenu(null); }}> 
                                     <Crop className="w-4 h-4"/> Crop 
                                 </button> 
                             )}
                             <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2" onClick={handleDeleteFromMenu}> 
                                 <Trash2 className="w-4 h-4"/> Delete 
                             </button> 
                         </div> 
                     )}
                     {items.length === 0 && penStrokes.length === 0 && !textInput && ( <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none"> <FileImage className="w-16 h-16 mb-4 opacity-50"/> <p className="font-bold text-lg">Add Images or Draw</p> </div> )}
                  </div>
              </div>
           </div>
        </div>
      </div>
      {isGridOpen && renderFullScreenGrid()}
    </>
  );
}