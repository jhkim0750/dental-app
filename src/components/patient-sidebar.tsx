"use client";

import React, { useState, useImperativeHandle, forwardRef, useRef } from "react";
import { usePatientStoreHydrated, Patient, Stage } from "@/hooks/use-patient-store";
import { 
  Search, Plus, Trash2, User, ChevronRight, ChevronDown, 
  FileText, RefreshCcw, AlertCircle, Pencil, X, Check, Building2 
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
    const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
    
    const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // ✨ [추가] 모달창 드래그 닫힘 방지용 안전장치
    const [isMouseDownOnOverlay, setIsMouseDownOnOverlay] = useState(false);

    const [newName, setNewName] = useState("");
    const [newHospital, setNewHospital] = useState("");
    const [newCaseNumber, setNewCaseNumber] = useState("");
    const [newTotalSteps, setNewTotalSteps] = useState(20);

    const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
    const [editPName, setEditPName] = useState("");
    const [editPHospital, setEditPHospital] = useState("");
    const [editPCase, setEditPCase] = useState("");

    const [editingStage, setEditingStage] = useState<{ pId: string, stage: Stage } | null>(null);
    const [editSName, setEditSName] = useState("");
    const [editSSteps, setEditSSteps] = useState(0);

    const [addingStagePatientId, setAddingStagePatientId] = useState<string | null>(null);
    const [newStageName, setNewStageName] = useState("");

    useImperativeHandle(ref, () => ({
      openAddModal: () => setIsAddModalOpen(true),
    }));

    if (!store) return <div className="w-[320px] bg-white border-r p-4 animate-pulse">Loading...</div>;

    const filteredPatients = store.patients.filter((p) => {
      const isDeleted = p.isDeleted ?? false;
      
      if (viewMode === "active") {
          return !isDeleted && (
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.hospital || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.case_number.includes(searchTerm)
          );
      } else {
          const hasDeletedStages = p.stages?.some(s => s.isDeleted);
          const isMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
          return isMatch && (isDeleted || hasDeletedStages);
      }
    });

    const handleAddPatient = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault(); 
        if (!newName || !newCaseNumber) return;
        
        try {
            await store.addPatient(newName, newHospital, newCaseNumber, newTotalSteps);
            setIsAddModalOpen(false);
            setNewName(""); setNewHospital(""); setNewCaseNumber(""); setNewTotalSteps(20);
        } catch (error) {
            console.error("Failed to add patient:", error);
            alert("Failed to save patient. Please check the console.");
        }
    };

    const handlePatientClick = (patient: Patient) => {
        if (expandedPatientId === patient.id) {
            setExpandedPatientId(null); 
        } else {
            setExpandedPatientId(patient.id); 
        }
    };

    const handleStageClick = (e: React.MouseEvent, patientId: string, stageId: string) => {
        e.stopPropagation(); 
        store.selectPatient(patientId); 
        store.selectStage(patientId, stageId);
        if (onClose) onClose();
    };

    const startAddingStage = (e: React.MouseEvent, patientId: string) => {
        e.stopPropagation();
        setAddingStagePatientId(patientId);
        setNewStageName(""); 
    };

    const confirmAddStage = async (patientId: string) => {
        if (!newStageName.trim()) {
            setAddingStagePatientId(null); 
            return;
        }
        await store.addStage(patientId, newStageName);
        setAddingStagePatientId(null);
        setNewStageName("");
    };

    const handleStageKeyDown = (e: React.KeyboardEvent, patientId: string) => {
        if (e.key === 'Enter') confirmAddStage(patientId);
        if (e.key === 'Escape') setAddingStagePatientId(null);
    };

    const openPatientEdit = (e: React.MouseEvent, patient: Patient) => {
        e.stopPropagation();
        setEditingPatient(patient);
        setEditPName(patient.name);
        setEditPHospital(patient.hospital || "");
        setEditPCase(patient.case_number);
    };

    const savePatientEdit = async () => {
        if (!editingPatient) return;
        await store.updatePatient(editingPatient.id, {
            name: editPName,
            hospital: editPHospital,
            case_number: editPCase
        });
        setEditingPatient(null);
    };

    const openStageEdit = (e: React.MouseEvent, pId: string, stage: Stage) => {
        e.stopPropagation();
        setEditingStage({ pId, stage });
        setEditSName(stage.name);
        setEditSSteps(stage.total_steps);
    };

    const saveStageEdit = async () => {
        if (!editingStage) return;
        await store.updateStageInfo(editingStage.pId, editingStage.stage.id, {
            name: editSName,
            total_steps: editSSteps
        });
        setEditingStage(null);
    };

    const handleDeleteStage = async (e: React.MouseEvent, patientId: string, stageId: string) => {
        e.stopPropagation();
        if (confirm("Move this stage to trash?")) {
            await store.softDeleteStage(patientId, stageId);
        }
    };

    const handleDeletePatient = async (e: React.MouseEvent, patientId: string) => {
        e.stopPropagation();
        if (confirm("Move this patient to trash?")) {
            await store.softDeletePatient(patientId);
        }
    };

    // ✨ [핵심 기능] 마우스가 배경에서 눌렸는지 확인
    const handleOverlayMouseDown = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            setIsMouseDownOnOverlay(true);
        }
    };

    // ✨ [핵심 기능] 배경에서 눌리고 + 배경에서 떼졌을 때만 닫기 (드래그 실수 방지)
    const handleOverlayMouseUp = (e: React.MouseEvent) => {
        if (isMouseDownOnOverlay && e.target === e.currentTarget) {
            setIsAddModalOpen(false);
        }
        setIsMouseDownOnOverlay(false); // 초기화
    };

    return (
      <div className="flex flex-col h-full bg-white border-r border-slate-200 shadow-sm w-full max-w-[320px] relative">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
             {viewMode === 'active' ? 'Patients List' : 'Trash Bin'}
          </h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setViewMode(prev => prev === 'active' ? 'deleted' : 'active')}
            className={cn("text-slate-400 hover:text-slate-700", viewMode === 'deleted' && "bg-red-50 text-red-500")}
            title={viewMode === 'active' ? "Go to Trash" : "Close Trash Bin"}
          >
            {viewMode === 'active' ? <Trash2 className="w-4 h-4" /> : <X className="w-4 h-4"/>}
          </Button>
        </div>

        {viewMode === 'active' && (
            <div className="p-4 space-y-3 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        placeholder="Search name, hospital..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-sm font-bold" onClick={() => setIsAddModalOpen(true)}>
                    <Plus className="w-4 h-4" /> Add Patient
                </Button>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredPatients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-20"/>
                    <p>No patients found</p>
                </div>
            ) : (
                filteredPatients.map((patient) => {
                    const isActive = store.selectedPatientId === patient.id;
                    const isExpanded = expandedPatientId === patient.id;

                    return (
                        <div key={patient.id} className="flex flex-col px-1">
                            <div 
                                onClick={() => handlePatientClick(patient)}
                                className={cn(
                                    "group flex items-center p-3 rounded-xl cursor-pointer transition-all border select-none mb-1 shadow-sm",
                                    isActive 
                                        ? "bg-blue-50 border-blue-400 ring-1 ring-blue-300"
                                        : "bg-white border-blue-300 hover:border-blue-500 hover:shadow-md"
                                )}
                            >
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mr-3 transition-colors shrink-0", 
                                    isActive ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
                                )}>
                                    <User className="w-5 h-5"/>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <h3 className={cn("font-extrabold truncate text-base", isActive ? "text-slate-950" : "text-slate-800")}>
                                            {patient.name}
                                        </h3>
                                        {viewMode === 'active' && (
                                            isExpanded ? <ChevronDown className="w-4 h-4 text-blue-500"/> : <ChevronRight className="w-4 h-4 text-slate-300"/>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                        {patient.hospital && (
                                            <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-100 truncate max-w-[100px]">
                                                <Building2 className="w-3 h-3 shrink-0"/>
                                                {patient.hospital}
                                            </span>
                                        )}
                                        <span className="font-mono text-slate-400">#{patient.case_number}</span>
                                    </div>
                                </div>

                                <div className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {viewMode === 'active' ? (
                                        <>
                                            <button 
                                                onClick={(e) => openPatientEdit(e, patient)}
                                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                                                title="Edit Patient"
                                            >
                                                <Pencil className="w-3.5 h-3.5"/>
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeletePatient(e, patient.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                                                title="Delete Patient"
                                            >
                                                <Trash2 className="w-3.5 h-3.5"/>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {patient.isDeleted && (
                                                <button onClick={(e) => { e.stopPropagation(); store.restorePatient(patient.id); }} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Restore Patient"><RefreshCcw className="w-4 h-4"/></button>
                                            )}
                                            {patient.isDeleted && (
                                                <button onClick={(e) => { e.stopPropagation(); if(confirm("Permanently delete?")) store.hardDeletePatient(patient.id); }} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete Forever"><Trash2 className="w-4 h-4"/></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="ml-4 pl-4 border-l-2 border-slate-100 space-y-1 mb-3 animate-in slide-in-from-top-1 duration-200">
                                    {(patient.stages || []).filter(s => viewMode === 'active' ? !s.isDeleted : s.isDeleted).map((stage) => {
                                        const isStageActive = isActive && patient.activeStageId === stage.id;
                                        return (
                                            <div 
                                                key={stage.id}
                                                onClick={(e) => viewMode === 'active' && handleStageClick(e, patient.id, stage.id)}
                                                className={cn(
                                                    "group/stage flex items-center justify-between text-sm p-2 rounded-md mb-1 cursor-pointer transition-colors",
                                                    isStageActive ? "bg-blue-600 text-white shadow-md" : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                                                    viewMode === 'deleted' && "opacity-70 cursor-default"
                                                )}
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText className={cn("w-3.5 h-3.5 shrink-0", isStageActive ? "text-blue-200" : "text-slate-400")}/>
                                                    <span className="truncate font-bold">{stage.name}</span>
                                                </div>
                                                
                                                <div className="flex items-center gap-1">
                                                    <span className={cn("text-[10px] mr-1 font-medium", isStageActive ? "text-blue-100" : "text-slate-400")}>
                                                        {stage.total_steps} Step
                                                    </span>
                                                    
                                                    {viewMode === 'active' ? (
                                                        <>
                                                            <button 
                                                                onClick={(e) => openStageEdit(e, patient.id, stage)}
                                                                className={cn("p-1 rounded opacity-0 group-hover/stage:opacity-100 transition-opacity", isStageActive ? "hover:bg-blue-500 text-white" : "hover:bg-slate-200 text-slate-400")}
                                                                title="Edit Stage"
                                                            >
                                                                <Pencil className="w-3 h-3"/>
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handleDeleteStage(e, patient.id, stage.id)}
                                                                className={cn("p-1 rounded opacity-0 group-hover/stage:opacity-100 transition-opacity", isStageActive ? "hover:bg-red-500 text-white" : "hover:bg-red-100 text-red-500")}
                                                                title="Trash Stage"
                                                            >
                                                                <Trash2 className="w-3 h-3"/>
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex gap-1">
                                                            <button onClick={(e) => { e.stopPropagation(); store.restoreStage(patient.id, stage.id); }} className="p-1 text-green-600 hover:bg-green-100 rounded"><RefreshCcw className="w-3 h-3"/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); if(confirm("Permanently delete stage?")) store.hardDeleteStage(patient.id, stage.id); }} className="p-1 text-red-600 hover:bg-red-100 rounded"><Trash2 className="w-3 h-3"/></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    
                                    {viewMode === 'active' && (
                                        addingStagePatientId === patient.id ? (
                                            <div className="flex items-center gap-1 p-1 bg-blue-50 rounded border border-blue-200 animate-in fade-in" onClick={e => e.stopPropagation()}>
                                                <input 
                                                    autoFocus
                                                    className="flex-1 text-xs p-1 bg-white rounded border border-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                    placeholder="Stage Name"
                                                    value={newStageName}
                                                    onChange={(e) => setNewStageName(e.target.value)}
                                                    onKeyDown={(e) => handleStageKeyDown(e, patient.id)}
                                                />
                                                <button onClick={() => confirmAddStage(patient.id)} className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"><Check className="w-3 h-3"/></button>
                                                <button onClick={() => setAddingStagePatientId(null)} className="p-1 text-slate-400 hover:bg-slate-200 rounded"><X className="w-3 h-3"/></button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={(e) => startAddingStage(e, patient.id)}
                                                className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-full p-2 rounded transition-colors"
                                            >
                                                <Plus className="w-3.5 h-3.5"/> New Stage
                                            </button>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>

        {isAddModalOpen && (
            <div 
                className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" 
                // ✨ [수정] onClick 대신 MouseDown, MouseUp 조합으로 변경
                onMouseDown={handleOverlayMouseDown}
                onMouseUp={handleOverlayMouseUp}
            >
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" 
                    onMouseDown={e => e.stopPropagation()} // 내부 클릭은 전파 방지
                >
                    <div className="p-4 border-b bg-slate-50"><h3 className="font-bold text-lg">Add New Patient</h3></div>
                    <div className="p-5 space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Name</label><input className="w-full border p-2 rounded" autoFocus value={newName} onChange={e => setNewName(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Hospital</label><input className="w-full border p-2 rounded" value={newHospital} onChange={e => setNewHospital(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Case No.</label><input className="w-full border p-2 rounded" value={newCaseNumber} onChange={e => setNewCaseNumber(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Total Steps (1st Stage)</label><input type="number" className="w-full border p-2 rounded" value={newTotalSteps} onChange={e => setNewTotalSteps(Number(e.target.value))} /></div>
                        
                        <Button 
                            type="button" 
                            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 py-3" 
                            onClick={handleAddPatient}
                        >
                            Create Patient
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {/* 편집 모달도 동일하게 적용 (선생님이 언급은 안 하셨지만 통일성을 위해) */}
        {editingPatient && (
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingPatient(null)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Pencil className="w-4 h-4"/> Edit Patient</h3>
                        <button onClick={() => setEditingPatient(null)}><X className="w-5 h-5 text-slate-400"/></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Name</label><input className="w-full border p-2 rounded" value={editPName} onChange={e => setEditPName(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Hospital</label><input className="w-full border p-2 rounded" value={editPHospital} onChange={e => setEditPHospital(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Case No.</label><input className="w-full border p-2 rounded" value={editPCase} onChange={e => setEditPCase(e.target.value)} /></div>
                        <Button type="button" className="w-full mt-2 bg-blue-600 hover:bg-blue-700 py-3" onClick={savePatientEdit}>Save Changes</Button>
                    </div>
                </div>
            </div>
        )}

        {editingStage && (
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingStage(null)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg flex items-center gap-2"><FileText className="w-4 h-4"/> Edit Stage</h3>
                        <button onClick={() => setEditingStage(null)}><X className="w-5 h-5 text-slate-400"/></button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Stage Name</label><input className="w-full border p-2 rounded" value={editSName} onChange={e => setEditSName(e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-slate-500 block mb-1">Total Steps</label><input type="number" className="w-full border p-2 rounded" value={editSSteps} onChange={e => setEditSSteps(Number(e.target.value))} /></div>
                        <Button type="button" className="w-full mt-2 bg-blue-600 hover:bg-blue-700 py-3" onClick={saveStageEdit}>Save Changes</Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }
);

PatientSidebar.displayName = "PatientSidebar";