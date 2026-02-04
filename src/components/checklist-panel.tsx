"use client";

import React, { useState } from "react";
import { usePatientStoreHydrated, Rule, Patient, ToothNumber } from "@/hooks/use-patient-store";
import { Maximize2, Minimize2, CheckCheck, ChevronLeft, ChevronRight, Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToothGrid } from "@/components/tooth-grid"; // ✨ 십자가 선택판 불러오기

interface ChecklistPanelProps {
  patient: Patient;
}

const PRESET_TYPES = ["BOS", "Attachment", "Vertical Ridge", "Power Ridge", "Bite Ramp", "IPR", "BC", "TAG", "기타"];

export function ChecklistPanel({ patient }: ChecklistPanelProps) {
  const store = usePatientStoreHydrated();
  const [currentStep, setCurrentStep] = useState(0); // ✨ Step 0부터 시작
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [pageStartStep, setPageStartStep] = useState(0); // ✨ 페이지 시작도 0부터

  // --- 입력 상태 ---
  const [selectedType, setSelectedType] = useState("BOS");
  const [customType, setCustomType] = useState("");
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]); // ✨ ToothGrid는 string[]을 씀
  const [startStep, setStartStep] = useState(1);
  const [endStep, setEndStep] = useState(10);
  const [note, setNote] = useState("");
  const [jumpStepInput, setJumpStepInput] = useState("");

  if (!store) return null;
  const totalSteps = patient.total_steps || 20;

  // --- 로직 ---
  const toggleTooth = (t: string) => {
    setSelectedTeeth(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleAddRules = async () => {
    const finalType = selectedType === "기타" ? customType : selectedType;
    if (!finalType) return alert("Please enter a type name.");
    
    // ✨ 치아 선택 안 했으면 [0] (Gen), 했으면 숫자로 변환
    const teethToSave: number[] = selectedTeeth.length === 0 
      ? [0] 
      : selectedTeeth.map(t => parseInt(t));
    
    for (const tooth of teethToSave) {
      await store.addRule(patient.id, {
        type: finalType,
        tooth, // 0이면 Gen
        startStep,
        endStep,
        note
      });
    }

    setSelectedTeeth([]);
    setNote("");
    if (selectedType === "기타") setCustomType("");
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (confirm("Delete this rule?")) {
      await store.deleteRule(patient.id, ruleId);
    }
  };

  const handleJumpStep = () => {
    const step = Number(jumpStepInput);
    if (step < 0 || step > totalSteps) { // ✨ 0부터 허용
      alert(`Please enter a step between 0 and ${totalSteps}`);
      return;
    }
    setCurrentStep(step);
    setJumpStepInput("");
  };

  const getRulesForStep = (step: number) => {
    return patient.rules.filter((r) => step >= r.startStep && step <= r.endStep)
      .sort((a, b) => a.tooth - b.tooth);
  };

  const getStatus = (rule: Rule, step: number) => {
    if (step === rule.startStep) return "NEW";
    if (step === rule.endStep) return "REMOVE";
    return "CHECK";
  };

  const isChecked = (ruleId: string, step: number) => {
    return patient.checklist_status.some((s) => s.step === step && s.ruleId === ruleId && s.checked);
  };

  const isStepFullyChecked = (step: number) => {
    const rules = getRulesForStep(step);
    if (rules.length === 0) return false;
    return rules.every(r => isChecked(r.id, step));
  };

  // --- 카드 렌더링 ---
  const renderCard = (rule: Rule, step: number, isTiny = false) => {
    const status = getStatus(rule, step);
    const checked = isChecked(rule.id, step);

    return (
      <div
        key={rule.id}
        onClick={() => store.toggleChecklistItem(patient.id, step, rule.id)}
        className={cn(
          "rounded cursor-pointer transition-all flex flex-col relative group",
          isTiny ? "p-1.5 mb-1.5 shadow-sm" : "p-3 mb-2 border",
          checked ? "bg-slate-200/70 text-slate-400 grayscale" : "bg-white hover:ring-2 hover:ring-blue-200",
          status === "NEW" && !checked && "border-l-4 border-l-green-500 shadow-md",
          status === "REMOVE" && !checked && "border-l-4 border-l-red-500 shadow-md"
        )}
      >
        <div className="flex justify-between items-start">
          <span className={cn("font-bold text-slate-800", isTiny ? "text-[11px]" : "text-lg")}>
            {/* ✨ Gen 숨기기 로직: 치아번호가 0일 때만 'Gen' 표시, 아니면 #번호 */}
            {rule.tooth === 0 ? "Gen" : `#${rule.tooth}`}
          </span>
          <div className="flex gap-1 items-center">
            {status === "NEW" && <span className="bg-green-100 text-green-700 px-1 rounded-[3px] font-bold text-[9px]">NEW</span>}
            {status === "REMOVE" && <span className="bg-red-100 text-red-700 px-1 rounded-[3px] font-bold text-[9px]">REM</span>}
             <div className={cn(
               "rounded flex items-center justify-center transition-colors", 
               isTiny ? "w-3 h-3 border" : "w-5 h-5 border", 
               checked ? "bg-slate-500 border-slate-500" : "bg-white border-slate-300"
             )}>
               {checked && <CheckCheck className="text-white w-full h-full p-[1px]" />}
             </div>
          </div>
        </div>
        <div className={cn("font-medium truncate text-slate-700 mt-0.5", isTiny && "text-[10px]")}>{rule.type}</div>
        {rule.note && <div className={cn("text-slate-400 truncate", isTiny ? "text-[9px]" : "mt-1")}>{rule.note}</div>}
      </div>
    );
  };

  // --- 전체 화면 ---
  const renderFullScreenContent = () => {
    // ✨ 0부터 보여주기 위해 수정
    const stepsToShow = Array.from({ length: 10 }, (_, i) => pageStartStep + i);
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* 헤더 */}
        <div className="sticky top-0 z-50 bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-4">
             <h2 className="text-2xl font-bold text-slate-800">Steps {pageStartStep} - {Math.min(pageStartStep + 9, totalSteps)}</h2>
             <div className="flex gap-2">
               <Button variant="outline" disabled={pageStartStep <= 0} onClick={() => setPageStartStep(Math.max(0, pageStartStep - 10))}><ChevronLeft className="w-4 h-4 mr-1"/> Prev 10</Button>
               <Button variant="outline" disabled={pageStartStep + 10 > totalSteps} onClick={() => setPageStartStep(Math.min(totalSteps, pageStartStep + 10))}>Next 10 <ChevronRight className="w-4 h-4 ml-1"/></Button>
             </div>
          </div>
          <Button variant="ghost" onClick={() => setIsFullScreen(false)}><Minimize2 className="w-6 h-6" /> Close</Button>
        </div>

        {/* 메인 영역 */}
        <div className="flex-1 p-6 overflow-auto">
           {/* Main Rules */}
           <div className="mb-8">
              <h3 className="font-bold text-lg mb-2 text-slate-700 flex items-center gap-2">
                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                Main Rules
              </h3>
              <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                 {stepsToShow.map((step, index) => (
                    <div key={step} className={cn(
                        "rounded-lg min-h-[300px] flex flex-col border shadow-sm transition-colors",
                        step > totalSteps ? "bg-slate-100 opacity-30 border-dashed" : (index % 2 === 0 ? "bg-white border-slate-200" : "bg-blue-50/30 border-blue-100")
                      )}>
                        {/* 스텝 헤더 */}
                        <div className={cn(
                          "p-2 border-b flex justify-between items-center font-bold text-xs sticky top-0 rounded-t-lg z-10",
                          step > totalSteps ? "bg-transparent" : (index % 2 === 0 ? "bg-white" : "bg-blue-50/50")
                         )}>
                          <span className="text-slate-600 uppercase tracking-wider">{step === 0 ? "PRE" : `Step ${step}`}</span>
                          {step <= totalSteps && (
                             <button onClick={() => store.checkAllInStep(patient.id, step)} className={cn("hover:bg-slate-200 p-1 rounded", isStepFullyChecked(step) ? "text-green-600 bg-green-50" : "text-slate-300")} title="Check All">
                               <CheckCheck className="w-3.5 h-3.5" />
                             </button>
                           )}
                        </div>
                        <div className="p-2 space-y-1">
                           {step <= totalSteps && getRulesForStep(step).filter(r => r.type !== "Attachment").map(rule => renderCard(rule, step, true))}
                        </div>
                    </div>
                 ))}
              </div>
           </div>

           {/* Attachments */}
           <div className="pb-10">
              <h3 className="font-bold text-lg mb-2 text-slate-700 flex items-center gap-2">
                <span className="w-2 h-6 bg-purple-500 rounded-full"></span>
                Attachments Only
              </h3>
              <div className="grid grid-cols-10 gap-3 min-w-[1400px]">
                 {stepsToShow.map((step, index) => (
                    <div key={step} className={cn(
                        "rounded-lg min-h-[200px] flex flex-col border shadow-sm",
                        step > totalSteps ? "bg-slate-100 opacity-30 border-dashed" : (index % 2 === 0 ? "bg-white border-slate-200" : "bg-purple-50/30 border-purple-100")
                      )}>
                        <div className="p-2 space-y-1 flex-1">
                           {step <= totalSteps && getRulesForStep(step).filter(r => r.type === "Attachment").map(rule => renderCard(rule, step, true))}
                        </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    );
  };

  const rules = getRulesForStep(currentStep);

  return (
    <>
      <div className="flex h-full">
        {/* 왼쪽: 입력 패널 */}
        <div className="w-[350px] border-r bg-white flex flex-col h-full overflow-hidden">
           <div className="p-4 border-b bg-slate-50 shrink-0"><h2 className="font-bold">Rule Definition</h2></div>
           <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500">Item Type</label>
                 <select className="w-full border p-2 rounded" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                    {PRESET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
                 {selectedType === "기타" && (
                    <input className="w-full border p-2 rounded mt-1 text-sm bg-yellow-50" placeholder="직접 입력하세요..." value={customType} onChange={(e) => setCustomType(e.target.value)} />
                 )}
              </div>
              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500">Select Teeth (Optional)</label>
                 {/* ✨ 십자가 선택판 적용 */}
                 <ToothGrid selectedTeeth={selectedTeeth} onToggle={toggleTooth} />
                 <p className="text-[10px] text-slate-400 mt-1">* 선택하지 않으면 '전체(General)'로 저장됩니다.</p>
              </div>
              <div className="flex gap-2">
                 <div className="flex-1"><label className="text-xs font-bold text-slate-500">Start</label><input type="number" className="w-full border p-2 rounded" value={startStep} onChange={(e) => setStartStep(Number(e.target.value))} /></div>
                 <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500">End</label>
                    <div className="flex gap-1">
                        <input type="number" className="w-full border p-2 rounded" value={endStep} onChange={(e) => setEndStep(Number(e.target.value))} />
                        {/* ✨ End 버튼 추가 */}
                        <Button 
                            variant="outline" 
                            className="px-2 text-xs" 
                            onClick={() => setEndStep(totalSteps)}
                            title="Set to Last Step"
                        >
                            End
                        </Button>
                    </div>
                 </div>
              </div>
              <div className="space-y-1">
                 <label className="text-xs font-bold text-slate-500">Note</label>
                 <input className="w-full border p-2 rounded" placeholder="e.g. Mesial" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button onClick={handleAddRules} className="w-full gap-2"><Plus className="w-4 h-4"/> Add Rules</Button>
              <hr className="my-4"/>
              <div className="space-y-2">
                 <h3 className="text-xs font-bold text-slate-500 uppercase">Existing Rules ({patient.rules.length})</h3>
                 {patient.rules.map(rule => (
                    <div key={rule.id} className="text-xs border p-2 rounded bg-slate-50 flex justify-between items-center group">
                       <div>
                          <span className="font-bold">{rule.tooth === 0 ? "Gen" : `#${rule.tooth}`} {rule.type}</span>
                          <span className="text-slate-500 ml-2">({rule.startStep}-{rule.endStep})</span>
                       </div>
                       <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-3 h-3"/>
                       </button>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* 오른쪽: 체크리스트 뷰 */}
        <div className="flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden">
           <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm shrink-0">
             <div><h2 className="font-bold text-lg text-slate-800">Checklist Execution</h2></div>
             <Button variant="outline" size="icon" onClick={() => setIsFullScreen(true)}><Maximize2 className="w-4 h-4" /></Button>
           </div>
           
           <div className="flex items-center justify-between p-3 border-b bg-white shrink-0">
             {/* ✨ 0부터 이동 가능하도록 disabled 조건 수정 */}
             <Button variant="ghost" size="sm" onClick={() => setCurrentStep(p => Math.max(0, p - 1))} disabled={currentStep === 0}><ChevronLeft className="w-4 h-4" /></Button>
             <div className="flex flex-col items-center gap-1">
                <div className="text-lg font-bold text-slate-900">{currentStep === 0 ? "PRE (준비)" : `Step ${currentStep}`}</div>
                <div className="flex items-center gap-1">
                   <input type="number" placeholder="Go to..." className="w-16 h-6 text-xs text-center border rounded focus:border-blue-500 outline-none" value={jumpStepInput} onChange={(e) => setJumpStepInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJumpStep()} />
                   <button onClick={handleJumpStep} className="h-6 w-6 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200"><ArrowRight className="w-3 h-3 text-slate-600"/></button>
                </div>
             </div>
             <Button variant="ghost" size="sm" onClick={() => setCurrentStep(p => Math.min(totalSteps, p + 1))} disabled={currentStep === totalSteps}><ChevronRight className="w-4 h-4" /></Button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 space-y-2">
             {rules.length === 0 ? <div className="text-center py-10 text-slate-400 text-sm">No actions required for Step {currentStep}</div> : rules.map(rule => renderCard(rule, currentStep))}
           </div>
        </div>
      </div>

      {isFullScreen && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-50">
           {renderFullScreenContent()}
        </div>
      )}
    </>
  );
}