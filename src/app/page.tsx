"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { ChecklistPanel } from "@/components/checklist-panel";
import { PatientSidebar, PatientSidebarHandle } from "@/components/patient-sidebar";
import { Button } from "@/components/ui/button";
import { FolderOpen, Home, UserPlus, X } from "lucide-react";

export default function DentalApp() {
  const store = usePatientStoreHydrated();
  const sidebarRef = useRef<PatientSidebarHandle>(null);
  
  // 오버레이 사이드바 열림 상태 (작업 중일 때만 사용)
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  useEffect(() => {
    store.fetchPatients();
  }, []);

  if (!store) return <div className="p-10">Loading...</div>;

  const activePatient = store.patients.find((p) => p.id === store.selectedPatientId);

  // ✨ 홈 화면에서 'Add Patient' 버튼 눌렀을 때
  const handleHomeAddPatient = () => {
    if (sidebarRef.current) {
        sidebarRef.current.openAddModal();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* 1️⃣ 홈 화면일 때만 보이는 고정 사이드바 (닫기 버튼 없음) */}
      {!activePatient && (
        <aside className="w-[320px] bg-white border-r shadow-sm shrink-0 h-full flex flex-col z-20">
           {/* 고정 사이드바에는 onClose를 전달하지 않음 -> X 버튼 사라짐 */}
           <PatientSidebar ref={sidebarRef} />
        </aside>
      )}

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {/* 헤더 */}
          <header className="flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm shrink-0 z-10">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <h1 className="text-xl font-extrabold text-blue-600 tracking-tight">Dental Work Note</h1>
                {activePatient ? (
                   <div className="flex items-center gap-2 text-sm text-slate-500">
                     <span className="font-bold text-slate-800">{activePatient.name}</span>
                     <span>(#{activePatient.case_number})</span>
                   </div>
                ) : (
                   <span className="text-xs text-slate-400">Select or create a patient</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => store.selectPatient(null)} title="Go Home">
                <Home className="w-5 h-5 text-slate-600" />
              </Button>
              {/* ✨ 작업 중일 때만 보이는 'Patients' 버튼 */}
              {activePatient && (
                <Button variant="outline" className="gap-2" onClick={() => setIsOverlayOpen(true)}>
                  <FolderOpen className="w-4 h-4" />
                  Patients
                </Button>
              )}
            </div>
          </header>

          {/* 메인 작업 영역 */}
          <main className="flex-1 overflow-hidden relative bg-slate-100">
            {activePatient ? (
              <ChecklistPanel patient={activePatient} />
            ) : (
              // 홈 화면 (환자 선택 전)
              <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                  <UserPlus className="w-10 h-10 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to start?</h2>
                    <p className="text-slate-500 max-w-md">Select an existing patient from the left list<br/>or create a new case right here.</p>
                </div>
                {/* ✨ 이 버튼을 누르면 왼쪽 고정 사이드바의 모달이 열립니다 */}
                <Button size="lg" className="mt-4 gap-2 text-lg px-8 py-6 shadow-lg shadow-blue-200" onClick={handleHomeAddPatient}>
                  <UserPlus className="w-5 h-5" />
                  Add Patient
                </Button>
              </div>
            )}
          </main>

          {/* 2️⃣ 작업 중일 때만 보이는 오버레이 사이드바 (닫기 버튼 있음) */}
          {activePatient && isOverlayOpen && (
            <div className="absolute inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/50" onClick={() => setIsOverlayOpen(false)} />
              <div className="relative w-[340px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-left">
                {/* 오버레이 사이드바에는 onClose를 전달 -> X 버튼 생김 */}
                <PatientSidebar onClose={() => setIsOverlayOpen(false)} />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}