"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation"; 
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { ChecklistPanel } from "@/components/checklist-panel";
import { PatientSidebar, PatientSidebarHandle } from "@/components/patient-sidebar";
import { Button } from "@/components/ui/button";
import { FolderOpen, Home, UserPlus, Loader2, Pencil, X } from "lucide-react";

function PatientDashboard() {
  const store = usePatientStoreHydrated();
  const searchParams = useSearchParams();
  const sidebarRef = useRef<PatientSidebarHandle>(null);
  const isFetched = useRef(false);
  
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  
  // 환자 정보 수정 모달 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCaseNumber, setEditCaseNumber] = useState("");
  const [editTotalSteps, setEditTotalSteps] = useState(0);

  useEffect(() => {
    if (store && !isFetched.current) {
        store.fetchPatients();
        isFetched.current = true;
    }
  }, [store]);

  useEffect(() => {
    if (!store || store.patients.length === 0) return;
    const paramId = searchParams.get("patientId");
    if (paramId) store.selectPatient(paramId); 
  }, [searchParams, store]); 

  if (!store) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <p className="text-slate-500 font-semibold">System Loading...</p>
            </div>
        </div>
    );
  }

  const activePatient = store.patients.find((p) => p.id === store.selectedPatientId);

  const handleHomeAddPatient = () => {
    if (sidebarRef.current) sidebarRef.current.openAddModal();
  };

  // 수정 버튼 클릭
  const openEditModal = () => {
      if (activePatient) {
          setEditName(activePatient.name);
          setEditCaseNumber(activePatient.case_number);
          setEditTotalSteps(activePatient.total_steps || 21);
          setIsEditModalOpen(true);
      }
  };

  // 수정 저장
  const handleUpdatePatient = async () => {
      if (!activePatient) return;
      await store.updatePatient(activePatient.id, {
          name: editName,
          case_number: editCaseNumber,
          total_steps: editTotalSteps
      });
      setIsEditModalOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {!activePatient && (
        <aside className="w-[320px] bg-white border-r shadow-sm shrink-0 h-full flex flex-col z-20">
            <PatientSidebar ref={sidebarRef} />
        </aside>
      )}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* 헤더 */}
          <header className="flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm shrink-0 z-10">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <h1 className="text-xl font-extrabold text-blue-600 tracking-tight">Dental Work Note</h1>
                {activePatient ? (
                   // ✨ 여기 아이콘을 Pencil(연필)로 변경
                   <div className="flex items-center gap-2 text-sm text-slate-500 group cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors" onClick={openEditModal} title="Click to Edit Info">
                     <span className="font-bold text-slate-800">{activePatient.name}</span>
                     <span>(#{activePatient.case_number})</span>
                     <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
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
              <ChecklistPanel key={activePatient.id} patient={activePatient} />
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

          {/* 환자 리스트 오버레이 */}
          {activePatient && isOverlayOpen && (
            <div className="absolute inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/50" onClick={() => setIsOverlayOpen(false)} />
              <div className="relative w-[340px] h-full bg-white shadow-xl flex flex-col animate-in slide-in-from-left">
                <PatientSidebar onClose={() => setIsOverlayOpen(false)} />
              </div>
            </div>
          )}

          {/* 헤더에서 띄우는 수정 모달 */}
          {isEditModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setIsEditModalOpen(false)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Pencil className="w-4 h-4"/> Edit Patient Info</h3>
                        <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Name</label><input className="w-full border p-2 rounded" value={editName} onChange={e => setEditName(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Case No.</label><input className="w-full border p-2 rounded" value={editCaseNumber} onChange={e => setEditCaseNumber(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Total Steps</label><input type="number" className="w-full border p-2 rounded" value={editTotalSteps} onChange={e => setEditTotalSteps(Number(e.target.value))} /></div>
                        <Button className="w-full mt-2 bg-blue-600 hover:bg-blue-700 py-6 text-lg" onClick={handleUpdatePatient}>Save Changes</Button>
                    </div>
                </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default function DentalApp() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-slate-500 font-semibold">Dental System Loading...</p>
        </div>
      </div>
    }>
      <PatientDashboard />
    </Suspense>
  );
}