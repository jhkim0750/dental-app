import React from 'react'

interface ToothGridProps {
  selectedTeeth: string[]
  onToggle: (tooth: string) => void
}

export function ToothGrid({ selectedTeeth, onToggle }: ToothGridProps) {
  // FDI 표기법 (상악/하악 십자가 배치)
  const q1 = [18, 17, 16, 15, 14, 13, 12, 11] // 우측 상악
  const q2 = [21, 22, 23, 24, 25, 26, 27, 28] // 좌측 상악
  const q3 = [48, 47, 46, 45, 44, 43, 42, 41] // 우측 하악
  const q4 = [31, 32, 33, 34, 35, 36, 37, 38] // 좌측 하악

  const renderTooth = (num: number) => (
    <button
      key={num}
      onClick={() => onToggle(num.toString())}
      className={`w-8 h-8 text-xs font-bold rounded-full flex items-center justify-center transition-colors border
        ${selectedTeeth.includes(num.toString())
          ? 'bg-blue-600 text-white border-blue-600' 
          : 'bg-white text-gray-400 hover:bg-blue-50 border-gray-200'}`}
    >
      {num}
    </button>
  )

  return (
    <div className="flex flex-col items-center gap-1 bg-gray-50 p-3 rounded-lg border border-gray-200 w-full">
      <div className="text-[10px] text-gray-400 mb-1 font-medium">치아 선택 (FDI)</div>
      <div className="relative p-1">
        {/* 십자가 선 */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-gray-300 -translate-y-1/2" />
        <div className="absolute top-0 left-1/2 w-px h-full bg-gray-300 -translate-x-1/2" />
        
        {/* 치아 배치 */}
        <div className="relative z-10 grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex gap-0.5 justify-end">{q1.map(renderTooth)}</div>
          <div className="flex gap-0.5 justify-start">{q2.map(renderTooth)}</div>
          <div className="flex gap-0.5 justify-end">{q3.map(renderTooth)}</div>
          <div className="flex gap-0.5 justify-start">{q4.map(renderTooth)}</div>
        </div>
      </div>
    </div>
  )
}