"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation"; 
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { ChecklistPanel } from "@/components/checklist-panel";
import { PatientSidebar, PatientSidebarHandle } from "@/components/patient-sidebar";
import { Button } from "@/components/ui/button";
import { FolderOpen, Home, UserPlus, Loader2 } from "lucide-react";

// 1. 기존 로직을 담당하는 메인 대시보드 컴포넌트 (내용은 그대로임)
function PatientDashboard() {
  const store = usePatientStoreHydrated();
  const searchParams = useSearchParams();
  const sidebarRef = useRef<PatientSidebarHandle>(null);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  useEffect(() => {
    store.fetchPatients();
  }, []);

  useEffect(() => {
    if (!store || store.patients.length === 0) return;
    const paramId = searchParams.get("patientId");
    if (paramId) {
      store.selectPatient(paramId); 
    }
  }, [searchParams, store?.patients]); 

  if (!store) return <div className="p-10">Loading...</div>;

  const activePatient = store.patients.find((p) => p.id === store.selectedPatientId);

  const handleHomeAddPatient = () => {
    if (sidebarRef.current) sidebarRef.current.openAddModal();
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {!activePatient && (
        <aside className="w-[320px] bg-white border-r shadow-sm shrink-0 h-full flex flex-col z-20">
            <PatientSidebar ref={sidebarRef} />
        </aside>
      )}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
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
              {activePatient && (
                <Button variant="outline" className="gap-2" onClick={() => setIsOverlayOpen(true)}>
                  <FolderOpen className="w-4 h-4" />
                  Patients
                </Button>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-hidden relative bg-slate-100">
            {activePatient ? (
              <ChecklistPanel patient={activePatient} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                  <UserPlus className="w-10 h-10 text-blue-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to start?</h2>
                    <p className="text-slate-500 max-w-md">Select an existing patient from the left list<br/>or create a new case right here.</p>
                </div>
                <Button size="lg" className="mt-4 gap-2 text-lg px-8 py-6 shadow-lg shadow-blue-200" onClick={handleHomeAddPatient}>
                  <UserPlus className="w-5 h-5" />
                  Add Patient
                </Button>
              </div>
            )}
          </main>
          {activePatient && isOverlayOpen && (
            <div className="absolute inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/50" onClick={() => setIsOverlayOpen(false)} />
              <div className="relative w-[340px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-left">
                <PatientSidebar onClose={() => setIsOverlayOpen(false)} />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

// 2. ✨ 최종 Export: Suspense 경계를 설정하여 Vercel 빌드 에러 해결
export default function DentalApp() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-slate-500 font-medium">Dental System Loading...</p>
        </div>
      </div>
    }>
      <PatientDashboard />
    </Suspense>
  );
}