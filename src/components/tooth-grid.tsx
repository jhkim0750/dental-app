import React from 'react'

interface ToothGridProps {
  selectedTeeth: string[]
  onToggle: (tooth: string) => void
}

export function ToothGrid({ selectedTeeth, onToggle }: ToothGridProps) {
  // FDI 표기법 (상악/하악 십자가 배치)
  const q1 = [18, 17, 16, 15, 14, 13, 12, 11] 
  const q2 = [21, 22, 23, 24, 25, 26, 27, 28] 
  const q3 = [48, 47, 46, 45, 44, 43, 42, 41] 
  const q4 = [31, 32, 33, 34, 35, 36, 37, 38] 

  const renderTooth = (num: number) => (
    <button
      key={num}
      onClick={() => onToggle(num.toString())}
      // ✨ 치아 크기는 선생님이 보내주신 w-[18px] 그대로 유지!
      className={`w-[18px] h-6 text-[9px] font-bold rounded-full flex items-center justify-center transition-colors border shrink-0
        ${selectedTeeth.includes(num.toString())
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
          : 'bg-white text-slate-400 hover:bg-blue-50 border-slate-200'}`}
    >
      {num}
    </button>
  )

  return (
    // ✨ [핵심 수정]: -mx-2 와 w-[calc(100%+16px)] 를 추가해서 회색 박스 자체를 양옆으로 8px씩 늘렸습니다! 
    // 내부 패딩을 px-1.5로 잡아주어 치아가 벽에 닿지 않고 예쁜 여백이 생깁니다.
    <div className="flex flex-col items-center bg-slate-50 py-2.5 px-1.5 -mx-2 w-[calc(100%+16px)] rounded-lg border border-slate-300 shadow-inner overflow-hidden">
      <div className="text-[10px] text-slate-400 mb-2 font-bold tracking-wide">치아 선택 (FDI)</div>
      
      <div className="relative flex flex-col items-center gap-1.5 w-full">
        
        <button
          onClick={() => onToggle('10')}
          className={`px-4 py-0.5 text-[10px] font-extrabold rounded-full border transition-all z-20 shadow-sm
            ${selectedTeeth.includes('10') 
              ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200' 
              : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
        >
          MAX
        </button>

        <div className="relative py-1 w-full flex justify-center my-0.5">
          {/* 십자가 선 */}
          <div className="absolute top-1/2 left-0 w-full h-px bg-slate-300 -translate-y-1/2" />
          <div className="absolute top-0 left-1/2 w-px h-full bg-slate-300 -translate-x-1/2" />
          
          {/* 치아 배치 */}
          <div className="relative z-10 grid grid-cols-2 gap-x-1 gap-y-1.5">
            <div className="flex gap-[1px] justify-end">{q1.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-start">{q2.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-end">{q3.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-start">{q4.map(renderTooth)}</div>
          </div>
        </div>

        <button
          onClick={() => onToggle('30')}
          className={`px-4 py-0.5 text-[10px] font-extrabold rounded-full border transition-all z-20 shadow-sm
            ${selectedTeeth.includes('30') 
              ? 'bg-red-600 text-white border-red-600 ring-2 ring-red-200' 
              : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}
        >
          MAN
        </button>

      </div>
    </div>
  )
}