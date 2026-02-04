"use client";

import React, { useState } from "react";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { Plus, User, Trash2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PatientSidebarProps {
  onClose?: () => void;
}

export function PatientSidebar({ onClose }: PatientSidebarProps) {
  const store = usePatientStoreHydrated();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 검색어 상태
  const [searchTerm, setSearchTerm] = useState("");

  const [newName, setNewName] = useState("");
  const [newCaseNum, setNewCaseNum] = useState("");
  const [newTotalSteps, setNewTotalSteps] = useState(20);

  if (!store) return null;

  // --- 검색 필터링 로직 ---
  // DB 컬럼명(snake_case)에 맞춰서 수정됨
  const filteredPatients = store.patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.case_number.includes(searchTerm)
  );

  const handleAddPatient = async () => {
    if (!newName || !newCaseNum) return;
    await store.addPatient(newName, newCaseNum, newTotalSteps); // await 추가
    setNewName("");
    setNewCaseNum("");
    setNewTotalSteps(20);
    setIsAddModalOpen(false);
    if (onClose) onClose();
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      await store.deletePatient(id); // await 추가
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r relative">
      {/* 헤더 */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-50">
        <h2 className="font-bold text-lg">Patients</h2>
        <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
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
                  {/* 여기도 case_number, total_steps로 수정됨 */}
                  <span className="text-xs text-slate-500">#{patient.case_number} • {patient.total_steps} steps</span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, patient.id, patient.name)}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 모달 (기존 동일) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-4 py-3 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg">Add New Patient</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input 
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  placeholder="e.g. Kim"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Case Number</label>
                <input 
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  placeholder="e.g. 1221"
                  value={newCaseNum}
                  onChange={(e) => setNewCaseNum(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Steps</label>
                <input 
                  type="number"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-blue-500"
                  value={newTotalSteps}
                  onChange={(e) => setNewTotalSteps(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddPatient}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
