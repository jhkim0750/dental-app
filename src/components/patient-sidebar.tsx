"use client";

import React, { useState } from "react";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { Plus, User, Trash2, X, Search, Pencil, Hospital } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PatientSidebarProps {
  onClose?: () => void;
}

export function PatientSidebar({ onClose }: PatientSidebarProps) {
  const store = usePatientStoreHydrated();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState("");

  // 입력 폼 상태
  const [name, setName] = useState("");
  const [caseNum, setCaseNum] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [totalSteps, setTotalSteps] = useState(20);

  if (!store) return null;

  // 검색 필터링
  const filteredPatients = store.patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.case_number.includes(searchTerm)
  );

  // 모달 열기 (추가 모드)
  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setName("");
    setCaseNum("");
    setClinicName("");
    setTotalSteps(20);
    setIsModalOpen(true);
  };

  // 모달 열기 (수정 모드)
  const openEditModal = (e: React.MouseEvent, patient: any) => {
    e.stopPropagation();
    setIsEditMode(true);
    setEditingId(patient.id);
    setName(patient.name);
    setCaseNum(patient.case_number);
    setClinicName(patient.clinic_name || "");
    setTotalSteps(patient.total_steps);
    setIsModalOpen(true);
  };

  // 저장 (추가 또는 수정)
  const handleSave = async () => {
    if (!name || !caseNum) return alert("이름과 케이스 번호는 필수입니다.");

    if (isEditMode && editingId) {
      if (store.updatePatient) {
        await store.updatePatient(editingId, name, caseNum, totalSteps, clinicName);
      } else {
        alert("수정 기능이 스토어에 업데이트되지 않았습니다.");
      }
    } else {
      await store.addPatient(name, caseNum, totalSteps, clinicName);
    }
    
    setIsModalOpen(false);
    // ✨ 환자를 추가/수정하고 나서는 사이드바를 닫지 않고 유지하는게 일반적인 UX입니다.
    // 필요하다면 아래 주석을 해제하세요.
    // if (!isEditMode && onClose) onClose();
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      await store.deletePatient(id);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r relative">
      {/* ✨ 헤더 디자인 수정: 버튼 겹침 해결 */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50 shrink-0">
        <h2 className="font-bold text-lg text-slate-800">Patients List</h2>
        <div className="flex items-center gap-2">
            <Button size="sm" onClick={openAddModal} className="h-8 px-2 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
            {/* ✨ 닫기 버튼을 헤더 안으로 통합 */}
            {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                </Button>
            )}
        </div>
      </div>

      {/* 검색창 */}
      <div className="p-3 border-b bg-white shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-slate-50 focus:bg-white transition-all outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 placeholder:text-slate-400"
            placeholder="Search name or case..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {store.isLoading ? (
          <div className="text-center text-slate-400 py-10 text-sm">Loading...</div>
        ) : filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
            <Search className="w-8 h-8 opacity-20" />
            <span className="text-sm">{searchTerm ? "No results found." : "No patients yet."}</span>
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <div
              key={patient.id}
              onClick={() => {
                store.selectPatient(patient.id);
                if (onClose) onClose();
              }}
              className={`
                group flex items-center justify-between p-3 rounded-lg cursor-pointer border transition-all
                ${store.selectedPatientId === patient.id 
                  ? "bg-blue-50 border-blue-200 shadow-sm" 
                  : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-200"}
              `}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`
                  w-9 h-9 rounded-full flex items-center justify-center shrink-0 border
                  ${store.selectedPatientId === patient.id ? "bg-white border-blue-100 text-blue-600" : "bg-slate-50 border-slate-100 text-slate-400"}
                `}>
                  <User className="w-4 h-4" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-bold text-sm truncate text-slate-800">{patient.name}</span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">#{patient.case_number}</span>
                    {(patient as any).clinic_name && (
                      <span className="text-blue-600 flex items-center gap-0.5 truncate max-w-[80px]">
                         <Hospital size={10} /> {(patient as any).clinic_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => openEditModal(e, patient)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, patient.id, patient.name)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 추가/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg">{isEditMode ? "Edit Patient" : "Add New Patient"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Name</label>
                <input 
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Kim"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Case Number</label>
                <input 
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 1221"
                  value={caseNum}
                  onChange={(e) => setCaseNum(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Clinic Name (Optional)</label>
                <input 
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Seoul Dental"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Total Steps</label>
                <input 
                  type="number"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={totalSteps}
                  onChange={(e) => setTotalSteps(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 flex justify-end gap-2 border-t">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">{isEditMode ? "Save Changes" : "Create Patient"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}