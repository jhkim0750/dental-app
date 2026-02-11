"use client";

import React, { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { usePatientStoreHydrated, Patient } from "@/hooks/use-patient-store";
import { 
  Search, Plus, User, Trash2, ChevronRight, X, AlertTriangle, RotateCcw, Archive 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PatientSidebarHandle {
  openAddModal: () => void;
}

interface PatientSidebarProps {
  onClose?: () => void;
}

export const PatientSidebar = forwardRef<PatientSidebarHandle, PatientSidebarProps>(
  ({ onClose }, ref) => {
    const store = usePatientStoreHydrated();
    const [searchTerm, setSearchTerm] = useState("");
    
    const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmHardDeleteId, setConfirmHardDeleteId] = useState<string | null>(null);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newPatientName, setNewPatientName] = useState("");
    const [newCaseNumber, setNewCaseNumber] = useState("");
    const [newTotalSteps, setNewTotalSteps] = useState(21);

    useImperativeHandle(ref, () => ({
      openAddModal: () => setIsAddModalOpen(true),
    }));

    // ✨ [추가] 엔터키(Enter) 및 ESC 키 감지 (환자 삭제용)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (confirmDeleteId) {
                if (e.key === 'Enter') handleSoftDelete();
                if (e.key === 'Escape') setConfirmDeleteId(null);
            }
            if (confirmHardDeleteId) {
                if (e.key === 'Enter') handleHardDelete();
                if (e.key === 'Escape') setConfirmHardDeleteId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmDeleteId, confirmHardDeleteId]);

    if (!store) return null;

    const filteredPatients = store.patients.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.case_number.includes(searchTerm);
      if (viewMode === 'active') return matchesSearch && !p.isDeleted;
      else return matchesSearch && p.isDeleted;
    });

    const handleAddPatient = async () => {
      if (!newPatientName || !newCaseNumber) return alert("Please fill in all fields");
      await store.addPatient(newPatientName, newCaseNumber, newTotalSteps);
      setIsAddModalOpen(false);
      setNewPatientName("");
      setNewCaseNumber("");
      setNewTotalSteps(21);
    };

    const handleSoftDelete = async () => {
        if (confirmDeleteId) {
            await store.softDeletePatient(confirmDeleteId);
            setConfirmDeleteId(null);
        }
    };

    const handleHardDelete = async () => {
        if (confirmHardDeleteId) {
            await store.hardDeletePatient(confirmHardDeleteId);
            setConfirmHardDeleteId(null);
        }
    };

    return (
      <div className="flex flex-col h-full bg-white relative">
        <div className="p-4 border-b shrink-0 flex items-center justify-between bg-slate-50">
           <div className="flex flex-col">
              <h2 className="font-bold text-lg flex items-center gap-2">
                 {viewMode === 'active' ? 'Patients List' : '🗑️ Trash Can'}
              </h2>
              <span className="text-xs text-slate-500">
                {filteredPatients.length} {viewMode === 'active' ? 'Active' : 'Deleted'} cases
              </span>
           </div>
           <div className="flex gap-1">
               {viewMode === 'active' ? (
                   <Button variant="ghost" size="icon" onClick={() => setViewMode('trash')} title="Go to Trash" className="text-slate-400 hover:text-red-500">
                       <Trash2 className="w-4 h-4" />
                   </Button>
               ) : (
                   <Button variant="ghost" size="icon" onClick={() => setViewMode('active')} title="Back to List" className="text-green-600 bg-green-50 hover:bg-green-100">
                       <Archive className="w-4 h-4" />
                   </Button>
               )}
               {onClose && <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5"/></Button>}
           </div>
        </div>

        {viewMode === 'active' && (
            <div className="p-3 border-b space-y-2 shrink-0 bg-white">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                    placeholder="Search name or case..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={() => setIsAddModalOpen(true)}>
                    <Plus className="w-4 h-4" /> Add Patient
                </Button>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-2 relative">
           {store.isLoading ? (
               <div className="text-center p-10 text-slate-400 animate-pulse">Loading...</div>
           ) : filteredPatients.length === 0 ? (
               <div className="text-center p-10 text-slate-400 text-sm">
                   {viewMode === 'active' ? "No patients found." : "Trash is empty."}
               </div>
           ) : (
               filteredPatients.map((patient) => (
                <div
                    key={patient.id}
                    onClick={() => viewMode === 'active' && store.selectPatient(patient.id)}
                    className={cn(
                    "group relative p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer flex justify-between items-center",
                    store.selectedPatientId === patient.id && viewMode === 'active'
                        ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500"
                        : "bg-white border-slate-200 hover:border-blue-300",
                    viewMode === 'trash' && "opacity-75 bg-slate-50"
                    )}
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", viewMode === 'active' ? "bg-blue-100 text-blue-600" : "bg-red-100 text-red-500")}>
                            {viewMode === 'active' ? <User className="w-5 h-5" /> : <Trash2 className="w-5 h-5"/>}
                        </div>
                        <div className="flex flex-col truncate">
                            <span className="font-bold text-slate-800 truncate">{patient.name}</span>
                            <span className="text-xs text-slate-500 truncate">#{patient.case_number}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {viewMode === 'active' ? (
                            <>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(patient.id); }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                            </>
                        ) : (
                            <>
                                <Button size="sm" variant="outline" className="text-green-600 hover:bg-green-50 h-8 px-2" onClick={(e) => { e.stopPropagation(); store.restorePatient(patient.id); }} title="Restore">
                                    <RotateCcw className="w-3.5 h-3.5 mr-1"/> Restore
                                </Button>
                                <Button size="sm" variant="destructive" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); setConfirmHardDeleteId(patient.id); }} title="Delete Forever">
                                    <X className="w-3.5 h-3.5"/>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
               ))
           )}
        </div>

        {confirmDeleteId && (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white border-2 border-red-100 shadow-xl rounded-xl p-5 w-full max-w-[300px] text-center">
                    <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Trash2 className="w-6 h-6"/>
                    </div>
                    <h3 className="font-bold text-lg text-slate-800">Move to Trash?</h3>
                    <p className="text-sm text-slate-500 mb-4">You can restore this patient later.</p>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                        <Button variant="destructive" className="flex-1" onClick={handleSoftDelete} autoFocus>Delete (Enter)</Button>
                    </div>
                </div>
            </div>
        )}

        {confirmHardDeleteId && (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white border-2 border-red-500 shadow-xl rounded-xl p-5 w-full max-w-[300px] text-center">
                    <div className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                        <AlertTriangle className="w-6 h-6"/>
                    </div>
                    <h3 className="font-bold text-lg text-red-600">Delete Forever?</h3>
                    <p className="text-sm text-slate-500 mb-4">This action cannot be undone.</p>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setConfirmHardDeleteId(null)}>Cancel</Button>
                        <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleHardDelete} autoFocus>Delete!</Button>
                    </div>
                </div>
            </div>
        )}

        {isAddModalOpen && (
            <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold">Add New Patient</h3>
                        <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                    </div>
                    <div className="p-4 space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Patient Name</label>
                            <input className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. John Doe" autoFocus value={newPatientName} onChange={e => setNewPatientName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Case Number</label>
                            <input className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 2024-001" value={newCaseNumber} onChange={e => setNewCaseNumber(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">Total Steps</label>
                            <input type="number" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={newTotalSteps} onChange={e => setNewTotalSteps(Number(e.target.value))} />
                        </div>
                        <Button className="w-full mt-2 bg-blue-600 hover:bg-blue-700" onClick={handleAddPatient}>Create Case</Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }
);

PatientSidebar.displayName = "PatientSidebar";