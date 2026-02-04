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
  const [clinicName, setClinicName] = useState(""); // ✨ 치과 이름 추가
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

  // 모달 열기 (수정 모드) ✨
  const openEditModal = (e: React.MouseEvent, patient: any) => {
    e.stopPropagation(); // 환자 선택 방지
    setIsEditMode(true);
    setEditingId(patient.id);
    setName(patient.name);
    setCaseNum(patient.case_number);
    setClinicName(patient.clinic_name || "");
    setTotalSteps(patient.total_steps);
    setIsModalOpen(true);
  };

  // 저장 (추가 또는 수정) ✨
  const handleSave = async () => {
    if (!name || !caseNum) return alert("이름과 케이스 번호는 필수입니다.");

    if (isEditMode && editingId) {
      // 수정 기능 (store에 updatePatient가 있다고 가정)
      if (store.updatePatient) {
        await store.updatePatient(editingId, name, caseNum, totalSteps, clinicName);
      } else {
        alert("수정 기능이 스토어에 업데이트되지 않았습니다.");
      }
    } else {
      // 추가 기능
      await store.addPatient(name, caseNum, totalSteps, clinicName);
    }
    
    setIsModalOpen(false);
    if (!isEditMode && onClose) onClose();
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      await store.deletePatient(id);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r relative">
      {/* 헤더 */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50">
        <h2 className="font-bold text-lg">Patients</h2>
        <Button size="sm" onClick={openAddModal}>
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {/* 검색창 */}
      <div className="p-2 border-b bg-white">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            className="w-full border rounded pl-8 pr-2 py-2 text-sm bg-slate-50 focus:bg-white transition-colors outline-none focus:ring-1 focus:ring-blue-500"
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
          <div className="text-center text-slate-400 py-10 text-sm">
            {searchTerm ? "No results found." : "No patients yet."}
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
                  : "bg-white border-transparent hover:bg-slate-100 hover:border-slate-200"}
              `}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center shrink-0
                  ${store.selectedPatientId === patient.id ? "bg-blue-200 text-blue-700" : "bg-slate-200 text-slate-500"}
                `}>
                  <User className="w-4 h-4" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-bold text-sm truncate">{patient.name}</span>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span>#{patient.case_number}</span>
                    {patient.clinic_name && ( // ✨ 치과 이름 표시
                      <>
                        <span>•</span>
                        <span className="text-blue-600 flex items-center gap-0.5">
                           <Hospital size={10} /> {patient.clinic_name}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">{patient.total_steps} steps</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* ✨ 수정 버튼 */}
                <button
                  onClick={(e) => openEditModal(e, patient)}
                  className="p-2 text-slate-400 hover:text-blue-600"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, patient.id, patient.name)}
                  className="p-2 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input 
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  placeholder="e.g. Kim"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Case Number</label>
                <input 
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  placeholder="e.g. 1221"
                  value={caseNum}
                  onChange={(e) => setCaseNum(e.target.value)}
                />
              </div>
              {/* ✨ 치과 이름 입력칸 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clinic Name (Optional)</label>
                <input 
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  placeholder="e.g. Seoul Dental"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Steps</label>
                <input 
                  type="number"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  value={totalSteps}
                  onChange={(e) => setTotalSteps(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
