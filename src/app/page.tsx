"use client";

import React, { useState, useEffect } from "react";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { ChecklistPanel } from "@/components/checklist-panel";
import { PatientSidebar } from "@/components/patient-sidebar";
import { Button } from "@/components/ui/button";
import { FolderOpen, Home, UserPlus } from "lucide-react";

export default function DentalApp() {
  const store = usePatientStoreHydrated();
  // ✨ [수정 1] 처음에 사이드바가 열려있도록 설정 (true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- 앱 시작 시 데이터 불러오기 ---
  useEffect(() => {
    store.fetchPatients();
  }, []);

  // 로딩 중이거나 스토어가 준비 안 됐을 때
  if (!store) return <div className="p-10">Loading...</div>;

  const activePatient = store.patients.find((p) => p.id === store.selectedPatientId);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 relative">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-blue-600 tracking-tight">Dental Work Note</h1>
            {activePatient ? (
               <div className="flex items-center gap-2 text-sm text-slate-500">
                 <span className="font-bold text-slate-800">{activePatient.name}</span>
                 <span>(#{activePatient.case_number})</span>
               </div>
            ) : (
               <span className="text-xs text-slate-400">No active case</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => store.selectPatient(null)} title="Go Home">
            <Home className="w-5 h-5 text-slate-600" />
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setIsSidebarOpen(true)}>
            <FolderOpen className="w-4 h-4" />
            Patients
          </Button>
        </div>
      </header>

      {/* 메인 작업 영역 */}
      <main className="flex-1 overflow-hidden relative">
        {activePatient ? (
          <ChecklistPanel patient={activePatient} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-6 bg-slate-50">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <FolderOpen className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Ready to start?</h2>
            <p className="text-slate-500 max-w-md">Select an existing patient from the list or create a new case.</p>
            {/* ✨ [수정 2] 버튼 문구 변경 및 아이콘 변경 */}
            <Button size="lg" className="mt-4 gap-2 text-lg px-8 py-6" onClick={() => setIsSidebarOpen(true)}>
              <UserPlus className="w-5 h-5" />
              Add Patient
            </Button>
          </div>
        )}
      </main>

      {/* 사이드바 */}
      {isSidebarOpen && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-[340px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-left">
            {/* ✨ X 버튼을 여기서 제거하고 PatientSidebar 내부로 이동하여 디자인 통합 */}
            <PatientSidebar onClose={() => setIsSidebarOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}