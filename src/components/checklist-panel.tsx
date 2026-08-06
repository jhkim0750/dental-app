"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePatientStoreHydrated, Rule } from "@/hooks/use-patient-store";
import { createPortal } from "react-dom";
import { 
  CheckCheck, Plus, Trash2, Pencil, Save, Layout, FileImage, 
  Type, Eraser, PenTool, Minus, Undo, Redo, CheckSquare,
  Image as ImageIcon, MousePointer2, BringToFront, SendToBack, Highlighter,
  Loader2, Square, Circle, Triangle, Copy, Clipboard, ChevronDown,
  Crop, RotateCcw, Check, X, Table, LayoutDashboard, ListTree, TrendingUp,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid";
import { storage } from "@/lib/firebase";
import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import dynamic from 'next/dynamic';
const RecordsSheet = dynamic(() => import('./records-sheet'), { ssr: false });
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

const GraphViewer = ({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) => {
    const [isExpanded, setIsExpanded] = useState(true); // ✨ 무조건 큰 창으로 시작
    const [isZoomed, setIsZoomed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [scale, setScale] = useState(1);

    const imgRef = useRef<HTMLImageElement>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const dragRef = useRef({ isDown: false, startX: 0, startY: 0, lastX: 0, lastY: 0, didMove: false });

    const resetZoom = () => {
        setIsZoomed(false);
        setScale(1);
        setIsDragging(false);
        panRef.current = { x: 0, y: 0 };
        if (imgRef.current) imgRef.current.style.transform = `translate(0px, 0px) scale(1) translateZ(0)`;
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === '`' || e.key === '~') {
                e.preventDefault(); 
                setIsExpanded(prev => !prev);
                resetZoom(); 
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isZoomed) return;
        dragRef.current = { isDown: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, didMove: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isZoomed || !dragRef.current.isDown) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        const totalDx = Math.abs(e.clientX - dragRef.current.startX);
        const totalDy = Math.abs(e.clientY - dragRef.current.startY);

        if (totalDx > 5 || totalDy > 5) {
            if (!dragRef.current.didMove) {
                dragRef.current.didMove = true;
                setIsDragging(true);
            }
        }

        panRef.current.x += dx;
        panRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;

        if (imgRef.current) {
            imgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scale}) translateZ(0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragRef.current.isDown = false;
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    // ✨ 마우스 커서 위치를 중심으로 확대/축소하고 튕김 현상을 방지하는 수학적 보정 로직
    const handleWheel = (e: React.WheelEvent) => {
        if (!imgRef.current || !imgRef.current.parentElement) return;

        const delta = e.deltaY < 0 ? 0.3 : -0.3; // 휠 위로: 확대, 아래로: 축소
        let newScale = scale + delta;
        newScale = Math.max(1, Math.min(newScale, 10)); // 1배 ~ 10배 제한

        if (newScale === 1 && scale === 1) return;

        if (newScale === 1) {
            resetZoom();
            return;
        }

        // 컨테이너의 정중앙 좌표 계산
        const rect = imgRef.current.parentElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 중앙을 기준으로 한 현재 마우스 커서의 좌표
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;

        // 배율 변화량
        const ratio = newScale / scale;

        // 마우스 커서 아래에 있는 이미지가 다른 곳으로 도망가지 않도록 panRef 위치 정밀 보정
        panRef.current = {
            x: mouseX - (mouseX - panRef.current.x) * ratio,
            y: mouseY - (mouseY - panRef.current.y) * ratio,
        };

        setScale(newScale);
        setIsZoomed(true);
        imgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${newScale}) translateZ(0)`;
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-default"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
            <div
                className={cn(
                    "bg-white p-3 rounded-2xl border-4 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex flex-col items-center animate-in fade-in zoom-in-95 duration-200 relative transition-all",
                    isExpanded ? "w-[1300px] max-w-[95vw] h-[85vh]" : "w-[900px] max-w-[90vw] max-h-[85vh]"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-full h-full flex rounded-lg overflow-hidden items-center justify-center bg-slate-50 relative select-none">
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        alt="Graph Reference"
                        draggable={false}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onWheel={handleWheel} // ✨ 휠 이벤트 연결
                        title={isZoomed ? "드래그하여 이동 / 마우스 휠로 확대·축소" : "마우스 휠로 확대·축소"}
                        className={cn(
                            "w-full h-full object-contain will-change-transform origin-center",
                            isDragging ? "cursor-grabbing" : (isZoomed ? "cursor-grab" : "auto"),
                            !isDragging && "transition-transform duration-300 ease-out"
                        )}
                        style={{ transform: "translate(0px, 0px) scale(1) translateZ(0)" }}
                    />
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    title="닫기"
                    className="absolute -top-4 -right-4 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-red-500 hover:bg-red-50 font-bold z-50 transition-colors"
                >
                    ✕
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); resetZoom(); }}
                    title={isExpanded ? "기본 크기로 축소" : "창 크게 보기"}
                    className="absolute -top-4 right-8 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 font-bold z-50 transition-colors"
                >
                    {isExpanded ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M10 10L3 3M14 14l7 7"/></svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    )}
                </button>
            </div>
        </div>,
        document.body
    );
};

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
          ctx.font = `900 ${item.size}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'white';
          ctx.strokeText(item.text || '', item.x + item.width! / 2, item.y + item.height! / 2);
          ctx.fillStyle = item.color || '#000';
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
          "w-full aspect-[4/3] bg-white border-2 rounded cursor-pointer relative group shadow-sm transition-all overflow-hidden shrink-0", 
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
    return "text-teal-600"; // ✨ NEW: 기타 등 나머지 아이템은 모두 청록색(Teal)
  };
  
  // 전문가용 컬러 시스템
  const getExpertTypeColor = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes("bos")) return "#2563eb"; 
      if (t.includes("attachment")) return "#059669"; 
      if (t.includes("ipr")) return "#7c3aed"; 
      if (t.includes("bc")) return "#dc2626"; 
      if (t.includes("ridge")) return "#ea580c"; 
      if (t.includes("bite")) return "#0d9488"; 
      if (t.includes("tag")) return "#db2777"; 
      return "#0d9488"; // ✨ NEW: 기타 등 나머지 아이템은 모두 청록색(Teal)
  };

const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const getAbbreviation = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("attachment")) return "AT";
  if (t.includes("vertical ridge")) return "V/R";
  if (t.includes("power ridge")) return "P/R";
  if (t.includes("ipr")) return "IPR";
  if (t.includes("bos")) return "BOS";
  if (t.includes("bc")) return "BC";
  if (t.includes("tag")) return "TAG";
  return type; 
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

// ==========================================
// 1. InlineNoteEdit 컴포넌트 교체
// ==========================================
const InlineNoteEdit = ({ rule, store, patientId, itemColor, isUpper, isChecked, onToggleCheck, showMemo = true }: { rule: Rule, store: any, patientId: string, itemColor: string, isUpper?: boolean, isChecked?: boolean, onToggleCheck?: () => void, showMemo?: boolean }) => {
        const [showPopup, setShowPopup] = useState(false); 
    const [isEditing, setIsEditing] = useState(false);
    const [tempNote, setTempNote] = useState("");
    
    // ✨ NEW: A안(전체 창 확대), B안(고급 줌/팬) 상태 추가
    const [isExpanded, setIsExpanded] = useState(false);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isDragging, setIsDragging] = useState(false); // 드래그 중 애니메이션 끄기용
    
    const imgRef = useRef<HTMLImageElement>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const dragRef = useRef({ isDown: false, startX: 0, startY: 0, lastX: 0, lastY: 0, didMove: false });
    // ✨ NEW: ESC 키로 룰 이미지 팝업 닫기
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showPopup) {
                setShowPopup(false); setIsExpanded(false); resetZoom();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showPopup]);

    const resetZoom = () => {
        setIsZoomed(false);
        setIsDragging(false);
        panRef.current = { x: 0, y: 0 };
        if (imgRef.current) imgRef.current.style.transform = `translate(0px, 0px) scale(1) translateZ(0)`;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isZoomed) return;
        dragRef.current = { isDown: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, didMove: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isZoomed || !dragRef.current.isDown) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        const totalDx = Math.abs(e.clientX - dragRef.current.startX);
        const totalDy = Math.abs(e.clientY - dragRef.current.startY);
        
        // ✨ 이동 거리가 5px 이상이면 '드래그'로 판정하고 애니메이션(transition)을 꺼서 덜컹임 방지
        if (totalDx > 5 || totalDy > 5) {
            if (!dragRef.current.didMove) {
                dragRef.current.didMove = true;
                setIsDragging(true);
            }
        }

        panRef.current.x += dx;
        panRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;

        if (imgRef.current) {
            imgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(3) translateZ(0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragRef.current.isDown = false;
        setIsDragging(false); // 마우스를 떼면 다시 애니메이션 켬
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleImageClick = (e: React.MouseEvent) => {
        // ✨ 드래그를 했다면 클릭(축소) 무시
        if (dragRef.current.didMove) {
            dragRef.current.didMove = false;
            return; 
        }
        
        if (isZoomed) {
            resetZoom();
        } else {
            // ✨ 클릭한 좌표를 계산하여 그곳을 중심으로 3배 확대
            if (!imgRef.current) return;
            const rect = imgRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const scale = 3;
            const tx = (centerX - clickX) * (scale - 1);
            const ty = (centerY - clickY) * (scale - 1);
            
            panRef.current = { x: tx, y: ty };
            setIsZoomed(true);
            imgRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) translateZ(0)`;
        }
    };

    const handleSave = () => {
        setIsEditing(false);
        if (tempNote !== (rule.note || "")) {
            store.updateRule(patientId, { ...rule, note: tempNote });
        }
    };

    const typeEl = (
        <div 
            className={cn("font-extrabold text-[15px] tracking-tight flex items-center justify-center gap-0.5 relative cursor-pointer transition-all duration-300 group", isChecked && "opacity-40 line-through")} 
            style={{ color: itemColor }}
            onClick={(e) => {
                if (rule.imageUrl) {
                    e.stopPropagation(); 
                    setShowPopup(!showPopup); 
                    setIsExpanded(false); 
                    resetZoom(); 
                }
            }}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onToggleCheck?.(); }}
                className={cn(
                    "absolute -left-5 p-1 flex items-center justify-center transition-all duration-300",
                    isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
            >
                {isChecked ? <CheckCheck className="w-4 h-4 text-green-500" /> : <div className="w-3 h-3 border-[1.5px] border-slate-300 rounded-sm hover:border-green-400 hover:bg-green-50" />}
            </button>

            {getAbbreviation(rule.type)}
            
            {rule.imageUrl && (
                <div className="absolute -top-1.5 -right-3 drop-shadow-md" title="Reference Image">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </div>
            )}

            {rule.imageUrl && showPopup && typeof document !== "undefined" && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-default" 
                    onClick={(e) => { e.stopPropagation(); setShowPopup(false); setIsExpanded(false); resetZoom(); }}
                >
                    <div 
                        className={cn(
                            "bg-white p-3 rounded-2xl border-4 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex flex-col items-center animate-in fade-in zoom-in-95 duration-200 relative transition-all",
                            isExpanded ? "w-[1300px] max-w-[95vw] h-[85vh]" : "w-[900px] max-w-[90vw] max-h-[85vh]"
                        )} 
                        onClick={(e) => e.stopPropagation()} 
                    >
                        {/* ✨ B안 적용: 고급 줌 & 드래그 패닝 뷰어 */}
                        <div className="w-full h-full flex rounded-lg overflow-hidden items-center justify-center bg-slate-50 relative select-none">
                            <img 
                                ref={imgRef}
                                src={rule.imageUrl} 
                                alt="Reference" 
                                draggable={false}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onClick={handleImageClick}
                                title={isZoomed ? "드래그하여 이동 / 클릭하여 축소" : "클릭하여 부분 확대"}
                                className={cn(
                                    "w-full h-full object-contain will-change-transform origin-center", 
                                    isDragging ? "cursor-grabbing" : (isZoomed ? "cursor-grab" : "cursor-zoom-in"),
                                    !isDragging && "transition-transform duration-300 ease-out"
                                )} 
                                style={{ transform: "translate(0px, 0px) scale(1) translateZ(0)" }}
                            />
                        </div>

                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowPopup(false); setIsExpanded(false); resetZoom(); }}
                            title="닫기"
                            className="absolute -top-4 -right-4 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-red-500 hover:bg-red-50 font-bold z-50 transition-colors"
                        >
                            ✕
                        </button>

                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); resetZoom(); }}
                            title={isExpanded ? "기본 크기로 축소" : "창 크게 보기"}
                            className="absolute -top-4 right-8 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 font-bold z-50 transition-colors"
                        >
                            {isExpanded ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M10 10L3 3M14 14l7 7"/></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                            )}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
    
    const noteTextEl = showMemo && rule.note ? (
                <div className={cn("w-[60px] text-[12px] text-slate-700 font-extrabold leading-tight text-center break-words whitespace-pre-wrap px-0.5 transition-all duration-300", isChecked && "opacity-40 line-through")}>
            {rule.note}
        </div>
    ) : null;
    
    const inputEl = (
        <textarea 
            autoFocus
            className="w-[60px] text-[12px] text-center border-b-2 border-blue-400 bg-blue-50/50 outline-none font-extrabold text-slate-800 leading-tight px-0.5 py-0 rounded-none resize-none overflow-hidden whitespace-pre-wrap break-words custom-scrollbar block"
            style={{ height: 'auto', minHeight: '18px' }}
            value={tempNote}
            onChange={(e) => {
                setTempNote(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onFocus={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
                const val = e.target.value;
                e.target.value = '';
                e.target.value = val;
            }}
            onBlur={handleSave}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    if (!e.shiftKey) {
                        e.preventDefault();
                        handleSave();
                    }
                }
                if (e.key === 'Escape') setIsEditing(false);
            }}
            placeholder="입력..."
            rows={1}
        />
    );

    if (isEditing) {
        return (
            <div className="flex flex-col items-center w-full relative gap-0.5 mt-0.5 z-50">
                {isUpper ? <>{inputEl}{typeEl}</> : <>{typeEl}{inputEl}</>}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full cursor-pointer hover:bg-blue-50/50 rounded transition-colors py-0.5 gap-0.5" 
             title="더블클릭 수정 (저장: Enter, 줄바꿈: Shift+Enter)"
             onDoubleClick={() => { setTempNote(rule.note || ""); setIsEditing(true); }}>
            {isUpper ? <>{noteTextEl}{typeEl}</> : <>{typeEl}{noteTextEl}</>}
        </div>
    );
};

// ==========================================
// 2. CornerRuleItem 컴포넌트 교체
// ==========================================
const CornerRuleItem = ({ rule, label, isChecked, onToggleCheck, showMemo = true }: { rule: Rule; label: string; isChecked?: boolean; onToggleCheck?: () => void; showMemo?: boolean }) => {
        const [showPopup, setShowPopup] = useState(false);
    
    // ✨ NEW: A안, B안(고급 줌/팬) 상태 추가
    const [isExpanded, setIsExpanded] = useState(false);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    
    const imgRef = useRef<HTMLImageElement>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const dragRef = useRef({ isDown: false, startX: 0, startY: 0, lastX: 0, lastY: 0, didMove: false });
    // ✨ NEW: ESC 키로 모서리 룰 이미지 팝업 닫기
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showPopup) {
                setShowPopup(false); setIsExpanded(false); resetZoom();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showPopup]);

    const resetZoom = () => {
        setIsZoomed(false);
        setIsDragging(false);
        panRef.current = { x: 0, y: 0 };
        if (imgRef.current) imgRef.current.style.transform = `translate(0px, 0px) scale(1) translateZ(0)`;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isZoomed) return;
        dragRef.current = { isDown: true, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, didMove: false };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isZoomed || !dragRef.current.isDown) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        const totalDx = Math.abs(e.clientX - dragRef.current.startX);
        const totalDy = Math.abs(e.clientY - dragRef.current.startY);
        
        if (totalDx > 5 || totalDy > 5) {
            if (!dragRef.current.didMove) {
                dragRef.current.didMove = true;
                setIsDragging(true);
            }
        }

        panRef.current.x += dx;
        panRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;

        if (imgRef.current) {
            imgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(3) translateZ(0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragRef.current.isDown = false;
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleImageClick = (e: React.MouseEvent) => {
        if (dragRef.current.didMove) {
            dragRef.current.didMove = false;
            return; 
        }
        
        if (isZoomed) {
            resetZoom();
        } else {
            if (!imgRef.current) return;
            const rect = imgRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const scale = 3;
            const tx = (centerX - clickX) * (scale - 1);
            const ty = (centerY - clickY) * (scale - 1);
            
            panRef.current = { x: tx, y: ty };
            setIsZoomed(true);
            imgRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) translateZ(0)`;
        }
    };

    const itemColor = getExpertTypeColor(rule.type);

    return (
        <div className={cn("flex items-center gap-1.5 text-[12px] font-extrabold animate-in fade-in slide-in-from-left-2 transition-all duration-300 group", isChecked && "opacity-40 line-through")}>
            <div className="relative flex items-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleCheck?.(); }}
                    className={cn(
                        "absolute -left-5 p-1 flex items-center justify-center transition-all duration-300",
                        isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                >
                    {isChecked ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <div className="w-2.5 h-2.5 border-[1.5px] border-slate-300 rounded-sm hover:border-green-400" />}
                </button>
                <span className="px-1.5 py-0.5 rounded border-[1.5px] bg-slate-50 text-slate-500 border-slate-200">{label}</span>
            </div>

            <div 
                className={cn("flex items-center relative cursor-pointer hover:opacity-70 transition-opacity", rule.imageUrl && "pr-3")}
                onClick={(e) => {
                    if (rule.imageUrl) {
                        e.stopPropagation();
                        setShowPopup(!showPopup);
                        setIsExpanded(false);
                        resetZoom();
                    }
                }}
            >
                <span style={{ color: itemColor }}>{getAbbreviation(rule.type)}</span>
                
                {rule.imageUrl && (
                    <div className="absolute -top-1 right-0 drop-shadow-md" title="Reference Image">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </div>
                )}
            </div>

            {showMemo && rule.note && <span className="text-slate-700">- {rule.note}</span>}
                        <span className="text-slate-400 font-mono">- ({rule.startStep}-{rule.endStep})</span>

            {rule.imageUrl && showPopup && typeof document !== "undefined" && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-default" 
                    onClick={(e) => { e.stopPropagation(); setShowPopup(false); setIsExpanded(false); resetZoom(); }}
                >
                    <div 
                        className={cn(
                            "bg-white p-3 rounded-2xl border-4 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex flex-col items-center animate-in fade-in zoom-in-95 duration-200 relative transition-all",
                            isExpanded ? "w-[1300px] max-w-[95vw] h-[85vh]" : "w-[900px] max-w-[90vw] max-h-[85vh]"
                        )} 
                        onClick={(e) => e.stopPropagation()} 
                    >
                        {/* ✨ B안 적용: 고급 줌 & 드래그 패닝 뷰어 */}
                        <div className="w-full h-full flex rounded-lg overflow-hidden items-center justify-center bg-slate-50 relative select-none">
                            <img 
                                ref={imgRef}
                                src={rule.imageUrl} 
                                alt="Reference" 
                                draggable={false}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onClick={handleImageClick}
                                title={isZoomed ? "드래그하여 이동 / 클릭하여 축소" : "클릭하여 부분 확대"}
                                className={cn(
                                    "w-full h-full object-contain will-change-transform origin-center", 
                                    isDragging ? "cursor-grabbing" : (isZoomed ? "cursor-grab" : "cursor-zoom-in"),
                                    !isDragging && "transition-transform duration-300 ease-out"
                                )} 
                                style={{ transform: "translate(0px, 0px) scale(1) translateZ(0)" }}
                            />
                        </div>

                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowPopup(false); setIsExpanded(false); resetZoom(); }}
                            title="닫기"
                            className="absolute -top-4 -right-4 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-red-500 hover:bg-red-50 font-bold z-50 transition-colors"
                        >
                            ✕
                        </button>

                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); resetZoom(); }}
                            title={isExpanded ? "기본 크기로 축소" : "창 크게 보기"}
                            className="absolute -top-4 right-8 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center shadow-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 font-bold z-50 transition-colors"
                        >
                            {isExpanded ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M10 10L3 3M14 14l7 7"/></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                            )}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export function ChecklistPanel({ patient }: ChecklistPanelProps) {
  const store = usePatientStoreHydrated();
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [pageStartStep, setPageStartStep] = useState(0);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'records'>('summary'); 

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingGroupRules, setEditingGroupRules] = useState<any[]>([]); // ✨ NEW: 그룹 수정 상태
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");
  const [isIsolated, setIsIsolated] = useState(false); // ✨ NEW: 단일 아이템 분리 여부 상태
  //   // ✨ NEW: 이미지 업로드 관련 상태 및 로직 (복붙, 드래그 지원)
  const [ruleImage, setRuleImage] = useState<string | null>(null);
  const [isRuleImageUploading, setIsRuleImageUploading] = useState(false);
  const ruleFileInputRef = useRef<HTMLInputElement>(null);

  // ✨ NEW: 이동 그래프 팝업 및 업로드 관련 상태
  const [showGraphPopup, setShowGraphPopup] = useState(false);
  const [isGraphImageUploading, setIsGraphImageUploading] = useState(false);
  const graphFileInputRef = useRef<HTMLInputElement>(null);

  const processRuleImageFile = async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setIsRuleImageUploading(true);
      try {
          const compressedBlob = await compressImage(file);
          const storageRef = ref(storage, `patients/${patient.id}/rule_images/${Date.now()}_${file.name || 'pasted_image.png'}`);
          await uploadBytes(storageRef, compressedBlob);
          const url = await getDownloadURL(storageRef);
          setRuleImage(url);
      } catch (error) {
          console.error("Rule image upload error:", error);
          alert("이미지 업로드 실패");
      } finally {
          setIsRuleImageUploading(false);
      }
  };

  const processGraphImageFile = async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      setIsGraphImageUploading(true);
      try {
          const compressedBlob = await compressImage(file);
          const storageRef = ref(storage, `patients/${patient.id}/graph_images/${Date.now()}_${file.name || 'graph.png'}`);
          await uploadBytes(storageRef, compressedBlob);
          const url = await getDownloadURL(storageRef);

          const currentSummary = patient.summary || {};
          if (store) {
               await store.saveSummary(patient.id, {
                    ...currentSummary,
                    graphImage: url
               });
          }
      } catch (error) {
          console.error("Graph image upload error:", error);
          alert("이동 그래프 업로드 실패");
      } finally {
          setIsGraphImageUploading(false);
      }
  };

  const handleRemoveGraphImage = async () => {
      if(confirm("이동 그래프를 삭제하시겠습니까?")) {
           const currentSummary = patient.summary || {};
           if (store) {
                await store.saveSummary(patient.id, {
                     ...currentSummary,
                     graphImage: null
                });
           }
      }
  }

  const handleRuleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processRuleImageFile(file);
      e.target.value = "";
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ruleFormRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [redrawTrigger, setRedrawTrigger] = useState(0);

  const [slides, setSlides] = useState<SlideData[]>([{ id: 1, items: [], penStrokes: [] }]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const SMART_DASHBOARD_INDEX = -999;
  const [smartStage, setSmartStage] = useState(1);

  // ✨ NEW: ALL 모드 상태와 필터링 상태 추가
  const [isAllView, setIsAllView] = useState(false); 
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showCheckedStatus, setShowCheckedStatus] = useState(true); // ✨ 완료 상태 표시 토글
  const [showSmartMemo, setShowSmartMemo] = useState(true); // ✨ NEW: 스마트 서머리 메모 표시 토글
// ✨ NEW: 다중 이미지 선택 및 임포트 제어용 모달 상태
const [importModalConfig, setImportModalConfig] = useState<{
    isOpen: boolean;
    pendingRules: any[];
    timelineImages: string[];
    selectedRuleImages: Record<number, string>; // ruleIndex -> 선택된 이미지(Base64)
    selectedTimelineImage: string | null;
    isUploading: boolean;
    addedCount: number;
    skippedCount: number;
}>({ isOpen: false, pendingRules: [], timelineImages: [], selectedRuleImages: {}, selectedTimelineImage: null, isUploading: false, addedCount: 0, skippedCount: 0 });

// ✨ NEW: 체크리스트 그리드 드래그(페인팅) & 되돌아가기(Backtrack) 상태 관리용 Ref
const gridDragRef = useRef<{ 
    isDragging: boolean, 
    targetKey: string | null, 
    targetAction: boolean | null,
    history: { cardId: string, ruleIds: string[], step: number }[] // 👣 지나간 발자취 기억
}>({
    isDragging: false,
    targetKey: null,
    targetAction: null,
    history: []
});

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

  const [textInput, setTextInput] = useState<{id?: number, x: number, y: number, value: string, width?: number, height?: number} | null>(null);  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, itemId: number } | null>(null);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);

  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [isQuickEdit, setIsQuickEdit] = useState(false);
  const [editBuffer, setEditBuffer] = useState<Record<string, {note: string}>>({});

  const totalSteps = patient.total_steps || 21;

  useEffect(() => {
    const handleNumberInputWheel = (e: WheelEvent) => {
        const target = e.target as HTMLInputElement;
        if (target && target.tagName === 'INPUT' && target.type === 'number') {
            e.preventDefault(); 
            const step = parseFloat(target.step || "1");
            const current = parseFloat(target.value || "0");
            let newValue = current + (e.deltaY < 0 ? step : -step);
            if (target.max) newValue = Math.min(newValue, parseFloat(target.max));
            if (target.min) newValue = Math.max(newValue, parseFloat(target.min));
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            nativeInputValueSetter?.call(target, newValue.toString());
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };
    window.addEventListener('wheel', handleNumberInputWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleNumberInputWheel);
  }, []);

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
  }, [currentSlideIndex]);

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
        const isDropzone = activeEl?.closest('.rule-image-dropzone') || activeEl?.closest('.graph-image-dropzone');
        
// ✨ ESC 키 로직 (체크리스트 그리드 닫기, 편집 모드 해제)
if (e.key === 'Escape') {
    // ✨ NEW: 환자 창이 열려있다면(검색창 존재), 그리드는 ESC에 반응하지 않고 가만히 양보합니다!
    const isPatientSidebarOpen = document.querySelector('input[placeholder="Search name, hospital..."]');
    if (isPatientSidebarOpen) return; 

    if (isGridOpen) {
        setIsGridOpen(false);
        return; 
    }
    if (!isInputActive && !isDropzone) {
        setSelectedRuleIds([]);
        setIsQuickEdit(false);
    }
}

// ✨ NEW: 화면 전환 단축키 (Alt 조합) - 입력창 활성화 전 검사로 꼬임 방지
if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const closeGridOnNavigate = () => { if (isGridOpen) setIsGridOpen(false); };

    switch (e.key.toLowerCase()) {
        case 'q': // ✨ Alt + Q (Checklist Grid - 켜고 끄기 토글)
            e.preventDefault();
            setIsGridOpen(prev => !prev);
            break;
        case 'w': // ✨ Alt + W (Work Summary - 이동 시 그리드는 닫힘)
            e.preventDefault();
            closeGridOnNavigate();
            if (activeTab !== 'summary') setActiveTab('summary');
            setCurrentSlideIndex(0);
            break;
        case 'a': // ✨ Alt + A (Movement Graph - 켜고 끄기 토글)
            e.preventDefault();
            if (patient.summary?.graphImage) setShowGraphPopup(prev => !prev);
            break;
        case 's': // ✨ Alt + S (Smart Summary - 이동 시 그리드는 닫힘)
            e.preventDefault();
            closeGridOnNavigate();
            if (activeTab !== 'summary') setActiveTab('summary');
            setCurrentSlideIndex(SMART_DASHBOARD_INDEX);
            break;
            case 'z': // ✨ Alt + Z (Patients List - 스마트 토글 적용)
            e.preventDefault();
            // 1. 환자 검색창이 화면에 있는지 확인 (사이드바가 열려있다는 증거)
            const searchInput = document.querySelector('input[placeholder="Search name, hospital..."]');
            
            if (searchInput) {
                // 2. 이미 열려있다면 -> 눈에 보이지 않는 가짜 ESC 키를 눌러서 사이드바를 닫음!
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            } else {
                // 3. 닫혀있다면 -> Patients 버튼을 클릭해서 사이드바 열기
                const patientBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent?.includes('Patients'));
                if (patientBtn) (patientBtn as HTMLElement).click();
            }
            break;
                    case 'x': // ✨ Alt + X (Records Tab - 이동 시 그리드는 닫힘)
            e.preventDefault();
            closeGridOnNavigate();
            setActiveTab('records');
            break;
            // ✨ [NEW] Alt + 1: 화면 어디서든 셋업 작업 노트(링크) 열기 & 등록하기
        case '1': 
        e.preventDefault();
        {
            const currentStageId = patient.activeStageId || patient.stages[0].id;
            const currentStage = patient.stages.find((s: any) => s.id === currentStageId);
            const currentLink = currentStage?.externalLink || "";
            
            if (currentLink) {
                // 주소가 있으면 새 창으로 열기
                window.open(currentLink, "_blank", "noopener,noreferrer");
            } else {
                // 주소가 없으면 입력받아서 즉시 저장하기
                const inputLink = prompt(`[${currentStage?.name}]\n이 스테이지의 셋업 작업 노트 URL을 입력하세요 (예: https://...)`, "https://");
                if (inputLink && inputLink.trim() !== "" && inputLink.trim() !== "https://") {
                    let finalLink = inputLink.trim();
                    if (!finalLink.startsWith("http")) finalLink = `https://${finalLink}`;
                    if(store) store.updateStageExternalLink(patient.id, currentStageId, finalLink);
                    alert("✅ 셋업 작업 노트 링크가 서버에 자동 저장되었습니다!");
                }
            }
        }
        break;
    }
    return; // 단축키를 눌렀으면 여기서 끝냄 (아래 텍스트 입력 로직과 충돌 방지)
}

if (isInputActive || isDropzone) return;
if (textInput) return; 

// ✨ Ctrl + S (워크 서머리 탭일 때만 저장)
if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && activeTab === 'summary') {
    e.preventDefault();
    handleSave();
    return;
}
  
if (e.key === 'Delete') {
    // ✨ NEW: 사이드바 룰이 선택되어 있으면 룰 삭제, 아니면 캔버스 아이템 삭제 (포커스 분리로 꼬임 방지)
    if (selectedRuleIds.length > 0) handleDeleteMultiRules();
    else if (selectedIds.length > 0) deleteSelectedItems();
}
          
        if (e.key === 'Delete') {
            // ✨ NEW: 사이드바 룰이 선택되어 있으면 룰 삭제, 아니면 캔버스 아이템 삭제 (포커스 분리로 꼬임 방지)
            if (selectedRuleIds.length > 0) handleDeleteMultiRules();
            else if (selectedIds.length > 0) deleteSelectedItems();
        }
          
        if (activeTab === 'summary' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                      e.preventDefault();
          handleCopy();
        }          
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); handleDuplicate(); }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            // ✨ NEW: 1순위 - 체크리스트 그리드 방향키 제어
            if (isGridOpen) {
                const isPatientSidebarOpen = document.querySelector('input[placeholder="Search name, hospital..."]');
                if (isPatientSidebarOpen) return; // 환자 창이 열려있으면 방향키 조작 양보 (안전장치)

                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setPageStartStep(prev => Math.max(0, prev - 10)); // 0 이하로 안 내려감
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    setPageStartStep(prev => Math.min(totalSteps, prev + 10)); // 마지막 페이지 이상 안 넘어감
                }
                return; // 🛑 핵심: 그리드가 열려있으면 여기서 무조건 끝내서 밑으로(캔버스/스마트 서머리) 절대 안 넘어가게 완벽 차단!
            }

            // 기존: 스마트 서머리 스텝 이동 로직
            if (currentSlideIndex === SMART_DASHBOARD_INDEX) {
                if (e.key === 'ArrowLeft') { e.preventDefault(); setSmartStage(prev => Math.max(0, prev - 1)); }
                if (e.key === 'ArrowRight') { e.preventDefault(); setSmartStage(prev => Math.min(totalSteps, prev + 1)); }
                return;
            }
            
            // 기존: 워크 서머리 도형 이동 로직
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
          const activeEl = document.activeElement;
          const isInputActive = activeEl instanceof HTMLElement && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
          const isDropzone = activeEl?.closest('.rule-image-dropzone') || activeEl?.closest('.graph-image-dropzone');
          if (isInputActive || isDropzone) return;

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
// ✨ NEW: isGridOpen, isQuickEdit, selectedRuleIds 를 추가하여 ESC가 현재 상태를 정확히 인식하도록 수정!
}, [selectedIds, textInput, historyIndex, history, currentSlideIndex, patient.id, clipboard, pasteOffset, items, smartStage, totalSteps, activeTab, isGridOpen, isQuickEdit, selectedRuleIds]);

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

          setToolConfigs((prev: any) => {
              const newConfigs = { ...prev };
              selectedIds.forEach(id => {
                  const it = items.find(i => i.id === id);
                  if (it && newConfigs[it.type]) {
                      newConfigs[it.type] = {
                          ...newConfigs[it.type],
                          [key]: value,
                          ...(it.type === 'text' && key === 'strokeWidth' ? { fontSize: value } : {})
                      };
                  }
              });
              return newConfigs;
          });
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
   
  const confirmText = () => { 
    if (!textInput) return; 
    
    const el = document.getElementById('active-text-editor') as HTMLTextAreaElement;
    const currentText = el ? el.value : textInput.value;
    const trimmedText = currentText.trim(); 
    
    let newItems = [...items]; 
    if (!trimmedText) { 
        if (textInput.id) newItems = newItems.filter(i => i.id !== textInput.id); 
    } else { 
        if (textInput.id) { 
            newItems = newItems.map(i => i.id === textInput.id ? { ...i, text: trimmedText, color: styleSettings.strokeColor, size: styleSettings.fontSize, width: textInput.width, height: textInput.height } : i); 
        } else { 
            newItems.push({ id: Date.now(), type: 'text', text: trimmedText, x: textInput.x, y: textInput.y, color: styleSettings.strokeColor, size: styleSettings.fontSize, zIndex: items.length, width: textInput.width, height: textInput.height }); 
            setSelectedIds([newItems[newItems.length-1].id]); 
        } 
    } 
    updateCurrentSlide(newItems, penStrokes); recordHistory(); setTextInput(null); setCurrentTool('select'); 
  };  
  const handleTextDoubleClick = (item: CanvasItem) => { if (item.type !== 'text') return; setStyleSettings(prev => ({ ...prev, strokeColor: item.color || "#000", fontSize: item.size || 20 })); setTextInput({ id: item.id, x: item.x, y: item.y, value: item.text || "", width: item.width }); setCurrentTool('text'); };
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => { const lines = text.split('\n'); let lineCounter = 0; lines.forEach((line) => { const words = line.split(''); let currentLine = ''; for(let n = 0; n < words.length; n++) { const testLine = currentLine + words[n]; const metrics = ctx.measureText(testLine); if (metrics.width > maxWidth && n > 0) { ctx.fillText(currentLine, x, y + (lineCounter * lineHeight)); currentLine = words[n]; lineCounter++; } else { currentLine = testLine; } } ctx.fillText(currentLine, x, y + (lineCounter * lineHeight)); lineCounter++; }); };
  
  const getPos = (e: React.MouseEvent | MouseEvent | React.DragEvent) => { 
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
    if (textInput && e.target === containerRef.current) confirmText(); 
    if (contextMenu) { setContextMenu(null); return; } 
    
    if (containerRef.current && e.target === containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (e.nativeEvent.offsetX > clientWidth || e.nativeEvent.offsetY > clientHeight) {
            return; 
        }
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
          if (!textInput) setTextInput({ x, y, value: "" }); 
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
    setSelectedRuleIds([]); // ✨ NEW: 캔버스 안의 아이템을 클릭해도 룰 선택을 강제 해제!
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
      setSelectedRuleIds([]); // ✨ NEW: 크기 조절 핸들을 클릭해도 룰 선택을 강제 해제!
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
   
  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => { 
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
            
            let newX = x; let newY = y;
            if (e.shiftKey) {
                const startPt = lastStroke.points[0];
                const dx = Math.abs(x - startPt.x);
                const dy = Math.abs(y - startPt.y);
                let locked = dragState.lockedAxis;
                if (!locked) {
                    locked = dx > dy ? 'x' : 'y';
                    setDragState(d => ({ ...d, lockedAxis: locked }));
                }
                if (locked === 'x') newY = startPt.y;
                else newX = startPt.x;
            } else {
                if (dragState.lockedAxis) setDragState(d => ({ ...d, lockedAxis: null }));
            }

            lastStroke.points = [...lastStroke.points, { x: newX, y: newY }]; 
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
                        nX = init.x + limitedDx; nW = init.width! - limitedDx; nCL = (init.cropL || 0) + limitedDx;
                    } else if (dragState.resizeHandle === 'crop-r') {
                        const minDx = -(init.width! - 10);
                        const limitedDx = Math.max(dx, minDx);
                        nW = init.width! + limitedDx; nCR = (init.cropR || 0) - limitedDx;
                    } else if (dragState.resizeHandle === 'crop-t') {
                        const maxDy = init.height! - 10;
                        const limitedDy = Math.min(dy, maxDy);
                        nY = init.y + limitedDy; nH = init.height! - limitedDy; nCT = (init.cropT || 0) + limitedDy;
                    } else if (dragState.resizeHandle === 'crop-b') {
                        const minDy = -(init.height! - 10);
                        const limitedDy = Math.max(dy, minDy);
                        nH = init.height! + limitedDy; nCB = (init.cropB || 0) - limitedDy;
                    }
                    return { ...item, x: nX, y: nY, width: nW, height: nH, cropL: nCL, cropR: nCR, cropT: nCT, cropB: nCB };

                } else if (dragState.action === 'resize' && dragState.initialItem && item.id === dragState.initialItem.id) { 
                    const init = dragState.initialItem; const dx = x - dragState.startX; const dy = y - dragState.startY; 
                    let newX = init.x, newY = init.y, newW = init.width || 0, newH = init.height || 0; 
                    const aspectRatio = (init.width || 1) / (init.height || 1);
                    if (item.type === 'line') { if (dragState.resizeHandle === 'start') return { ...item, x: x, y: y }; if (dragState.resizeHandle === 'end') return { ...item, x2: x, y2: y }; return item; } 
                    
                    if (item.type === 'text') { 
                        const baseWidth = init.width || 100; 
                        const baseHeight = init.height || (init.size || 20) * 1.5; 
                        
                        let newW = init.width; 
                        let newH = init.height; 
                        
                        if (dragState.resizeHandle?.includes('e')) newW = Math.max(50, baseWidth + dx); 
                        if (dragState.resizeHandle?.includes('w')) { newW = Math.max(50, baseWidth - dx); newX = init.x + dx; } 
                        if (dragState.resizeHandle?.includes('s')) newH = Math.max(20, baseHeight + dy);
                        if (dragState.resizeHandle?.includes('n')) { newH = Math.max(20, baseHeight - dy); newY = init.y + dy; }
                        return { ...item, x: newX, y: newY, width: newW, height: newH }; 
                    }                    
                    if (dragState.resizeHandle?.includes('e')) newW = init.width! + dx; if (dragState.resizeHandle?.includes('w')) { newW = init.width! - dx; newX = init.x + dx; } 
                    if (dragState.resizeHandle?.includes('s')) newH = init.height! + dy; if (dragState.resizeHandle?.includes('n')) { newH = init.height! - dy; newY = init.y + dy; } 
                    if (e.shiftKey && !item.type.includes('text')) {
                        if (dragState.resizeHandle?.includes('e') || dragState.resizeHandle?.includes('w')) { newH = newW / aspectRatio; if (dragState.resizeHandle?.includes('n')) newY = init.y + init.height! - newH; } 
                        else if (dragState.resizeHandle?.includes('n') || dragState.resizeHandle?.includes('s')) { newW = newH * aspectRatio; if (dragState.resizeHandle?.includes('w')) newX = init.x + init.width! - newW; }
                        else { newH = newW / aspectRatio; if (dragState.resizeHandle?.includes('n')) newY = init.y + init.height! - newH; }
                    }
                    
                    if (item.type === 'image') {
                        newW = Math.max(10, newW || 10); 
                        newH = Math.max(10, newH || 10);
                        const safeInitW = Math.max(1, init.width || 1);
                        const safeInitH = Math.max(1, init.height || 1);
                        const scaleX = newW / safeInitW;
                        const scaleY = newH / safeInitH;
                        
                        return { ...item, x: newX || 0, y: newY || 0, width: newW, height: newH, 
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

  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleGlobalMouseUp = () => handleMouseUp();
    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (containerRef.current && containerRef.current.contains(e.target as Node)) return;
        handleMouseMove(e);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }); 

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

// ✨ 여기서부터 복사하세요: 1번 슬라이드를 캡처해서 이동 그래프로 올리는 기능
const handleSaveAsGraph = async () => {
    // 1. 현재 1번 슬라이드(인덱스 0)인지 확인하고, 아니면 튕겨냅니다.
    if (currentSlideIndex !== 0) {
        alert("이동 그래프 등록은 1번 슬라이드에서만 가능합니다. 1번 슬라이드로 이동 후 다시 시도해 주세요.");
        return;
    }

    if (!containerRef.current || !canvasRef.current) return;
    setIsGraphImageUploading(true);

    try {
        // 2. 보이지 않는 가짜 도화지(tempCanvas)를 만들어서 현재 화면을 똑같이 그립니다.
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // 화면에 있는 이미지, 선, 글씨들을 가짜 도화지에 복사하는 과정
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
                ctx.beginPath(); ctx.moveTo(item.x, item.y); ctx.lineTo(item.x2!, item.y2!);
                ctx.strokeStyle = item.color || item.strokeColor || "#000"; ctx.lineWidth = item.size || item.strokeWidth || 3; ctx.stroke();
            } else if (item.type === 'text') {
                ctx.font = `bold ${item.size}px sans-serif`; ctx.fillStyle = item.color || item.strokeColor || "#000"; ctx.textBaseline = 'top';
                wrapText(ctx, item.text || '', item.x, item.y, item.width || 200, (item.size || 20) * 1.2);
            } else if (item.type === 'sticker') {
                ctx.font = `900 ${item.size}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'white';
                ctx.strokeText(item.text||'', item.x+item.width!/2, item.y+item.height!/2); ctx.fillStyle = item.color || '#000'; ctx.fillText(item.text||'', item.x+item.width!/2, item.y+item.height!/2);
            } else if (item.type === 'rect') {
                ctx.beginPath(); ctx.rect(item.x, item.y, item.width!, item.height!); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke();
            } else if (item.type === 'circle') {
                ctx.beginPath(); ctx.ellipse(item.x + item.width!/2, item.y + item.height!/2, Math.abs(item.width!)/2, Math.abs(item.height!)/2, 0, 0, 2 * Math.PI); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke();
            } else if (item.type === 'triangle') {
                ctx.beginPath(); ctx.moveTo(item.x + item.width! / 2, item.y); ctx.lineTo(item.x, item.y + item.height!); ctx.lineTo(item.x + item.width!, item.y + item.height!); ctx.closePath(); if (item.fillColor && item.fillColor !== 'transparent') { ctx.fillStyle = item.fillColor; ctx.fill(); } ctx.strokeStyle = item.strokeColor || "#000"; ctx.lineWidth = item.strokeWidth || 3; ctx.stroke();
            }
        }
        ctx.drawImage(canvasRef.current, 0, 0);
        
        // 3. 다 그려진 도화지를 이미지 파일로 바꿔서 파이어베이스에 업로드합니다.
        const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) throw new Error("Blob 변환 실패");

        const storageRef = ref(storage, `patients/${patient.id}/graph_images/canvas_graph_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);

        // 4. 저장된 이미지 URL을 이동 그래프(graphImage) 데이터로 덮어씌웁니다.
        const currentSummary = patient.summary || {};
        if (store) {
            await store.saveSummary(patient.id, {
                 ...currentSummary,
                 graphImage: url
            });
        }
        alert("1번 슬라이드가 이동 그래프로 성공적으로 등록되었습니다!");
    } catch (error) {
        console.error("Graph capture error:", error);
        alert("이동 그래프 캡처 및 등록에 실패했습니다.");
    } finally {
        setIsGraphImageUploading(false);
    }
};
// ✨ 여기까지 복사하세요!

  const handleSave = async () => { 
      if (!containerRef.current || !canvasRef.current) return; 
      const tempCanvas = document.createElement('canvas'); 
      tempCanvas.width = canvasRef.current.width; 
      tempCanvas.height = canvasRef.current.height; 
      const ctx = tempCanvas.getContext('2d'); 
      if (!ctx) return; 
      ctx.fillStyle = 'white'; 
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height); 
      
      if (currentSlideIndex !== SMART_DASHBOARD_INDEX) {
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
                  ctx.font = `900 ${item.size}px sans-serif`;
                  ctx.textAlign='center'; 
                  ctx.textBaseline='middle'; 
                  ctx.lineWidth = 3;
                  ctx.strokeStyle = 'white';
                  ctx.strokeText(item.text||'', item.x+item.width!/2, item.y+item.height!/2);
                  ctx.fillStyle = item.color || '#000'; 
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
      }
      
      if (!store) return; 

      // 1. 캔버스 이미지를 거대한 텍스트(Base64)가 아닌, 진짜 이미지 파일 형태(Blob)로 변환합니다.
      tempCanvas.toBlob(async (blob) => {
          if (!blob) {
              alert("이미지 변환에 실패했습니다.");
              return;
          }

          try {
              // 2. Firebase Storage에 'summary_현재시간.png' 라는 이름으로 파일 업로드를 지시합니다.
              const storageRef = ref(storage, `patients/${patient.id}/summary_images/summary_${Date.now()}.png`);
              await uploadBytes(storageRef, blob);
              
              // 3. 업로드가 완료되면, 그 사진을 볼 수 있는 인터넷 주소(URL)를 받아옵니다.
              const imageUrl = await getDownloadURL(storageRef);

              // 4. Firestore 데이터베이스에는 1MB짜리 텍스트 대신, 깔끔한 짧은 주소(URL)만 저장합니다!
              const currentSummary = patient.summary || {};
              await store.saveSummary(patient.id, { 
                  ...currentSummary,
                  image: imageUrl, 
                  memo: JSON.stringify({ slides }) 
              }); 
              alert("Saved!"); 

          } catch (error) {
              console.error("Summary save error:", error);
              alert("저장 중 문제가 발생했습니다.");
          }
      }, 'image/png');
      };

  const toggleTooth = (t: string) => setSelectedTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  
  const handleImportData = async () => {
    if (!store) return;
    try {
        const clipboardText = await navigator.clipboard.readText();
        const parsedData = JSON.parse(clipboardText);

        if (!Array.isArray(parsedData) || parsedData.length === 0) {
            alert("유효한 임포트 데이터가 아닙니다.");
            return;
        }

        const isNewSetup = confirm("이 데이터는 '신규 셋업' 입니까?\n\n[확인]을 누르면 0단계(PRE)부터 시작합니다.\n[취소]를 누르면 1단계부터 시작합니다.");
        const defaultStartStep = isNewSetup ? 0 : 1;

        let addedCount = 0;
        let skippedCount = 0;
        const pendingRules: any[] = [];
        let timelineImages: string[] = [];

        const typeMapping: Record<string, string> = {
            "ABP": "Bite Ramp", "BC": "BC", "BOS": "BOS",
            "Class 1 elastic": "X", "Class 2 elastic": "X", "Class 3 elastic": "X",
            "MFT": "X", "Mini implant": "X", "ML elastic": "X",
            "MTA": "BC", "PBB": "Bite Ramp", "Power chain": "BC",
            "Power ridge": "Power ridge", "Power ridge Couple": "Power ridge",
            "Vertical ridge": "Vertical ridge", "Vertical ridge Couple": "Vertical ridge"
        };

        for (const item of parsedData) {
            if (item.category === "Timeline" && item.images && item.images.length > 0) {
                timelineImages = [...timelineImages, ...item.images];
                continue;
            }

            if (item.category === "부가력") {
                const rawType = item.type || "";
                const mappedType = typeMapping[rawType] !== undefined ? typeMapping[rawType] : rawType;
                if (mappedType === "X") { skippedCount++; continue; }

                let start = defaultStartStep; let end = totalSteps; let extractedNote = "";
                const memo = item.memo_upper || item.memo_lower || "";
                const match = memo.match(/(\d+)단계-(끝|\d+)단계\s*:\s*(.*)/);
                if (match) {
                    start = parseInt(match[1], 10); end = match[2] === '끝' ? totalSteps : parseInt(match[2], 10); extractedNote = match[3].trim();
                } else { extractedNote = memo.trim(); }

                const teeth = item.teeth && item.teeth.length > 0 ? item.teeth.map(Number) : [0];
                const finalType = mappedType || "기타";
                const extractedImages = item.images || [];

                // ✨ NEW: 치아 배열(teeth)을 분리하지 않고 그룹으로 유지, isActive(활성화 여부) 속성 추가
                pendingRules.push({ type: finalType, startStep: start, endStep: end, note: extractedNote, teeth: teeth, isActive: true, isIsolated: false, availableImages: extractedImages });
                addedCount++;
            } else if (item.category === "AT") {
                let start = defaultStartStep;
                const stageMatch = item.stage_step?.match(/(\d+)\s*Step/i);
                if (stageMatch) { start = parseInt(stageMatch[1], 10); }
                const extractedNote = item.memo || "기존 AT는 모두 그대로 사용합니다.";
                const teeth = item.teeth && item.teeth.length > 0 ? item.teeth.map(Number) : [0];
                const extractedImages = item.images || [];

                // ✨ NEW: 그룹 유지 및 isActive 부여
                pendingRules.push({ type: "Attachment", startStep: start, endStep: start, note: extractedNote, teeth: teeth, isActive: true, isIsolated: false, availableImages: extractedImages });
                addedCount++;
            }
        }

// ✨ NEW: 첫 번째 이미지가 존재하면 기본으로 선택 상태로 세팅
const initialSelectedImages: Record<number, string> = {};
pendingRules.forEach((rule, idx) => {
    if (rule.availableImages && rule.availableImages.length > 0) {
        // 각 룰의 첫 번째(0번 인덱스) 이미지를 미리 선택 상태로 저장
        initialSelectedImages[idx] = rule.availableImages[0];
    }
});

setImportModalConfig({
    isOpen: true, 
    pendingRules, 
    timelineImages, 
    selectedRuleImages: initialSelectedImages, // ✨ 텅 빈 {} 대신 초기값 주입
    selectedTimelineImage: timelineImages.length > 0 ? timelineImages[0] : null,
    isUploading: false, 
    addedCount, 
    skippedCount
});

} catch (error) {
console.error("Import Error:", error);
alert("클립보드 데이터를 읽어오지 못했거나 올바른 데이터가 아닙니다.");
}
};

const executeFinalImport = async () => {
    if (!store) return;
    setImportModalConfig(p => ({ ...p, isUploading: true }));

    const base64ToBlobFallback = (base64Str: string): Blob => {
        const parts = base64Str.split(';base64,');
        const contentType = parts[0].replace('data:', '') || 'image/png';
        const raw = window.atob(parts[1] || parts[0]);
        const uInt8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) { uInt8Array[i] = raw.charCodeAt(i); }
        return new Blob([uInt8Array], { type: contentType });
    };

    const compressImageToWebp = async (base64Str: string): Promise<Blob> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        resolve(blob || base64ToBlobFallback(base64Str));
                    }, 'image/webp', 0.8); 
                } else {
                    resolve(base64ToBlobFallback(base64Str));
                }
            };
            img.onerror = () => resolve(base64ToBlobFallback(base64Str));
            img.src = base64Str;
        });
    };

    try {
        if (importModalConfig.selectedTimelineImage) {
            const blob = await compressImageToWebp(importModalConfig.selectedTimelineImage);
            const storageRef = ref(storage, `patients/${patient.id}/graph_images/imported_${Date.now()}.webp`);
            await uploadBytes(storageRef, blob);
            const url = await getDownloadURL(storageRef);
            const currentSummary = patient.summary || {};
            await store.saveSummary(patient.id, { ...currentSummary, graphImage: url });
        }

        // ✨ NEW: 체크 해제(비활성화)된 룰은 제외하고 활성화(isActive: true)된 룰만 필터링
        const activeRules = importModalConfig.pendingRules.filter(r => r.isActive);
        let actualAddedCount = 0;

        for (let i = 0; i < activeRules.length; i++) {
            // 원본 인덱스를 찾아야 선택된 이미지를 정확히 매핑할 수 있음
            const originalIndex = importModalConfig.pendingRules.indexOf(activeRules[i]);
            let baseRuleData = { ...activeRules[i] };
            
            // DB에 넣기 전 불필요한 찌꺼기 속성 제거
            delete baseRuleData.availableImages;
            delete baseRuleData.isActive;
            const teethArray = baseRuleData.teeth || [0];
            delete baseRuleData.teeth; 

            let uploadedImageUrl = null;
            const selectedImageForThisRule = importModalConfig.selectedRuleImages[originalIndex];
            
            // ✨ 그룹당 이미지는 딱 1번만 WebP로 최적화하여 업로드
            if (selectedImageForThisRule) {
                const blob = await compressImageToWebp(selectedImageForThisRule);
                const storageRef = ref(storage, `patients/${patient.id}/rule_images/imported_rule_${Date.now()}_${originalIndex}.webp`);
                await uploadBytes(storageRef, blob);
                uploadedImageUrl = await getDownloadURL(storageRef);
            }

            // ✨ DB에는 치아별로 쪼개서 넣되, 1번만 올린 동일한 이미지 주소(URL)를 재사용
            for (const t of teethArray) {
                const finalRule = { ...baseRuleData, tooth: t };
                if (uploadedImageUrl) finalRule.imageUrl = uploadedImageUrl;
                await store.addRule(patient.id, finalRule);
                actualAddedCount++;
            }
        }

        alert(`✅ 임포트 완료!\n총 ${actualAddedCount}개 항목이 데이터베이스에 등록되었습니다.`);
        setImportModalConfig(p => ({ ...p, isOpen: false, isUploading: false }));

    } catch (err) {
        console.error("Upload error during import:", err);
        alert("이미지 업로드 중 오류가 발생했습니다.");
        setImportModalConfig(p => ({ ...p, isUploading: false }));
    }
};

const handleSaveRules = async () => { 
    const finalType = selectedType === "기타" ? customType : selectedType; 
    const teethToSave = selectedTeeth.length === 0 ? [0] : selectedTeeth.map(t => parseInt(t)); 
    
    const ruleData: any = { 
        type: finalType, 
        startStep, 
        endStep, 
        note,
        isIsolated 
    };
    if (ruleImage) ruleData.imageUrl = ruleImage;

    if (editingGroupRules.length > 0) {
        // ✨ NEW: 다중 치아 동시 수정 & 완벽한 2개/2개 분리(Split) 방어 로직
        if (!store) return;
        const originalTeeth = editingGroupRules.map(r => r.tooth);
        const addedTeeth = teethToSave.filter(t => !originalTeeth.includes(t));
        const removedTeeth = originalTeeth.filter(t => !teethToSave.includes(t));

        for (const r of editingGroupRules) {
            if (teethToSave.includes(r.tooth)) {
                await store.updateRule(patient.id, { ...r, ...ruleData, tooth: r.tooth });
            }
            // ✨ 핀셋 수정: 제외된 치아(removedTeeth)는 억지로 개별 포장하지 않고 가만히 둡니다.
            // 그러면 기존의 데이터를 공유하므로 자기들끼리 완벽하게 하나의 그룹으로 남게 됩니다!
        }
                for (const tooth of addedTeeth) {
            await store.addRule(patient.id, { ...ruleData, tooth });
        }
        setEditingRuleId(null);
        setEditingGroupRules([]);
    } else if (editingRuleId) { 
        if(store) await store.updateRule(patient.id, { id: editingRuleId, ...ruleData, tooth: teethToSave[0] }); 
        setEditingRuleId(null); 
    } else { 
        for (const tooth of teethToSave) { 
            if(store) await store.addRule(patient.id, { ...ruleData, tooth }); 
        } 
    } 
    setSelectedTeeth([]); 
    setNote(""); 
    setRuleImage(null); 
    setIsIsolated(false); 
    if (selectedType === "기타") setCustomType(""); 
};

const handleEditClick = (e: React.MouseEvent, rule: Rule) => { 
    e.stopPropagation(); 

    // ✨ NEW: 그룹으로 묶인 멤버들 찾아내기
    const groupMembers = (!(rule as any).isIsolated) ? safeRules.filter((r: Rule) => 
        !(r as any).isIsolated && 
        r.type === rule.type && 
        (r.note || "") === (rule.note || "") && 
        r.startStep === rule.startStep && 
        r.endStep === rule.endStep
    ) : [rule];

    let isGroupEdit = false;
    if (groupMembers.length > 1) {
        if (window.confirm("이 항목은 그룹으로 묶여있습니다.\n[확인]을 누르면 그룹 전체를 동시에 수정하고,\n[취소]를 누르면 이 항목만 단독으로 수정(분리)합니다.")) {
            isGroupEdit = true;
        }
    }

    setEditingRuleId(rule.id); 
    if (isGroupEdit) {
        setEditingGroupRules(groupMembers);
        const teeth = groupMembers.map((r: any) => r.tooth).filter((t: number) => t !== 0).map(String);
        setSelectedTeeth(teeth);
    } else {
        setEditingGroupRules([]);
        setSelectedTeeth(rule.tooth === 0 ? [] : [rule.tooth.toString()]); 
    }

    if (PRESET_TYPES.includes(rule.type)) { setSelectedType(rule.type); setCustomType(""); } 
    else { setSelectedType("기타"); setCustomType(rule.type); } 
    setStartStep(rule.startStep); 
    setEndStep(rule.endStep); 
    setNote(rule.note || ""); 
    setRuleImage(rule.imageUrl || null); 
    setIsIsolated((rule as any).isIsolated || false); 
    
    if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

const cancelEdit = () => { 
    setEditingRuleId(null); setEditingGroupRules([]); setSelectedTeeth([]); setNote(""); setStartStep(1); setEndStep(10); setRuleImage(null); setIsIsolated(false); 
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

// ✨ 1번 요청 반영: 치식 번호 정렬 전에, Type으로 먼저 정렬하도록 수정
const getRulesForStep = (step: number) => (patient.rules || [])
.filter((r: Rule) => step >= r.startStep && step <= r.endStep)
.sort((a: Rule, b: Rule) => {
    // ✨ NEW: #MAX(10) 또는 #MAN(30) 아이템이 있다면 무조건 맨 위로 배치
    const aIsFullArch = a.tooth === 10 || a.tooth === 30;
    const bIsFullArch = b.tooth === 10 || b.tooth === 30;
    
    if (aIsFullArch && !bIsFullArch) return -1;
    if (!aIsFullArch && bIsFullArch) return 1;

    // 기존 정렬 로직 유지 (Type 가나다순 -> 이후 치식 번호순)
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.tooth - b.tooth;
});
  
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
   
// ✨ 2번 요청 반영: 풀 체크리스트 그리드 전용 - 동일 타입+노트 병합 함수
const mergeRules = (rules: Rule[]) => {
    const mergedMap = new Map<string, any>();
    rules.forEach(r => {
        // ✨ NEW: '단일 아이템(isIsolated)' 체크된 항목만 개별 고유 키를 부여하여 묶이지 않게 함 (어태치먼트는 기본 병합 유지)
        const key = (r as any).isIsolated ? `isolated_${r.id}` : `${r.type}_${r.note || ""}`;
        
        if (!mergedMap.has(key)) {
            mergedMap.set(key, { ...r, teeth: [], ruleIds: [] });
        }
        const group = mergedMap.get(key);
        if (r.tooth !== 0 && !group.teeth.includes(r.tooth)) group.teeth.push(r.tooth);
        group.ruleIds.push(r.id);
    });
    const mergedArray = Array.from(mergedMap.values());
    mergedArray.forEach((m: any) => m.teeth.sort((a: number, b: number) => a - b));
    return mergedArray;
};

// ✨ 2번 요청 반영: 병합된 카드를 처리할 수 있도록 렌더링 로직 수정 (드래그 연속 체크 + 되돌아가기 기능 추가)
const renderCard = (mergedGroup: any, step: number, isTiny = false) => { 
    const checked = mergedGroup.ruleIds.every((id: string) => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === id && s.checked)); 
    const status = (step === mergedGroup.startStep) ? "NEW" : (step === mergedGroup.endStep ? "REMOVE" : "CHECK"); 
     
    // 타겟 고정을 위한 고유 식별 키 (동일한 종류의 카드만 드래그 허용)
    const targetKey = mergedGroup.isIsolated ? `isolated_${mergedGroup.id}` : `${mergedGroup.type}_${mergedGroup.note || ""}`;
    // 현재 카드의 고유 좌표 (스텝 + 아이디)
    const cardId = `${step}_${mergedGroup.id}`; 

    // 클릭 및 드래그 시 체크 상태를 변경하는 공통 함수 (특정 타겟을 지정할 수 있도록 확장)
    const performToggle = (forceAction?: boolean, specificRuleIds?: string[], specificStep?: number) => {
        if (!store) return;
        const rIds = specificRuleIds || mergedGroup.ruleIds;
        const stp = specificStep !== undefined ? specificStep : step;
        
        const targetChecked = forceAction !== undefined ? forceAction : !checked;
        rIds.forEach((id: string) => {
            const isItemChecked = patient.checklist_status.some((s: any) => s.step === stp && s.ruleId === id && s.checked);
            if (targetChecked !== isItemChecked) {
                store.toggleChecklistItem(patient.id, stp, id);
            }
        });
    };

    // 🖱️ 마우스 클릭 시 (드래그 시작)
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); 
        const targetAction = !checked; 
        gridDragRef.current = { 
            isDragging: true, 
            targetKey, 
            targetAction,
            history: [{ cardId, ruleIds: mergedGroup.ruleIds, step }] // 👣 첫 발자취 기록
        };
        performToggle(targetAction);
    };

    // 🖱️ 마우스가 들어올 때 (드래그 진행 중 & 되돌아가기 판정)
    const handleMouseEnter = (e: React.MouseEvent) => {
        const dragState = gridDragRef.current;
        
        // 드래그 중이고, 동일한 종류의 카드일 때만 작동 (타겟 락온)
        if (dragState.isDragging && dragState.targetKey === targetKey) {
            const history = dragState.history;
            
            // ⏪ 1. 뒤로 돌아간 경우 (Backtrack 판정: 내 발자취의 '끝에서 두 번째'와 현재 카드가 같다면)
            if (history.length >= 2 && history[history.length - 2].cardId === cardId) {
                // 방금 전 밟았던 마지막 카드를 뽑아내서 원상복구(Revert) 시킴!
                const lastCard = history.pop();
                if (lastCard) {
                    performToggle(!dragState.targetAction!, lastCard.ruleIds, lastCard.step);
                }
            } 
            // ⏩ 2. 새로운 카드로 전진한 경우
            else if (history.length === 0 || history[history.length - 1].cardId !== cardId) {
                performToggle(dragState.targetAction!);
                history.push({ cardId, ruleIds: mergedGroup.ruleIds, step }); // 👣 새 발자취 추가
            }
        }
    };

    return ( 
        <div key={mergedGroup.id} 
             onMouseDown={handleMouseDown}
             onMouseEnter={handleMouseEnter}
             className={cn("rounded cursor-pointer flex flex-col relative border select-none transition-all", isTiny ? "p-1.5 mb-1.5" : "p-3 mb-2", checked ? "bg-slate-50 border-green-500 ring-1 ring-green-500 text-slate-400" : "bg-white hover:ring-2 hover:ring-blue-200 border-slate-200", status === "NEW" && !checked && "border-l-4 border-l-green-500", status === "REMOVE" && !checked && "border-r-4 border-r-red-500")}> 
            
            {/* 1. 아이템 이름 (Type) & 체크박스 */}
            <div className="flex justify-between items-start mb-1.5 pointer-events-none">
                <div className={cn("font-extrabold truncate pr-1", getTypeColor(mergedGroup.type), isTiny ? "text-[11px]" : "text-sm")}>
                    {mergedGroup.type}
                </div>
                <div className={cn("w-4 h-4 border rounded flex items-center justify-center transition-colors shrink-0", checked ? "bg-green-500 border-green-500" : "bg-white")}>
                    {checked && <CheckCheck className="text-white w-3 h-3"/>}
                </div>
            </div> 

            {/* 2. 치식 번호 (세로 나열, 직각 네모 배지 및 상/하악 색상 적용) */}
            <div className="flex flex-col items-start gap-1 mb-1.5 pointer-events-none">
                  {mergedGroup.tooth === 0 ? (
                      <div className={cn("px-1.5 py-0.5 font-bold rounded-[2px] border", isTiny ? "text-[9px]" : "text-[11px]", "bg-slate-100 text-slate-600 border-slate-200")}>
                          Gen
                      </div>
                  ) : mergedGroup.teeth.map((t: number) => {
                      const isUpper = t >= 10 && t < 30;
                      const isMax = t === 10;
                      const isMan = t === 30;
                      return (
                          <div 
                              key={t} 
                              className={cn(
                                  "px-1.5 py-0.5 font-bold rounded-[2px]", 
                                  isTiny ? "text-[9px]" : "text-[11px]",
                                  (isMax || isMan)
                                  ? cn(
                                      "bg-white border-[1.5px]", 
                                      isMax ? "text-blue-400 border-blue-400" : "text-orange-400 border-orange-400"
                                  )
                                  : cn(
                                          "border", 
                                          isUpper 
                                              ? "bg-blue-50/70 text-blue-600 border-blue-200"  
                                              : "bg-red-50/70 text-red-600 border-red-200"     
                                      )
                              )}
                          >
                              {isMax ? "#MAX" : isMan ? "#MAN" : `#${t}`}
                          </div>
                      );
                  })}
            </div>

            {/* 3. 메모 */}
            {mergedGroup.note && (
                <div className={cn(
                    "whitespace-pre-wrap break-words leading-tight rounded mt-auto pointer-events-none",
                    isTiny ? "text-[9px] p-0.5" : "text-[11px] p-1.5",
                    "bg-orange-50 text-slate-700 font-medium border border-orange-100/50"
                )}>
                    {mergedGroup.note}
                </div>
            )} 
        </div> 
    ); 
};

const renderFullScreenGrid = () => { 
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i); 
    
    return ( 
        <div 
            className="fixed inset-0 z-[9999] bg-slate-100 flex flex-col animate-in fade-in"
            onMouseUp={() => { gridDragRef.current.isDragging = false; }}
            onMouseLeave={() => { gridDragRef.current.isDragging = false; }}
        >              
        <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm shrink-0"> 
                  <h2 className="text-2xl font-bold flex items-center gap-2"><Layout className="text-blue-600"/> Full Checklist Grid</h2> 
                  <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setPageStartStep(Math.max(0, pageStartStep - 10))}>Prev 10</Button>
                      <Button variant="outline" onClick={() => setPageStartStep(Math.min(totalSteps, pageStartStep + 10))}>Next 10</Button>
                      <Button variant="destructive" onClick={() => setIsGridOpen(false)}>Close</Button>
                  </div> 
              </div> 
              <div className="flex-1 p-6 overflow-auto bg-slate-50"> 
                  <div className="mb-8 min-w-[1400px] flex flex-col gap-2"> 
                      
                      <div className="grid grid-cols-10 gap-3">
                          {stepsToShow.map((step) => { 
                              if (step > totalSteps) return <div key={`header-blank-${step}`} className="opacity-0 w-full"/>; 
                              
                              const { genRules, upperRules, lowerRules, attRules } = getGroupedRules(step); 
                              const allRulesInStep = [...genRules, ...upperRules, ...lowerRules, ...attRules]; 
                              const isStepComplete = allRulesInStep.length > 0 && allRulesInStep.every(r => patient.checklist_status.some((s: any) => s.step === step && s.ruleId === r.id && s.checked)); 
                              return (
                                  <div key={`header-${step}`} className={cn("p-2 font-bold text-xs text-center rounded-lg border flex justify-between items-center transition-colors", isStepComplete ? "bg-blue-600 text-white border-blue-600 shadow-md" : (step===0?"bg-yellow-100":"bg-white"))}>
                                      <span>{step===0?"PRE":`STEP ${step}`}</span>
                                      {step<=totalSteps && <button onClick={()=>store && store.checkAllInStep(patient.id,step)} className={cn("rounded hover:bg-black/10 p-0.5", isStepComplete && "text-white")}><CheckSquare className="w-3.5 h-3.5"/></button>}
                                  </div> 
                              );
                          })}
                      </div>

                      <div className="grid grid-cols-10 gap-3">
                          {stepsToShow.map((step) => {
                              if (step > totalSteps) return <div key={`gen-blank-${step}`} className="opacity-0 w-full"/>; 
                              const { genRules } = getGroupedRules(step);
                              return (
                                  <div key={`gen-${step}`} className="bg-white rounded-lg p-1 border flex flex-col h-full">
                                      <div className="text-[9px] font-bold text-slate-400 px-1 mb-1">GENERAL</div>
                                      <div className="flex-1">{mergeRules(genRules).map((g: any) => renderCard(g, step, true))}</div>
                                  </div>
                              );
                          })}
                      </div>

                      <div className="grid grid-cols-10 gap-3">
                          {stepsToShow.map((step) => {
                              if (step > totalSteps) return <div key={`max-blank-${step}`} className="opacity-0 w-full"/>; 
                              const { upperRules } = getGroupedRules(step);
                              return (
                                  <div key={`max-${step}`} className="bg-white rounded-lg p-1 border flex flex-col h-full">
                                      <div className="text-[9px] font-bold text-blue-400 px-1 mb-1">MAXILLA</div>
                                      <div className="flex-1">{mergeRules(upperRules).map((g: any) => renderCard(g, step, true))}</div>
                                  </div>
                              );
                          })}
                      </div>

                      <div className="grid grid-cols-10 gap-3">
                          {stepsToShow.map((step) => {
                              if (step > totalSteps) return <div key={`man-blank-${step}`} className="opacity-0 w-full"/>; 
                              const { lowerRules } = getGroupedRules(step);
                              return (
                                  <div key={`man-${step}`} className="bg-white rounded-lg p-1 border flex flex-col h-full">
                                      <div className="text-[9px] font-bold text-orange-400 px-1 mb-1">MANDIBLE</div>
                                      <div className="flex-1">{mergeRules(lowerRules).map((g: any) => renderCard(g, step, true))}</div>
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
                                      <div className="p-1 flex-1">{mergeRules(attRules).map((g: any) => renderCard(g, step, true))}</div> 
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
  const maxillaRules = safeRules.filter((r:Rule) => r.tooth >= 10 && r.tooth <= 28);
  const mandibleRules = safeRules.filter((r:Rule) => r.tooth >= 30 && r.tooth <= 48);
  const generalRules = safeRules.filter((r:Rule) => r.tooth === 0);

  const handleRulesDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const action = e.dataTransfer.getData("action");
      if (action === "delete_rules") handleDeleteMultiRules();
  };

  const isTextSelected = currentTool === 'text' || (currentTool === 'select' && selectedIds.length > 0 && items.some(i => selectedIds.includes(i.id) && i.type === 'text'));
  const isShapeSelected = ['draw', 'line', 'rect', 'circle', 'triangle', 'highlighter', 'eraser'].includes(currentTool) || (currentTool === 'select' && selectedIds.length > 0 && items.some(i => selectedIds.includes(i.id) && i.type !== 'text' && i.type !== 'image' && i.type !== 'sticker'));

  return (
    <>
      <div className="flex min-h-screen">
        
        <div className="w-[360px] border-r bg-white flex flex-col h-screen sticky top-0 overflow-y-auto shrink-0 relative z-0">
           {activeTab === 'summary' ? (
               <>
{/* ✨ NEW: Rule Definition 텍스트 우측에 이질감 없이 임포트 버튼 핀셋 추가 */}
<div ref={ruleFormRef} className={cn("p-4 border-b shrink-0 transition-colors duration-500 flex justify-between items-center", editingRuleId ? "bg-orange-50 border-orange-200" : "bg-slate-50")}>
               <h2 className="font-bold flex items-center gap-2">{editingRuleId ? <><Pencil className="w-4 h-4 text-orange-500"/> Editing Rule</> : "Rule Definition"}</h2>
               {!editingRuleId && (
                   <Button variant="outline" size="sm" onClick={handleImportData} className="h-7 text-xs flex items-center gap-1.5 border-slate-300 text-slate-600 hover:bg-slate-100 shadow-sm" title="클립보드 데이터 임포트">
                       <Clipboard className="w-3.5 h-3.5"/> 데이터 붙여넣기
                   </Button>
               )}
           </div>

           <div ref={scrollContainerRef} className="p-4 space-y-4 overflow-y-auto flex-1 scroll-smooth">
           <div className="space-y-1">
                 <div className="flex items-center justify-between">
                     <Label className="text-xs font-bold text-slate-500">Item Type</Label>
                     {/* ✨ NEW: Item Type 우측 단일 아이템 체크박스 추가 */}
                     <label className="flex items-center gap-1.5 cursor-pointer group">
                         <input 
                             type="checkbox" 
                             checked={isIsolated} 
                             onChange={(e) => setIsIsolated(e.target.checked)}
                             className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                         />
                         <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-600 transition-colors">단일 아이템</span>
                     </label>
                 </div>
                 <select className="w-full border p-2 rounded" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                    {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
                 {selectedType === "기타" && <input className="w-full border p-2 rounded mt-1 text-sm bg-yellow-50" placeholder="직접 입력하세요..." value={customType} onChange={(e) => setCustomType(e.target.value)} />}
              </div>
                            <div className="space-y-1"><Label className="text-xs font-bold text-slate-500">Select Teeth</Label><ToothGrid selectedTeeth={selectedTeeth} onToggle={toggleTooth} /></div>
              <div className="flex gap-2">
                 <div className="flex-1"><Label className="text-xs font-bold text-slate-500">Start</Label><input type="number" className="w-full border p-2 rounded" value={startStep} onChange={(e) => setStartStep(Number(e.target.value))} onWheel={(e) => e.preventDefault()} /></div>
                 <div className="flex-1"><Label className="text-xs font-bold text-slate-500">End</Label><div className="flex gap-1"><input type="number" className="w-full border p-2 rounded" value={endStep} onChange={(e) => setEndStep(Number(e.target.value))} onWheel={(e) => e.preventDefault()} /><Button variant="outline" className="px-2 text-xs" onClick={() => setEndStep(totalSteps)}>End</Button></div></div>
              </div>              
              <div className="space-y-1"><Label className="text-xs font-bold text-slate-500">Note</Label><input className="w-full border p-2 rounded" placeholder="e.g. Mesial" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              
{/* ✨ NEW: 레퍼런스 사진 업로드 영역 (드래그, 복붙 지원 - rule-image-dropzone 클래스 추가됨) */}
              <div 
                  className="space-y-2 p-3 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 transition-all focus-within:border-blue-400 focus-within:bg-blue-50/50 hover:bg-slate-100 outline-none rule-image-dropzone"
                  tabIndex={0}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) processRuleImageFile(file);
                  }}
                  onPaste={(e) => {
                      const file = e.clipboardData.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                          e.preventDefault(); e.stopPropagation();
                          processRuleImageFile(file);
                      }
                  }}
              >
                  <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-slate-500">Reference Image</Label>
                      <span className="text-[9px] font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">Ctrl+V / Drop</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                      <input type="file" accept="image/*" className="hidden" ref={ruleFileInputRef} onChange={handleRuleImageUpload} />
                      <Button variant="outline" size="sm" onClick={() => !isRuleImageUploading && ruleFileInputRef.current?.click()} disabled={isRuleImageUploading} className="flex-1 bg-white text-slate-500 hover:text-slate-700 h-9 border-slate-300">
                          {isRuleImageUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <ImageIcon className="w-4 h-4 mr-1"/>}
                          {ruleImage ? "사진 변경" : "클릭하여 첨부"}
                      </Button>
                      {ruleImage && (
                          <div className="relative w-9 h-9 shrink-0 border border-slate-200 rounded-md group overflow-hidden shadow-sm">
                              <img src={ruleImage} className="w-full h-full object-cover" alt="Rule Ref" />
                              <button onClick={() => setRuleImage(null)} className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4"/></button>
                          </div>
                      )}
                  </div>
              </div>

              <div className="flex gap-2 mt-2">                                
                {editingRuleId && <Button variant="outline" onClick={cancelEdit} className="flex-1">Cancel</Button>}
                <Button onClick={handleSaveRules} className={cn("flex-1 gap-2", editingRuleId ? "bg-orange-500 hover:bg-orange-600" : "")}>{editingRuleId ? <><Save className="w-4 h-4"/> Update</> : <><Plus className="w-4 h-4"/> Add Rule</>}</Button>
              </div>
              
              <hr className="my-4"/>
              
              <div className="space-y-4 pb-10">
                 <div className="flex items-center justify-between">
                     <h3 className="text-xs font-bold text-slate-500 uppercase">Existing Rules ({safeRules.length})</h3>
                     <div className="flex gap-1.5 flex-wrap">
                         {selectedRuleIds.length > 0 && !isQuickEdit && (
                             <>
                                 <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-slate-300 text-slate-600 hover:bg-slate-100" onClick={() => setSelectedRuleIds([])}>
                                     <X className="w-3 h-3 mr-1"/> 선택 해제
                                 </Button>
                                 <Button size="sm" variant="destructive" className="h-7 text-[10px] px-2" onClick={handleDeleteMultiRules}>
                                     <Trash2 className="w-3 h-3 mr-0.5"/> 선택 삭제
                                 </Button>
                             </>
                         )}
                         {isQuickEdit ? (
                             <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleSaveQuickEdit}><Check className="w-3 h-3 mr-1"/> 완료</Button>
                         ) : (
                             selectedRuleIds.length === 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsQuickEdit(true)}><Pencil className="w-3 h-3 mr-1"/> 빠른 편집</Button>
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
                                                setSelectedIds([]); // ✨ NEW: 룰을 클릭하면 캔버스 아이템 선택은 자동 해제 (충돌 방지)
                                            }
                                        }}
                                                                                  className={cn("text-xs border p-2 rounded flex items-center group transition-colors", isSelected ? "bg-blue-50 border-blue-300 ring-1 ring-blue-500" : "bg-white", !isQuickEdit && "cursor-pointer")}>
                                         
                                         {!isQuickEdit && (
                                             <input type="checkbox" className="mr-2 pointer-events-none w-3.5 h-3.5" checked={isSelected} readOnly />
                                         )}

<div className="flex-1 overflow-hidden pointer-events-none">
                                         <div className="flex items-center gap-1 relative pr-4">
                    <span className={cn("font-bold", getTypeColor(rule.type))}>
                        {rule.tooth === 0 ? "Gen" : rule.tooth === 10 ? "MAX" : rule.tooth === 30 ? "MAN" : `#${rule.tooth}`} {rule.type}
                    </span>

{/* ✨ NEW: 그룹 표시 뱃지 (동일한 타입/메모/스텝이 모두 완벽히 같은 룰이 2개 이상일 때만 표시) */}
{(!(rule as any).isIsolated && safeRules.filter((r: Rule) => 
                        !(r as any).isIsolated && 
                        r.type === rule.type && 
                        (r.note || "") === (rule.note || "") && 
                        r.startStep === rule.startStep && 
                        r.endStep === rule.endStep
                    ).length > 1) && (
                        <span className="ml-1 px-1 py-0.5 bg-slate-100 text-slate-400 text-[8px] rounded border border-slate-200 font-bold uppercase tracking-tighter">Group</span>
                    )}
                                        
                    {/* ✨ NEW: 리스트용 빨간 별표 (이미지가 있을 때만 노출) */}
                    {rule.imageUrl && (
                                                <div className="absolute top-0 right-0 drop-shadow-md" title="Reference Image">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </div>
                    )}                                                 
                    <span className="text-slate-400 text-[10px]">({rule.startStep}-{rule.endStep})</span>
                                             </div>
                                             {isQuickEdit ? (
    <input className="w-full mt-1 border-b border-dashed outline-none focus:border-blue-500 bg-transparent text-[11px] pointer-events-auto" 
           defaultValue={rule.note} 
           onClick={(e) => e.stopPropagation()} 
           onChange={(e) => setEditBuffer(p => ({...p, [rule.id]: {note: e.target.value}}))} 
           placeholder="Note..." />
) : (
    rule.note ? (
        <div className="text-[10px] text-slate-500 truncate mt-0.5" title={rule.note}>
            {rule.note.split('\n').join(' ')}
        </div>
    ) : null
)} 
</div>                                        
                                         {!isQuickEdit && (
                                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                                 <button onClick={(e) => handleEditClick(e, rule)} className="text-slate-400 hover:text-blue-500 p-1"><Pencil className="w-3 h-3"/></button>
                                                 <button onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    if (window.confirm("이 규칙을 삭제하시겠습니까?")) {
                                                        store?.deleteRule(patient.id, rule.id); 
                                                    }
                                                }} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3 h-3"/></button>                                             </div>
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
                         <span className="text-[10px] font-bold">Drag 단어를 여기에 삭제</span>
                     </div>
                 )}
              </div>
           </div>
           </>
) : (
    <div className="p-5 flex flex-col gap-4">
        <h2 className="font-bold text-slate-700 flex items-center gap-2 text-lg border-b pb-3 tracking-tight">
            <Table className="w-5 h-5 text-slate-700"/> Records Tools
        </h2>
        <div className="p-4 bg-slate-50 rounded border border-slate-200 text-sm text-slate-500 shadow-inner">
            Admin conditional formatting, quick format buttons, and data filters will be placed here.
        </div>
    </div>
)}
</div>

<div className="flex-1 flex flex-col bg-slate-50/50 min-h-screen relative">
           
<div className="flex items-end px-6 pt-3 border-b border-slate-300 bg-white shrink-0">
               <div className="flex items-center gap-1">
                   <button 
                       onClick={() => setActiveTab('summary')}
                       className={cn("text-sm font-bold px-6 py-2.5 transition-all flex items-center gap-2 rounded-t-lg border-t border-x relative top-[1px]", 
                           activeTab === 'summary' 
                           ? "bg-white border-slate-300 text-blue-700 z-10 shadow-[0_-2px_5px_rgba(0,0,0,0.02)]" 
                           : "bg-transparent border-transparent text-slate-500 hover:bg-slate-50 z-0")}
                   >
                       <FileImage className="w-4 h-4"/> Work Summary
                   </button>
                   <button 
                       onClick={() => setActiveTab('records')}
                       className={cn("text-sm font-bold px-6 py-2.5 transition-all flex items-center gap-2 rounded-t-lg border-t border-x relative top-[1px]", 
                           activeTab === 'records' 
                           ? "bg-white border-slate-300 text-blue-700 z-10 shadow-[0_-2px_5px_rgba(0,0,0,0.02)]" 
                           : "bg-transparent border-transparent text-slate-500 hover:bg-slate-50 z-0")}
                   >
                       <Table className="w-4 h-4"/> Records
                   </button>
               </div>

               {/* ✨ [NEW] 탭들 우측 빈 공간으로 밀어낸 '셋업 작업 노트' 버튼 영역 */}
               <div className="ml-auto mb-1.5 flex items-center">
                   <Button
                       variant="outline"
                       size="sm"
                       onClick={(e) => {
                           const currentStageId = patient.activeStageId || patient.stages[0].id;
                           const currentStage = patient.stages.find((s: any) => s.id === currentStageId);
                           const currentLink = currentStage?.externalLink || "";
                           
                           if (currentLink) {
                               window.open(currentLink, "_blank", "noopener,noreferrer");
                           } else {
                               const inputLink = prompt(`[${currentStage?.name}]\n이 스테이지의 셋업 작업 노트 URL을 입력하세요 (예: https://...)`, "https://");
                               if (inputLink && inputLink.trim() !== "" && inputLink.trim() !== "https://") {
                                   let finalLink = inputLink.trim();
                                   if (!finalLink.startsWith("http")) finalLink = `https://${finalLink}`;
                                   if(store) store.updateStageExternalLink(patient.id, currentStageId, finalLink);
                                   alert("✅ 셋업 작업 노트 링크가 서버에 자동 저장되었습니다!");
                               }
                           }
                       }}
                       onContextMenu={(e) => {
                           e.preventDefault();
                           const currentStageId = patient.activeStageId || patient.stages[0].id;
                           const currentStage = patient.stages.find((s: any) => s.id === currentStageId);
                           const currentLink = currentStage?.externalLink || "";

                           if (!currentLink) {
                               alert("등록된 링크가 없습니다. 좌클릭하여 먼저 등록해주세요.");
                               return;
                           }
                           const action = prompt(`[${currentStage?.name}] 등록된 링크:\n${currentLink}\n\n1. 수정\n2. 삭제\n(번호 또는 명령어를 입력하세요)`, "삭제");
                           
                           if (action === "2" || action === "삭제") {
                               if(confirm("링크를 삭제하시겠습니까?")) {
                                   if(store) store.updateStageExternalLink(patient.id, currentStageId, "");
                                   alert("✅ 링크가 삭제되었습니다.");
                               }
                           } else if (action === "1" || action === "수정") {
                               const newLink = prompt("새로운 URL을 입력하세요:", currentLink);
                               if (newLink && newLink.trim() !== "" && newLink.trim() !== currentLink) {
                                   let finalLink = newLink.trim();
                                   if (!finalLink.startsWith("http")) finalLink = `https://${finalLink}`;
                                   if(store) store.updateStageExternalLink(patient.id, currentStageId, finalLink);
                                   alert("✅ 링크가 수정되었습니다.");
                               }
                           }
                       }}
                       className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 bg-white shadow-sm font-bold text-xs"
                       title="좌클릭: 열기 및 등록 / 우클릭: 수정 및 삭제"
                   >
                       <LinkIcon className="w-3.5 h-3.5" /> 셋업 작업 노트
                   </Button>
               </div>
           </div>

           {activeTab === 'summary' ? (
               <>
                 <div className="px-4 py-3 bg-slate-100 border-b flex flex-nowrap items-center gap-4 overflow-x-auto shrink-0 select-none">
                     <div className="flex items-center gap-1.5 border-r pr-4 shrink-0">
                         <span className="text-[10px] font-bold text-blue-600 mr-1">MAXILLA</span>
                         {UPPER_TEETH.map(num => (
                             <div key={num} draggable onDragStart={(e) => e.dataTransfer.setData('sticker', num.toString())} 
                                  onClick={() => { setActiveSticker({num: num.toString(), color: '#2563eb'}); setCurrentTool('sticker'); }}
                                  className={cn("w-6 h-6 flex items-center justify-center rounded-full border bg-white text-xs font-bold cursor-pointer hover:bg-blue-50 hover:border-blue-300 text-blue-600 transition-colors", currentTool==='sticker' && activeSticker?.num === num.toString() && "bg-blue-500 text-white border-blue-600")}>
                                 {num}
                             </div>
                         ))}
                     </div>
                     <div className="flex items-center gap-1.5 shrink-0">
                         <span className="text-[10px] font-bold text-red-600 mr-1">MANDIBLE</span>
                         {LOWER_TEETH.map(num => (
                             <div key={num} draggable onDragStart={(e) => e.dataTransfer.setData('sticker', num.toString())} 
                                  onClick={() => { setActiveSticker({num: num.toString(), color: '#dc2626'}); setCurrentTool('sticker'); }}
                                  className={cn("w-6 h-6 flex items-center justify-center rounded-full border bg-white text-xs font-bold cursor-pointer hover:bg-red-50 hover:border-red-300 text-red-600 transition-colors", currentTool==='sticker' && activeSticker?.num === num.toString() && "bg-red-500 text-white border-red-600")}>
                                 {num}
                             </div>
                         ))}
                     </div>
                     
{/* ✨ 끝에 relative를 추가해서 버튼이 허공에 뜰 수 있는 기준점을 만들어줍니다 */}
<div className="ml-auto flex gap-2 pl-4 shrink-0 border-l border-slate-200">
                         {/* ✨ 수정: 허공에 띄우는 코드 제거, 녹색(green) 테마 적용, 다른 버튼들과 완벽한 통일성 */}
                         <Button 
                             onClick={handleSaveAsGraph} 
                             disabled={isGraphImageUploading}
                             className="gap-1.5 bg-white text-green-600 border border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300 shadow-sm transition-all font-bold"
                             title="현재 화면을 이동 그래프로 등록"
                         >
                             {isGraphImageUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <TrendingUp className="w-4 h-4"/>}
                             등록
                         </Button>
                         
                         <Button onClick={handleSave} className="gap-2 bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4"/> Save Summary</Button>
                         <Button onClick={() => setIsGridOpen(true)} className="gap-2 bg-white text-slate-700 border hover:bg-slate-50"><Layout className="w-4 h-4"/> Checklist View</Button>
                     </div>                      
                      </div>

                 <div className="flex-1 p-6 flex flex-row gap-4 bg-slate-100 relative"> 
                    <div className="w-28 flex flex-col gap-2 shrink-0 z-10 relative">
                        {slides.map((slide, index) => (
                            <SlideThumbnail 
                                key={slide.id} items={slide.items} penStrokes={slide.penStrokes} isActive={currentSlideIndex === index} index={index}
                                onClick={() => { setCurrentSlideIndex(index); setHistory([]); setHistoryIndex(-1); }}
                                onDelete={(e:any) => { e.stopPropagation(); deleteSlide(index); }}
                                onDuplicate={(e:any) => duplicateSlide(e, index)} 
                                onDragStart={() => {}} onDrop={handleSlideDrop} 
                            />
                        ))}
                        <div 
                            onClick={() => setCurrentSlideIndex(SMART_DASHBOARD_INDEX)}
                            className={cn(
                                "w-full aspect-[4/3] border-[1.5px] rounded cursor-pointer group flex flex-col items-center justify-center transition-all overflow-hidden shrink-0", 
                                currentSlideIndex === SMART_DASHBOARD_INDEX 
                                    ? "bg-white border-[#2563eb] ring-[3px] ring-[#dbeafe] shadow-md scale-[1.02]" 
                                    : "bg-white border-blue-300 hover:border-[#2563eb] shadow-sm"
                            )}
                        >
                            <LayoutDashboard className="w-6 h-6 mb-1 transition-colors text-[#2563eb]" />
                            <span className="text-[10px] font-bold text-center px-1 uppercase tracking-wider text-[#2563eb]">
                                Smart<br/>Summary
                            </span>
                        </div>
                        <Button variant="outline" className={cn("w-full border-dashed h-20", currentSlideIndex === SMART_DASHBOARD_INDEX && "text-slate-500 mt-2 bg-white/50")} onClick={addSlide}><Plus className="w-4 h-4 mr-1"/> Add Slide</Button>
                    </div>

                    <div className={cn("flex-1 flex flex-col relative", currentSlideIndex === SMART_DASHBOARD_INDEX ? "" : "bg-white p-4 rounded-lg shadow-sm overflow-hidden min-h-[800px]")}>
                        
                    {currentSlideIndex === SMART_DASHBOARD_INDEX ? (
    <div className="absolute inset-0 flex gap-4 overflow-hidden pl-2 animate-in fade-in-50"> 
        <div className="w-[220px] bg-white border border-slate-200 rounded-xl flex flex-col shrink-0 h-full shadow-sm overflow-hidden">
            <div className="text-sm font-bold text-slate-700 border-b p-3 flex items-center justify-between shrink-0 sticky top-0 bg-white z-10 shadow-sm">
                <div className="flex items-center gap-1.5"><ListTree className="w-4 h-4 text-slate-500"/> 전체 치료 타임라인</div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 pl-1 py-2 space-y-2 custom-scrollbar"> 
                {(() => {
                    const sortedRules = [...safeRules].sort((a, b) => {
                        const aActive = isAllView ? activeFilters.includes(a.type) : (smartStage >= a.startStep && smartStage <= a.endStep);
                        const bActive = isAllView ? activeFilters.includes(b.type) : (smartStage >= b.startStep && smartStage <= b.endStep);
                        if (aActive && !bActive) return -1; 
                        if (!aActive && bActive) return 1;  
                        return a.startStep - b.startStep;   
                    });

                    if (sortedRules.length === 0) {
                        return <div className="text-center text-xs text-slate-400 mt-10">등록된 룰이 없습니다.</div>;
                    }

                    return sortedRules.map(rule => {
                        const isActive = isAllView ? activeFilters.includes(rule.type) : (smartStage >= rule.startStep && smartStage <= rule.endStep);
                        const leftPercent = ((rule.startStep - 1) / (totalSteps - 1)) * 100;
                        const widthPercent = ((rule.endStep - rule.startStep) / (totalSteps - 1)) * 100;
                        
                        const itemColor = getExpertTypeColor(rule.type);
                        const borderColorRGBA = isActive ? itemColor : hexToRgba(itemColor, 0.4);
                        const bgColorRGBA = isActive ? hexToRgba(itemColor, 0.05) : 'white';

                        return (
                            <div 
                                key={rule.id} 
                                className={cn(
                                    "p-2.5 rounded-lg border-[1.5px] flex flex-col gap-1.5 transition-all cursor-pointer",
                                    isActive 
                                        ? "shadow-[0_4px_10px_rgba(0,0,0,0.08)] scale-[1.02]" 
                                        : "shadow-none opacity-50 hover:opacity-80" 
                                )}
                                style={{ 
                                    borderColor: borderColorRGBA,
                                    backgroundColor: bgColorRGBA,
                                }}
                                onClick={() => {
                                    setSmartStage(rule.startStep);
                                    setIsAllView(false); 
                                }}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                        <span className={cn("font-bold px-1.5 py-0.5 rounded border-[1.5px]", isActive ? "bg-white text-[#2563eb] border-[#2563eb]" : "bg-slate-50 text-slate-500 border-slate-200")}>
                                            {rule.tooth === 0 ? 'Gen' : rule.tooth === 10 ? 'MAX' : rule.tooth === 30 ? 'MAN' : `#${rule.tooth}`}
                                        </span>
                                        <div className="flex items-center max-w-[120px]">
                                            <span className="font-extrabold truncate tracking-tight" style={{ color: itemColor }}>
                                                {getAbbreviation(rule.type)}
                                            </span>

                                            {rule.imageUrl && (
                                                <div className="drop-shadow-md shrink-0 ml-0.5 -translate-y-[2px]" title="Reference Image">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
                                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <span className={cn("text-[11px] font-mono font-extrabold tracking-tighter", isActive ? "text-[#2563eb]" : "text-slate-500")}>
                                        ({rule.startStep}-{rule.endStep})
                                    </span>                                                        
                                </div>
                                {showSmartMemo && rule.note && (
                                    <div className="text-[11px] font-bold text-slate-500 px-1 whitespace-pre-wrap break-words leading-tight mt-0.5">
                                        {rule.note}
                                    </div>
                                )}
                                                                <div className="h-[5px] w-full bg-slate-100 rounded-full mt-0.5 relative overflow-hidden border border-slate-200/50">                                                            
                                    <div 
                                        className="absolute h-full rounded-full transition-all"
                                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, backgroundColor: itemColor }}
                                    />
                                </div>
                            </div>
                        );
                    });                                        
                })()}
            </div>
        </div>

{(() => {
            const currentRules = safeRules.filter((r: Rule) => smartStage >= r.startStep && smartStage <= r.endStep);
            const isStepAllChecked = currentRules.length > 0 && currentRules.every((r: Rule) => !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked));

            return (
                <div className={cn(
                    "flex-1 flex flex-col rounded-xl relative h-full overflow-hidden transition-all duration-500",
                    isStepAllChecked ? "bg-[#fcfcfc] border border-green-500 ring-[3px] ring-green-100 shadow-[inset_0_0_20px_rgba(220,252,231,0.5)]" : "bg-[#fcfcfc] border border-slate-200 shadow-[inset_0_2px_20px_rgba(0,0,0,0.02)]"
                )}>
                    
                    <div className={cn(
                        "p-4 border-b bg-white/95 backdrop-blur flex flex-col items-center justify-center shrink-0 z-30 shadow-sm transition-colors duration-500",
                        isStepAllChecked ? "border-green-500" : "border-slate-200"
                    )}>
                        <div className="flex items-center justify-center gap-4 w-full relative">

                            <button
                                onClick={() => {
                                    const next = !isAllView;
                                    setIsAllView(next);
                                    if (next) {
                                        const uniqueTypes = Array.from(new Set(safeRules.map((r: Rule) => r.type))) as string[];
                                        setActiveFilters(uniqueTypes);
                                    }
                                }}
                                className={cn(
                                    "px-5 py-1.5 rounded-full font-extrabold text-sm transition-all border-[1.5px] shadow-sm tracking-wide",
                                    isAllView 
                                        ? "bg-[#2563eb] text-white border-[#2563eb] ring-[3px] ring-[#dbeafe]" 
                                        : "bg-white text-slate-500 border-slate-200 hover:border-[#2563eb] hover:text-[#2563eb]"
                                )}
                            >
                                ALL
                            </button>

                            <div className={cn(
                                "px-3 py-1.5 bg-white border-[1.5px] rounded-full shadow-sm ring-[3px] flex items-center gap-3 transition-all duration-500",
                                isAllView && "opacity-40 pointer-events-none",
                                isStepAllChecked ? "border-green-500 ring-green-100" : "border-[#2563eb] ring-[#dbeafe]"
                            )}>
                                <button onClick={() => setSmartStage(p => Math.max(0, p - 1))} className={cn("rounded-full w-6 h-6 flex items-center justify-center font-bold transition-colors", isStepAllChecked ? "text-green-600 hover:bg-green-50" : "text-[#2563eb] hover:text-blue-700 hover:bg-blue-50")}>&lt;</button>
                                <span className={cn("font-bold text-sm tracking-wide flex items-center gap-1 transition-colors duration-500", isStepAllChecked ? "text-green-600" : "text-[#2563eb]")}>
                                    {isStepAllChecked && <CheckCheck className="w-4 h-4 mr-0.5 animate-in zoom-in" />}
                                    현재 단계: 
                                    <input 
                                        type="number" 
                                        value={smartStage}
                                        onChange={(e) => {
                                            let val = parseInt(e.target.value);
                                            if (!isNaN(val)) setSmartStage(Math.max(0, Math.min(totalSteps, val)));
                                        }}
                                        className={cn("w-8 text-center bg-transparent border-b-2 outline-none appearance-none ml-1 hide-arrows transition-colors duration-500", isStepAllChecked ? "border-green-500/30 focus:border-green-500" : "border-[#2563eb]/30 focus:border-[#2563eb]")}
                                        style={{ WebkitAppearance: 'none', margin: 0 }}
                                    />
                                    <span className="opacity-70">/ {totalSteps}</span>
                                </span>
                                <button onClick={() => setSmartStage(p => Math.min(totalSteps, p + 1))} className={cn("rounded-full w-6 h-6 flex items-center justify-center font-bold transition-colors", isStepAllChecked ? "text-green-600 hover:bg-green-50" : "text-[#2563eb] hover:text-blue-700 hover:bg-blue-50")}>&gt;</button>
                                
                                <div className={cn("w-px h-4 mx-0.5", isStepAllChecked ? "bg-green-200" : "bg-blue-200")}></div>
                                <button 
                                    onClick={() => store?.checkAllInStep(patient.id, smartStage)} 
                                    className={cn("p-1 rounded-md transition-colors", isStepAllChecked ? "text-green-600 hover:bg-green-50" : "text-[#2563eb] hover:bg-blue-50")}
                                    title="현재 단계 전체 체크"
                                >
                                    <CheckSquare className="w-4 h-4" />
                                </button>
                            </div>

{/* ✨ NEW: 이동 그래프 버튼 영역 (드래그, 복붙 지원 - graph-image-dropzone) */}
<div
                                className={cn(
                                    "relative group graph-image-dropzone ml-4 flex shrink-0 items-center outline-none rounded-full transition-all border-[1.5px] shadow-sm",
                                    patient.summary?.graphImage 
                                        ? "bg-purple-50 border-purple-200" 
                                        : "bg-white border-slate-200 focus-within:border-purple-400 focus-within:ring-[3px] focus-within:ring-purple-100"
                                )}
                                tabIndex={0}
                                onPaste={(e) => {
                                    const file = e.clipboardData.files?.[0];
                                    if (file && file.type.startsWith('image/')) {
                                        e.preventDefault(); e.stopPropagation();
                                        processGraphImageFile(file);
                                    }
                                }}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file && file.type.startsWith('image/')) processGraphImageFile(file);
                                }}
                            >
                                <input type="file" accept="image/*" className="hidden" ref={graphFileInputRef} onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) processGraphImageFile(file);
                                    e.target.value = "";
                                }} />
                                
                                {patient.summary?.graphImage ? (
                                    // ✨ 이미지가 있을 때: 클릭 시 팝업 뷰어 열기
                                    <button
                                        onClick={() => setShowGraphPopup(true)}
                                        className="px-4 py-1.5 rounded-full font-extrabold text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1.5"
                                    >
                                        <TrendingUp className="w-4 h-4" />
                                        이동 그래프
                                    </button>
                                ) : (
                                    // ✨ 이미지가 없을 때: [파일 열기] 와 [포커스 영역] 분리
                                    <>
                                        <button
                                            onClick={() => graphFileInputRef.current?.click()}
                                            className="px-3 py-1.5 font-extrabold text-sm text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-l-full flex items-center gap-1.5 transition-colors"
                                            title="클릭하여 파일 선택"
                                        >
                                            {isGraphImageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                                            파일 첨부
                                        </button>
                                        
                                        <div className="w-px h-4 bg-slate-200"></div>
                                        
                                        <div 
                                            className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 cursor-text hover:bg-slate-50 hover:text-slate-600 rounded-r-full flex items-center transition-colors"
                                            title="여기를 클릭하여 활성화한 후 Ctrl+V를 누르세요"
                                        >
                                            클릭 후 Ctrl+V
                                        </div>
                                    </>
                                )}

                                {patient.summary?.graphImage && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveGraphImage();
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600 shadow-sm"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            <div className="absolute right-4 flex items-center gap-5 animate-in fade-in">
                                {/* ✨ NEW: 메모 표시 토글 (항상 표시) */}
                                <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setShowSmartMemo(!showSmartMemo)}>
                                    <span className={cn("text-[11px] font-bold transition-colors duration-300", showSmartMemo ? "text-green-600" : "text-slate-400")}>
                                        메모 표시
                                    </span>
                                    <div className={cn("w-12 h-5 rounded-full p-1 transition-colors duration-300 ease-in-out relative flex items-center shadow-inner overflow-hidden", showSmartMemo ? "bg-green-500" : "bg-slate-200")}>
                                        <span className={cn("absolute left-1.5 text-[9px] font-extrabold text-white transition-opacity duration-300", showSmartMemo ? "opacity-100" : "opacity-0")}>ON</span>
                                        <span className={cn("absolute right-1 text-[9px] font-extrabold text-slate-400 transition-opacity duration-300", showSmartMemo ? "opacity-0" : "opacity-100")}>OFF</span>
                                        <div className="bg-white w-3.5 h-3.5 rounded-full shadow-sm transform transition-transform duration-300 ease-in-out z-10" style={{ transform: showSmartMemo ? 'translateX(26px)' : 'translateX(0px)' }} />
                                    </div>
                                </div>

                                {/* 기존: 완료 표시 토글 (단일 단계 뷰에서만 표시) */}
                                {!isAllView && (
                                    <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setShowCheckedStatus(!showCheckedStatus)}>
                                        <span className={cn("text-[11px] font-bold transition-colors duration-300", showCheckedStatus ? "text-green-600" : "text-slate-400")}>
                                            완료 표시
                                        </span>
                                        <div className={cn("w-12 h-5 rounded-full p-1 transition-colors duration-300 ease-in-out relative flex items-center shadow-inner overflow-hidden", showCheckedStatus ? "bg-green-500" : "bg-slate-200")}>
                                            <span className={cn("absolute left-1.5 text-[9px] font-extrabold text-white transition-opacity duration-300", showCheckedStatus ? "opacity-100" : "opacity-0")}>ON</span>
                                            <span className={cn("absolute right-1 text-[9px] font-extrabold text-slate-400 transition-opacity duration-300", showCheckedStatus ? "opacity-0" : "opacity-100")}>OFF</span>
                                            <div className="bg-white w-3.5 h-3.5 rounded-full shadow-sm transform transition-transform duration-300 ease-in-out z-10" style={{ transform: showCheckedStatus ? 'translateX(26px)' : 'translateX(0px)' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                                                    </div>

                        <div className={cn("relative w-full max-w-[75%] pt-4 group transition-all", isAllView ? "pb-0 opacity-0 h-0 overflow-hidden pointer-events-none" : "pb-4 opacity-100")}>
                            <input 
                                type="range" 
                                min="0" max={totalSteps} 
                                value={smartStage} 
                                onChange={(e) => setSmartStage(Number(e.target.value))}
                                className="w-full h-[2.5px] bg-slate-200 rounded-full appearance-none cursor-pointer relative z-20 accent-[#2563eb] group-hover:accent-[#1d4ed8] transition-all" 
                            />                                            
                            <div className="absolute top-[22px] left-0 w-full flex justify-between px-[1px] pointer-events-none z-10">
                                {Array.from({ length: totalSteps + 1 }).map((_, i) => {
                                    const stepNum = i;
                                    const isMajorTick = stepNum % 5 === 0 || stepNum === totalSteps;
                                    return (
                                        <div key={i} className="flex flex-col items-center relative" style={{ width: '0px' }}>
                                            <div className={cn("w-[1px] bg-slate-300 rounded-full", isMajorTick ? "h-[6px]" : "h-[3px]")} />
                                            {isMajorTick && (
                                                <span className="text-[10px] text-slate-400 font-medium mt-1 absolute translate-y-[8px] whitespace-nowrap">{stepNum}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div> 

                        {isAllView && (
                            <div className="w-full max-w-[75%] flex flex-wrap items-center justify-center gap-2 pt-3 animate-in fade-in slide-in-from-top-2">
                                
                                <button
                                    onClick={() => setActiveFilters(activeFilters.length > 0 ? [] : Array.from(new Set(safeRules.map((r: Rule) => r.type))) as string[])}
                                    className="flex items-center gap-1 px-3 py-1 text-[11px] font-extrabold rounded-md transition-all border-[1.5px] border-slate-300 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 shadow-sm"
                                >
                                    {activeFilters.length > 0 ? <><X className="w-3 h-3"/> 전체 해제</> : <><CheckCheck className="w-3 h-3"/> 전체 선택</>}
                                </button>

                                <div className="w-px h-4 bg-slate-300 mx-1"></div> 

                                {Array.from(new Set(safeRules.map((r: Rule) => r.type))).map(type => {
                                    const isFilterActive = activeFilters.includes(type as string);
                                    const color = getExpertTypeColor(type as string);
                                    return (
                                        <button
                                            key={type as string}
                                            onClick={() => setActiveFilters(p => p.includes(type as string) ? p.filter(t => t !== type) : [...p, type as string])}
                                            className={cn(
                                                "px-3 py-1 text-[11px] font-extrabold rounded-md transition-all border-[1.5px]",
                                                isFilterActive ? "shadow-sm scale-100" : "bg-transparent hover:bg-slate-50 opacity-60 hover:opacity-100 scale-[0.98]"
                                            )}
                                            style={{
                                                backgroundColor: isFilterActive ? color : 'transparent',
                                                borderColor: color,
                                                color: isFilterActive ? 'white' : color,
                                            }}
                                        >
                                            {getAbbreviation(type as string)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar relative bg-[#fcfcfc]"> 

                    <div className="w-full relative flex flex-col items-center justify-start min-w-[900px] min-h-full py-16 px-2">
                        {/* 세로 십자선 */}
                        <div className="absolute h-full w-[2px] bg-slate-300 top-0 left-1/2 -translate-x-1/2 z-0" />

                        {(() => {
                            const activeRules = isAllView 
                                ? safeRules.filter((r: Rule) => activeFilters.includes(r.type))
                                : safeRules.filter((r: Rule) => smartStage >= r.startStep && smartStage <= r.endStep);

                            const genRulesList = activeRules.filter((r: Rule) => r.tooth === 0);
                            const maxRulesList = activeRules.filter((r: Rule) => r.tooth === 10);
                            const manRulesList = activeRules.filter((r: Rule) => r.tooth === 30);

                            const renderVerticalStack = (rules: Rule[], tooth: number, isUpper: boolean) => {
                                const InfoBlock = () => {
                                    const rulesToRender = isUpper ? [...rules].reverse() : rules;
                                    return (
                                        <div className={cn("flex flex-col w-12 px-0.5", isUpper ? "items-center justify-end" : "items-center justify-start")}>
                                            {rulesToRender.map((r, idx) => {
                                                const itemColor = getExpertTypeColor(r.type);
                                                const isRuleChecked = !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked);

                                                const RangeEl = (
                                                    <div key={`range-${r.id}`} className={cn("text-[14px] font-mono font-extrabold tracking-tighter transition-all duration-300", isRuleChecked && "opacity-40 line-through")} style={{ color: `${itemColor}E6` }}>
                                                        ({r.startStep}-{r.endStep})
                                                    </div>
                                                );

                                                const ItemContentEl = <InlineNoteEdit key={`item-content-${r.id}`} rule={r} store={store} patientId={patient.id} itemColor={itemColor} isUpper={isUpper} isChecked={isRuleChecked} onToggleCheck={() => store?.toggleChecklistItem(patient.id, smartStage, r.id)} showMemo={showSmartMemo} />;
                                                                                                const Divider = idx !== rulesToRender.length - 1 ? <div key={`div-${r.id}`} className="w-6 h-[1.5px] bg-slate-200 my-1" /> : null;

                                                return (
                                                    <div key={r.id} className={cn("flex flex-col items-center w-full bg-transparent py-0.5 relative animate-in fade-in zoom-in-95", isUpper ? "mb-0.5" : "mt-0.5")}>
                                                        {isUpper ? (
                                                            <>
                                                                {RangeEl}
                                                                {ItemContentEl}
                                                            </>
                                                        ) : (
                                                            <>
                                                                {ItemContentEl}
                                                                {RangeEl}
                                                            </>
                                                        )}
                                                        {Divider}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                };

                                const toothIconColor = rules.length > 0 ? "#38bdf8" : "#e2e8f0"; 
                                const isToothAllChecked = rules.length > 0 && rules.every(r => !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked));
                                
                                return (
                                    <div className="flex flex-col items-center w-12 shrink-0 z-10 relative">
                                        {isUpper && rules.length > 0 && <InfoBlock />}
                                        
                                        <div className={cn("relative w-10 h-10 flex items-center justify-center shrink-0 z-10 transition-colors", isUpper ? "mt-0.5" : "mb-0.5", isToothAllChecked && "opacity-40")}>
                                            <svg viewBox="0 0 24 24" fill="white" stroke={toothIconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 w-full h-full drop-shadow-sm transition-colors">
                                                <path d="M12 5.5C10.5 3 8 2 5.5 3.5C3.5 4.5 2 7 2 10C2 14 4 18 5.5 20.5C6.5 22 8 22 9.5 20.5C10.5 19 11 17 12 15C13 17 13.5 19 14.5 20.5C16 22 17.5 22 18.5 20.5C20 18 22 14 22 10C22 7 20.5 4.5 18.5 3.5C16 2 13.5 3 12 5.5Z" />
                                            </svg>
                                            <span className="relative z-10 font-extrabold text-[12px] mb-1 transition-colors" style={{ color: toothIconColor }}>
                                                {tooth}
                                            </span>
                                        </div>

                                        {!isUpper && rules.length > 0 && <InfoBlock />}
                                    </div>
                                );
                            };

                            const urTeeth = [18, 17, 16, 15, 14, 13, 12, 11];
                            const ulTeeth = [21, 22, 23, 24, 25, 26, 27, 28];
                            const lrTeeth = [48, 47, 46, 45, 44, 43, 42, 41];
                            const llTeeth = [31, 32, 33, 34, 35, 36, 37, 38];

                            return (
                                <>
                                    {/* 공통 룰 영역 (상단 모서리 밀착) */}
                                    <div className="absolute top-4 left-6 z-20 flex flex-col gap-1.5 items-start bg-white/60 p-2 rounded-lg backdrop-blur-sm">
                                    {maxRulesList.map((r: Rule) => {
                                            const isRuleChecked = !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked);
                                            return <CornerRuleItem key={`max-${r.id}`} rule={r} label="MAX" isChecked={isRuleChecked} onToggleCheck={() => store?.toggleChecklistItem(patient.id, smartStage, r.id)} showMemo={showSmartMemo} />;
                                        })}
                                        {genRulesList.map((r: Rule) => {
                                            const isRuleChecked = !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked);
                                            return <CornerRuleItem key={`gen-${r.id}`} rule={r} label="Gen" isChecked={isRuleChecked} onToggleCheck={() => store?.toggleChecklistItem(patient.id, smartStage, r.id)} showMemo={showSmartMemo} />;
                                        })}
                                                                                                                    </div>

                                    {/* 상악 치아 배열 */}
                                    <div className="flex w-full items-end justify-center pb-2 z-10 flex-1">
                                        <div className="w-1/2 flex items-end justify-end space-x-5 pr-3">
                                            {urTeeth.map(num => {
                                                const rules = activeRules.filter((r: Rule) => r.tooth === num);
                                                if (rules.length === 0) return <div key={num} className="w-12 shrink-0 relative" />;
                                                return <React.Fragment key={num}>{renderVerticalStack(rules, num, true)}</React.Fragment>;
                                            })}
                                        </div>
                                        <div className="w-1/2 flex items-end justify-start space-x-5 pl-3">
                                            {ulTeeth.map(num => {
                                                const rules = activeRules.filter((r: Rule) => r.tooth === num);
                                                if (rules.length === 0) return <div key={num} className="w-12 shrink-0 relative" />;
                                                return <React.Fragment key={num}>{renderVerticalStack(rules, num, true)}</React.Fragment>;
                                            })}
                                        </div>
                                    </div>

                                    {/* 가로 십자선 */}
                                    <div className="w-[90%] h-[2px] bg-slate-300 shrink-0 z-0 my-2 rounded-full" />

                                    {/* 하악 치아 배열 */}
                                    <div className="flex w-full items-start justify-center pt-2 z-10 flex-1">
                                        <div className="w-1/2 flex items-start justify-end space-x-5 pr-3">
                                            {lrTeeth.map(num => {
                                                const rules = activeRules.filter((r: Rule) => r.tooth === num);
                                                if (rules.length === 0) return <div key={num} className="w-12 shrink-0 relative" />;
                                                return <React.Fragment key={num}>{renderVerticalStack(rules, num, false)}</React.Fragment>;
                                            })}
                                        </div>
                                        <div className="w-1/2 flex items-start justify-start space-x-5 pl-3">
                                            {llTeeth.map(num => {
                                                const rules = activeRules.filter((r: Rule) => r.tooth === num);
                                                if (rules.length === 0) return <div key={num} className="w-12 shrink-0 relative" />;
                                                return <React.Fragment key={num}>{renderVerticalStack(rules, num, false)}</React.Fragment>;
                                            })}
                                        </div>
                                    </div>

                                    {/* 하악 공통 룰 - ✨ 4번 요청 반영: label="MAN"으로 오기 수정 */}
                                    <div className="absolute bottom-4 left-6 z-20 flex flex-col gap-1.5 items-start bg-white/60 p-2 rounded-lg backdrop-blur-sm">
                                        {manRulesList.map((r: Rule) => {
                                            const isRuleChecked = !isAllView && showCheckedStatus && patient.checklist_status?.some((s: any) => s.step === smartStage && s.ruleId === r.id && s.checked);
                                            return <CornerRuleItem key={`man-${r.id}`} rule={r} label="MAN" isChecked={isRuleChecked} onToggleCheck={() => store?.toggleChecklistItem(patient.id, smartStage, r.id)} showMemo={showSmartMemo} />;
                                                                                            })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>
            );
        })()}
    </div>
) : (
    <>
        <div className="flex justify-between items-center mb-4 gap-2 sticky top-4 z-50 bg-white/95 backdrop-blur p-2 border shadow-sm rounded-lg overflow-x-auto no-scrollbar min-h-[64px] shrink-0">
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
               
               {(isTextSelected || isShapeSelected) && (
                  <div className="flex items-center gap-2 border px-2 py-1 rounded bg-slate-50 ml-2 shrink-0">
                     <div className="flex flex-col items-center gap-0.5">
                         <span className="text-[8px] font-bold text-slate-400">Color</span>
                         <input type="color" value={styleSettings.strokeColor} onChange={(e) => handleStyleChange('strokeColor', e.target.value)} className="w-5 h-5 p-0 border-0 rounded cursor-pointer" title="Color"/>
                     </div>
                     
                     {isShapeSelected && (['rect', 'circle', 'triangle'].includes(currentTool) || (currentTool === 'select' && items.some(i => selectedIds.includes(i.id) && ['rect', 'circle', 'triangle'].includes(i.type)))) && (
                         <div className="flex flex-col items-center gap-0.5">
                             <span className="text-[8px] font-bold text-slate-400">Fill</span>
                             <div className="relative w-5 h-5">
                                 <input type="color" value={styleSettings.fillColor === 'transparent' ? '#ffffff' : styleSettings.fillColor} onChange={(e) => handleStyleChange('fillColor', e.target.value)} className="w-full h-full p-0 border-0 rounded cursor-pointer" />
                                 <button onClick={() => handleStyleChange('fillColor', 'transparent')} className="absolute -top-3 -right-2 bg-white border rounded-[2px] text-[8px] px-0.5" title="Transparent">X</button>
                             </div>
                         </div>
                     )}

                     {isShapeSelected && (
                         <div className="flex flex-col items-center w-16">
                             <span className="text-[8px] font-bold text-slate-400">Width: {styleSettings.strokeWidth}</span>
                             <input type="range" min="1" max="50" value={styleSettings.strokeWidth} onChange={(e) => handleStyleChange('strokeWidth', Number(e.target.value))} className="w-full accent-blue-600 h-1.5" />
                         </div>
                     )}

                     {isTextSelected && (
                         <div className="flex flex-col items-center w-16">
                             <span className="text-[8px] font-bold text-slate-400">Size</span>
                             <input 
                                 type="number" 
                                 min="10" 
                                 max="150" 
                                 value={styleSettings.fontSize} 
                                 onChange={(e) => handleStyleChange('fontSize', Number(e.target.value))} 
                                 onWheel={(e) => {
                                  e.preventDefault(); 
                                  const delta = e.deltaY < 0 ? 1 : -1;
                                  handleStyleChange('fontSize', Math.max(10, Math.min(150, styleSettings.fontSize + delta)));
                              }}                                           className="w-12 h-6 text-center text-xs font-bold border rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                 title="Font Size (Scroll to adjust)"
                             />
                         </div>
                     )}
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

       <div className={cn("flex-1 relative bg-slate-50 overflow-hidden select-none outline-none", 
           ['draw', 'highlighter', 'line', 'rect', 'circle', 'triangle'].includes(currentTool) && "cursor-crosshair", 
           currentTool === 'eraser' && "cursor-cell", 
           currentTool === 'text' && "cursor-text", 
           currentTool === 'select' && "cursor-default",
           currentTool === 'sticker' && "cursor-crosshair"
         )} 
         ref={containerRef} 
         tabIndex={0} // ✨ 캔버스가 포커스를 받을 수 있게 허용
         onMouseDown={(e) => {
             e.currentTarget.focus(); // ✨ 클릭 시 강제로 캔버스로 포커스 뺏어오기!
             setSelectedRuleIds([]); // ✨ NEW: 캔버스를 클릭하면 룰 선택은 자동 해제 (충돌 방지)
             handleMouseDown(e);
         }}
                  onMouseMove={handleMouseMove} 
         onMouseUp={handleMouseUp} 
         onDragOver={handleDrop} 
         onDrop={handleDrop}>

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
                        <div key={item.id} className={cn("absolute px-1 border border-transparent group", isSelected && "border-blue-500")} 
                     style={{ 
                         ...commonStyle, color: item.strokeColor || item.color, fontSize: `${item.size || 20}px`, fontWeight: 'bold', lineHeight: '1.2',
                         width: item.width ? `${item.width}px` : 'max-content', 
                         height: item.height || 'auto',
                         whiteSpace: item.width ? 'pre-wrap' : 'pre'
                     }} 
                     onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} 
                     onContextMenu={(e) => handleItemContextMenu(e, item.id)} 
                     onDoubleClick={(e) => { 
                         e.preventDefault(); e.stopPropagation(); 
                         setStyleSettings(prev => ({ ...prev, strokeColor: item.color || item.strokeColor || "#000", fontSize: item.size || 20 }));
                         setTextInput({ id: item.id, x: item.x, y: item.y, value: item.text || "", width: item.width, height: item.height }); 
                         setCurrentTool('text');
                     }}> 
                    {item.text} 
                    {item.text?.includes('http') && <div className="absolute -top-4 right-0 text-[9px] bg-black/60 text-white px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">Ctrl+Click to open link</div>} 
                    {isSelected && selectedIds.length > 1 && <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none"/>} 
                    {renderResizeHandles()} 
                </div> 
            ); 
        }                                 
        if (item.type === 'sticker') { 
             return ( 
                 <div key={item.id} className={cn("absolute flex items-center justify-center rounded-full", isSelected && "ring-1 ring-blue-500")} 
                      style={{ ...commonStyle, width: item.width, height: item.height, backgroundColor: 'transparent', color: item.color, fontSize: `${item.size}px`, fontWeight: '900', textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff' }} 
                      onMouseDown={(e) => handleItemMouseDown(e, item, 'move')} onContextMenu={(e) => handleItemContextMenu(e, item.id)}> 
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
     
     {textInput && ( 
         <textarea 
             id="active-text-editor"
             autoFocus 
             defaultValue={textInput.value}
             className="absolute z-[10000] border-2 border-blue-500 bg-white/90 px-2 py-1 shadow-lg outline-none rounded resize-none overflow-hidden select-text pointer-events-auto" 
             style={{ 
                 left: textInput.x, top: textInput.y, 
                 width: textInput.width ? `${textInput.width}px` : 'auto', minWidth: '20px', 
                 color: styleSettings.strokeColor, fontSize: `${styleSettings.fontSize || 20}px`, 
                 fontWeight: "bold", minHeight: textInput.height ? `${textInput.height}px` : "auto", lineHeight: '1.2',
                 whiteSpace: textInput.width ? 'pre-wrap' : 'pre'
             }} 
             ref={(el) => {
                 if (el) {
                     el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
                     if (!textInput.width) { el.style.width = 'auto'; el.style.width = (el.scrollWidth + 10) + 'px'; }
                 }
             }}
             onMouseDown={(e) => e.stopPropagation()} 
             onInput={(e) => {
                e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; 
                if (!textInput.width) { e.currentTarget.style.width = 'auto'; e.currentTarget.style.width = (e.currentTarget.scrollWidth + 10) + 'px'; }
            }} 
            onKeyDown={(e) => { 
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    if(!e.nativeEvent.isComposing) confirmText(); 
                } 
            }} 
        /> 
    )}
    {contextMenu && (
        <>
            <div className="fixed inset-0 z-[10000]" onMouseDown={(e) => { e.stopPropagation(); setContextMenu(null); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu(null); }} />
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
        </>
    )}
    {items.length === 0 && penStrokes.length === 0 && !textInput && ( <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none"> <FileImage className="w-16 h-16 mb-4 opacity-50"/> <p className="font-bold text-lg">Add Images or Draw</p> </div> )}
        </div>
   </>
)}
                     </div>
                  </div>
              </>
) : (
   <div className="flex-1 w-full h-full relative overflow-y-auto bg-white p-6">
       <RecordsSheet />
   </div>
)}        </div>
      </div>
      
      {/* ✨ NEW: 이동 그래프 팝업 뷰어 렌더링 */}
      {showGraphPopup && patient.summary?.graphImage && (
          <GraphViewer 
              imageUrl={patient.summary.graphImage} 
              onClose={() => setShowGraphPopup(false)} 
          />
      )}
{/* ✨ NEW: 데이터 임포트 다중 선택 모달 (1열 배치, 스텝/메모 편집, 활성화 토글 추가) */}
{importModalConfig.isOpen && (
          <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.4)] w-[900px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-3 shrink-0">
                      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-blue-600"/> 붙여넣기 데이터 분석 완료 (이미지 매핑 및 편집)</h2>
                      <button onClick={() => !importModalConfig.isUploading && setImportModalConfig(p => ({ ...p, isOpen: false }))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><X className="w-5 h-5"/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                      {/* 타임라인 이미지 영역 */}
                      {importModalConfig.timelineImages.length > 0 && (
                          <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                              <h3 className="text-sm font-bold text-purple-800 mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4"/> 타임라인 이미지 ➔ 이동 그래프 자동 등록</h3>
                              <p className="text-xs text-slate-500 mb-3">등록할 이동 그래프 이미지를 선택하세요.</p>
                              <div className="flex gap-3 overflow-x-auto pb-2">
                                  {importModalConfig.timelineImages.map((imgBase64, idx) => (
                                      <div key={idx} onClick={() => setImportModalConfig(p => ({ ...p, selectedTimelineImage: imgBase64 }))} className={cn("relative w-40 h-28 shrink-0 rounded-lg cursor-pointer border-[3px] transition-all overflow-hidden", importModalConfig.selectedTimelineImage === imgBase64 ? "border-purple-600 shadow-md" : "border-transparent hover:border-slate-300 opacity-60")}>
                                          <img src={imgBase64} className="w-full h-full object-cover" alt="timeline" />
                                          {importModalConfig.selectedTimelineImage === imgBase64 && <div className="absolute top-1 right-1 bg-purple-600 text-white rounded-full p-0.5"><Check className="w-3 h-3"/></div>}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* 부가력 룰 영역 (1열 세로 배치, 편집 폼, 체크 토글) */}
                      {importModalConfig.pendingRules.length > 0 && (
                          <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><ListTree className="w-4 h-4 text-blue-600"/> 룰 (부가력/AT) 레퍼런스 이미지 선택 및 편집</h3>
                                  <span className="text-xs text-slate-500">우측 상단 체크 해제 시 제외됩니다.</span>
                              </div>
                              {/* ✨ NEW: grid-cols-2를 날리고 flex-col로 1열 시원하게 배치 */}
                              <div className="flex flex-col gap-4">
                                  {importModalConfig.pendingRules.map((rule, ruleIdx) => {
                                      const teethStr = rule.teeth.map((t: number) => t === 0 ? "Gen" : `#${t}`).join(", ");
                                      return (
                                      <div key={ruleIdx} className={cn("border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col transition-opacity", rule.isActive ? "bg-slate-50" : "bg-slate-100 opacity-50")}>
                                          <div className="flex items-center justify-between gap-2 mb-3 border-b border-slate-200 pb-3">
                                              <div className="flex items-center gap-3">
                                                  <span className={cn("font-bold text-sm", getTypeColor(rule.type))}>{teethStr} {rule.type}</span>
                                                  {/* 스텝(Step) 실시간 편집 폼 */}
                                                  <div className="flex items-center bg-white border border-slate-200 rounded px-2 py-0.5 shadow-sm">
                                                      <span className="text-[11px] text-slate-500 mr-1 font-semibold">Step</span>
                                                      <input type="number" value={rule.startStep} disabled={!rule.isActive} onChange={(e) => setImportModalConfig(p => { const newR = [...p.pendingRules]; newR[ruleIdx].startStep = Number(e.target.value); return { ...p, pendingRules: newR }; })} className="w-10 text-center text-xs outline-none bg-transparent font-medium" />
                                                      <span className="text-xs text-slate-400 mx-1">-</span>
                                                      <input type="number" value={rule.endStep} disabled={!rule.isActive} onChange={(e) => setImportModalConfig(p => { const newR = [...p.pendingRules]; newR[ruleIdx].endStep = Number(e.target.value); return { ...p, pendingRules: newR }; })} className="w-10 text-center text-xs outline-none bg-transparent font-medium" />
                                                  </div>
                                              </div>
                                              {/* 비활성화(제외) 스위치 */}
                                              <label className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-200/50 p-1 rounded transition-colors">
                                                  <span className="text-xs font-medium text-slate-500">{rule.isActive ? "추가" : "제외됨"}</span>
                                                  <input type="checkbox" checked={rule.isActive} onChange={(e) => setImportModalConfig(p => { const newR = [...p.pendingRules]; newR[ruleIdx].isActive = e.target.checked; return { ...p, pendingRules: newR }; })} className="w-4 h-4 accent-blue-600 rounded cursor-pointer" />
                                              </label>
                                          </div>
                                          
                                          {/* 메모(Note) 실시간 편집 폼 */}
                                          <div className="flex items-center gap-2 mb-3">
                                              <span className="text-xs font-semibold text-slate-500 shrink-0">메모 :</span>
                                              <input type="text" value={rule.note} disabled={!rule.isActive} onChange={(e) => setImportModalConfig(p => { const newR = [...p.pendingRules]; newR[ruleIdx].note = e.target.value; return { ...p, pendingRules: newR }; })} placeholder="메모를 입력하세요" className="flex-1 bg-white border border-slate-200 rounded px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all shadow-sm" />
                                          </div>
                                          
                                          {/* 1열 배치이므로 사진 영역을 약간 더 쾌적하게 구성 */}
                                          {rule.availableImages && rule.availableImages.length > 0 ? (
                                              <div className={cn("flex gap-3 overflow-x-auto pb-1 mt-auto", !rule.isActive && "pointer-events-none")}>
                                                  {rule.availableImages.map((imgBase64: string, imgIdx: number) => {
                                                      const isSelected = importModalConfig.selectedRuleImages[ruleIdx] === imgBase64;
                                                      return (
                                                          <div key={imgIdx} onClick={() => setImportModalConfig(p => { const newObj = { ...p.selectedRuleImages }; if(isSelected) delete newObj[ruleIdx]; else newObj[ruleIdx] = imgBase64; return { ...p, selectedRuleImages: newObj }; })} className={cn("relative w-32 h-20 shrink-0 rounded cursor-pointer border-[2.5px] transition-all overflow-hidden bg-white", isSelected ? "border-blue-600 shadow-sm" : "border-slate-300 hover:border-blue-300 opacity-80")}>
                                                              <img src={imgBase64} className="w-full h-full object-cover" alt="rule" />
                                                              {isSelected && <div className="absolute bottom-1 right-1 bg-blue-600 text-white rounded-full p-0.5"><Check className="w-3 h-3"/></div>}
                                                          </div>
                                                      )
                                                  })}
                                              </div>
                                          ) : (
                                              <div className="text-xs text-slate-400 italic mt-auto flex items-center gap-1.5 p-2 bg-slate-100/50 rounded border border-dashed border-slate-200"><FileImage className="w-3.5 h-3.5"/> <span>가져올 이미지가 없습니다.</span></div>
                                          )}
                                      </div>
                                  )})}
                              </div>
                          </div>
                      )}
                  </div>
                  
                  <div className="mt-5 pt-4 border-t flex justify-end gap-3 shrink-0">
                      <Button variant="outline" onClick={() => setImportModalConfig(p => ({ ...p, isOpen: false }))} disabled={importModalConfig.isUploading}>취소</Button>
                      <Button className="bg-blue-600 hover:bg-blue-700 min-w-[120px]" onClick={executeFinalImport} disabled={importModalConfig.isUploading}>
                          {importModalConfig.isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> 업로드 중...</> : <><Save className="w-4 h-4 mr-2"/> 선택 완료 및 저장</>}
                      </Button>
                  </div>
              </div>
          </div>
      )}

      {isGridOpen && renderFullScreenGrid()}
    </>
  );
}