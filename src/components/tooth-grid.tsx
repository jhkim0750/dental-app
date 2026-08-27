import React from 'react'

interface ToothGridProps {
  selectedTeeth: string[]
  onToggle: (tooth: string) => void
}

export function ToothGrid({ selectedTeeth, onToggle }: ToothGridProps) {
  // ✨ NEW: 이미 유치가 1개라도 선택된 상태라면 자동으로 스위치를 켜주는 똑똑한 지능형 로직
  const hasPrimarySelected = selectedTeeth.some(t => {
    const num = Number(t);
    return (num >= 51 && num <= 55) || (num >= 61 && num <= 65) || (num >= 71 && num <= 75) || (num >= 81 && num <= 85);
  });
  const [showPrimary, setShowPrimary] = React.useState(hasPrimarySelected);

  React.useEffect(() => {
    if (hasPrimarySelected) setShowPrimary(true);
  }, [hasPrimarySelected]);

  // FDI 표기법 (상악/하악 십자가 배치)
  const q1 = [18, 17, 16, 15, 14, 13, 12, 11]  
  const q2 = [21, 22, 23, 24, 25, 26, 27, 28] 
  const q3 = [48, 47, 46, 45, 44, 43, 42, 41] 
  const q4 = [31, 32, 33, 34, 35, 36, 37, 38] 
  
  // ✨ NEW: 유치 배열 추가
  const pq1 = [55, 54, 53, 52, 51]
  const pq2 = [61, 62, 63, 64, 65]
  const pq3 = [85, 84, 83, 82, 81]
  const pq4 = [71, 72, 73, 74, 75]

  const renderTooth = (num: number) => {
    // ✨ NEW: 치아 번호가 50 이상이면 유치로 판별
    const isPrimary = num >= 50;
    const isSelected = selectedTeeth.includes(num.toString());

    return (
      <button
        key={num}
        onClick={() => onToggle(num.toString())}
        // ✨ 치아 크기와 기본 디자인은 선생님이 보내주신 상태 100% 그대로 유지!
        className={`w-[18px] h-6 text-[9px] font-bold rounded-full flex items-center justify-center transition-colors border shrink-0
          ${isSelected
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' // 선택됨 (기존과 동일한 파란색 유지)
            : isPrimary 
              ? 'bg-white text-amber-500 hover:bg-amber-50 border-amber-400' // ✨ 유치 미선택 (노란색/호박색 테두리와 폰트)
              : 'bg-white text-slate-400 hover:bg-blue-50 border-slate-200'  // 영구치 미선택 (기존과 동일한 회색)
          }`}
      >
        {num}
      </button>
    )
  }
  
  return (
    // ✨ [핵심 수정]: -mx-2 와 w-[calc(100%+16px)] 를 추가해서 회색 박스 자체를 양옆으로 8px씩 늘렸습니다! 
    // 내부 패딩을 px-1.5로 잡아주어 치아가 벽에 닿지 않고 예쁜 여백이 생깁니다.
<div className="flex flex-col items-center bg-slate-50 py-2.5 px-1.5 -mx-2 w-[calc(100%+16px)] rounded-lg border border-slate-300 shadow-inner overflow-hidden">
      <div className="relative w-full flex justify-center items-center mb-2">
        <div className="text-[10px] text-slate-400 font-bold tracking-wide">치아 선택 (FDI)</div>
        {/* ✨ NEW: 유치 ON/OFF 토글 스위치 (우측에 절대 위치로 기존 정렬 1픽셀도 안 해치고 깔끔하게 배치) */}
        <div 
          className="absolute right-1 flex items-center gap-1.5 cursor-pointer group" 
          onClick={() => setShowPrimary(!showPrimary)}
          title="유치(Primary Teeth) 보기"
        >
          <span className={`text-[9px] font-extrabold transition-colors ${showPrimary ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-400'}`}>유치</span>
          <div className={`w-6 h-3 rounded-full relative transition-colors ${showPrimary ? 'bg-blue-500' : 'bg-slate-200'}`}>
            <div className={`absolute top-[1px] left-[1px] w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-transform ${showPrimary ? 'translate-x-3' : 'translate-x-0'}`} />
          </div>
        </div>
      </div>
      
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
            {/* ✨ NEW: 유치 상악 (A안 배치) - 토글 ON일 때만 렌더링 */}
            {showPrimary && (
              <>
                <div className="flex gap-[1px] justify-end">{pq1.map(renderTooth)}</div>
                <div className="flex gap-[1px] justify-start">{pq2.map(renderTooth)}</div>
              </>
            )}

            <div className="flex gap-[1px] justify-end">{q1.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-start">{q2.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-end">{q3.map(renderTooth)}</div>
            <div className="flex gap-[1px] justify-start">{q4.map(renderTooth)}</div>

            {/* ✨ NEW: 유치 하악 (A안 배치) - 토글 ON일 때만 렌더링 */}
            {showPrimary && (
              <>
                <div className="flex gap-[1px] justify-end">{pq3.map(renderTooth)}</div>
                <div className="flex gap-[1px] justify-start">{pq4.map(renderTooth)}</div>
              </>
            )}
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
