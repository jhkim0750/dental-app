import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useState, useEffect } from "react"; 
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, 
  query 
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Stage {
  id: string;
  name: string;
  total_steps: number;
  rules: Rule[];
  checklist_status: ChecklistStatus[];
  summary: {
    image?: string;
    memo?: string;
  };
  createdAt: number;
  isDeleted?: boolean;
}

export interface Rule {
  id: string;
  type: string;
  tooth: number;
  startStep: number;
  endStep: number;
  note?: string;
}

export interface ChecklistStatus {
  step: number;
  ruleId: string;
  checked: boolean;
}

export interface Patient {
  id: string;
  name: string;
  hospital?: string;
  case_number: string;
  
  stages: Stage[]; 
  activeStageId?: string;

  isDeleted?: boolean;
  deletedAt?: any; 

  // 호환성 필드
  total_steps?: number; 
  rules?: Rule[];
  summary?: any;
  checklist_status?: ChecklistStatus[];
  
  createdAt: any; 
}

interface PatientStore {
  patients: Patient[];
  selectedPatientId: string | null;
  isLoading: boolean;

  fetchPatients: () => Promise<void>;
  addPatient: (name: string, hospital: string, case_number: string, total_steps: number) => Promise<void>;
  updatePatient: (id: string, updates: Partial<Patient>) => Promise<void>;
  
  softDeletePatient: (id: string) => Promise<void>;
  restorePatient: (id: string) => Promise<void>;
  hardDeletePatient: (id: string) => Promise<void>;
  deletePatient: (id: string) => Promise<void>; 

  selectPatient: (id: string | null) => void;

  addStage: (patientId: string, stageName: string) => Promise<void>;
  selectStage: (patientId: string, stageId: string) => void;
  updateStageInfo: (patientId: string, stageId: string, updates: { name?: string, total_steps?: number }) => Promise<void>;
  
  softDeleteStage: (patientId: string, stageId: string) => Promise<void>;
  restoreStage: (patientId: string, stageId: string) => Promise<void>;
  hardDeleteStage: (patientId: string, stageId: string) => Promise<void>;

  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  updateRule: (patientId: string, rule: Rule) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
  toggleChecklistItem: (patientId: string, step: number, ruleId: string) => Promise<void>;
  checkAllInStep: (patientId: string, step: number) => Promise<void>;
  saveSummary: (patientId: string, summary: { image: string; memo: string }) => Promise<void>;
}

export const usePatientStore = create<PatientStore>()(
  persist(
    (set, get) => ({
      patients: [],
      selectedPatientId: null,
      isLoading: false,

      fetchPatients: async () => {
        set({ isLoading: true });
        try {
          const q = query(collection(db, "patients")); 
          const snapshot = await getDocs(q);
          
          const processedPatients = snapshot.docs.map((doc) => {
            const data = doc.data(); 

            try {
                // 이름 유효성 검사 (데이터 보호막)
                if (!data.name || typeof data.name !== 'string' || data.name.trim() === "") {
                    return null; 
                }
                
                // 병원 이름 호환성
                const hospitalName = data.hospital || data.clinic_name || "";
                
                // 날짜 파싱 (안전 장치)
                let parsedCreatedAt = 0;
                try {
                    if (typeof data.createdAt === 'number') parsedCreatedAt = data.createdAt;
                    else if (data.createdAt?.toMillis) parsedCreatedAt = data.createdAt.toMillis();
                    else if (data.createdAt?.seconds) parsedCreatedAt = data.createdAt.seconds * 1000;
                    else if (typeof data.createdAt === 'string') {
                        const parsed = new Date(data.createdAt).getTime();
                        parsedCreatedAt = isNaN(parsed) ? 0 : parsed;
                    }
                } catch (e) { parsedCreatedAt = 0; }

                // 스테이지 및 배열 안전 처리
                let stages = Array.isArray(data.stages) ? data.stages : [];
                let rules = Array.isArray(data.rules) ? data.rules : [];
                let checklist_status = Array.isArray(data.checklist_status) ? data.checklist_status : [];
                let activeStageId = data.activeStageId;

                // 스테이지가 없으면 1st Setup 자동 생성
                if (stages.length === 0) {
                    const initialStage: Stage = {
                        id: `stage-${Date.now()}`,
                        name: "1st Setup",
                        total_steps: Number(data.total_steps) || 20,
                        rules: rules,
                        checklist_status: checklist_status,
                        summary: data.summary || {},
                        createdAt: parsedCreatedAt || Date.now()
                    };
                    stages = [initialStage];
                    activeStageId = initialStage.id;
                }

                const currentStage = stages.find((s: Stage) => s.id === activeStageId) || stages.find((s: Stage) => !s.isDeleted) || stages[0];
                
                return {
                  id: doc.id,
                  name: data.name, 
                  hospital: hospitalName,
                  case_number: data.case_number,
                  stages: stages,
                  activeStageId: currentStage?.id || activeStageId, 
                  total_steps: currentStage.total_steps,
                  rules: currentStage.rules,
                  checklist_status: currentStage.checklist_status,
                  summary: currentStage.summary,
                  createdAt: parsedCreatedAt,
                  isDeleted: !!data.isDeleted
                } as Patient;

            } catch (err) {
                return null;
            }
          });

          const validPatients = processedPatients.filter((p): p is Patient => p !== null);
          
          // 최신순 정렬
          validPatients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          set({ patients: validPatients, isLoading: false });
        } catch (error) {
          console.error("Error fetching patients:", error);
          set({ isLoading: false });
        }
      },

      addPatient: async (name, hospital, case_number, total_steps) => {
        const initialStage: Stage = {
            id: `stage-${Date.now()}`,
            name: "1st Setup",
            total_steps: total_steps || 20,
            rules: [],
            checklist_status: [],
            summary: {},
            createdAt: Date.now()
        };

        const patientData = {
          name,
          hospital,
          case_number,
          stages: [initialStage],
          activeStageId: initialStage.id,
          createdAt: Date.now(), 
          isDeleted: false,
        };

        const docRef = await addDoc(collection(db, "patients"), patientData);
        
        const createdPatient = { 
            ...patientData, 
            id: docRef.id,
            total_steps: initialStage.total_steps,
            rules: initialStage.rules,
            checklist_status: initialStage.checklist_status,
            summary: initialStage.summary
        } as Patient;

        set((state) => ({ patients: [createdPatient, ...state.patients] }));
      },

      updatePatient: async (id, updates) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, updates);
        set((state) => ({
          patients: state.patients.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      softDeletePatient: async (id) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, { isDeleted: true, deletedAt: Date.now() });
        set((state) => ({
          patients: state.patients.map((p) => (p.id === id ? { ...p, isDeleted: true } : p)),
          selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
        }));
      },

      restorePatient: async (id) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, { isDeleted: false, deletedAt: null });
        set((state) => ({
          patients: state.patients.map((p) => (p.id === id ? { ...p, isDeleted: false } : p)),
        }));
      },

      hardDeletePatient: async (id) => {
        await deleteDoc(doc(db, "patients", id));
        set((state) => ({
          patients: state.patients.filter((p) => p.id !== id),
          selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
        }));
      },

      deletePatient: async (id) => {
         await deleteDoc(doc(db, "patients", id));
         set((state) => ({
           patients: state.patients.filter((p) => p.id !== id),
           selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
         }));
      },

      selectPatient: (id) => set({ selectedPatientId: id }),

      addStage: async (patientId, stageName) => {
          const { patients } = get();
          const patientIndex = patients.findIndex(p => p.id === patientId);
          if (patientIndex === -1) return;

          const patient = patients[patientIndex];
          const newStage: Stage = {
              id: `stage-${Date.now()}`,
              name: stageName || "New Stage",
              total_steps: 20,
              rules: [],
              checklist_status: [],
              summary: {},
              createdAt: Date.now()
          };

          const updatedStages = [...patient.stages, newStage];
          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages, activeStageId: newStage.id });

          const updatedPatient = {
              ...patient,
              stages: updatedStages,
              activeStageId: newStage.id,
              total_steps: newStage.total_steps,
              rules: newStage.rules,
              checklist_status: newStage.checklist_status,
              summary: newStage.summary
          };

          const newPatients = [...patients];
          newPatients[patientIndex] = updatedPatient;
          set({ patients: newPatients });
      },

      selectStage: async (patientId, stageId) => {
          const { patients } = get();
          const patientIndex = patients.findIndex(p => p.id === patientId);
          if (patientIndex === -1) return;

          const patient = patients[patientIndex];
          const targetStage = patient.stages.find(s => s.id === stageId);
          if (!targetStage) return;

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { activeStageId: stageId });

          const updatedPatient = {
              ...patient,
              activeStageId: stageId,
              total_steps: targetStage.total_steps,
              rules: targetStage.rules,
              checklist_status: targetStage.checklist_status,
              summary: targetStage.summary
          };

          const newPatients = [...patients];
          newPatients[patientIndex] = updatedPatient;
          set({ patients: newPatients });
      },

      updateStageInfo: async (patientId, stageId, updates) => {
          const { patients } = get();
          const patientIndex = patients.findIndex(p => p.id === patientId);
          if (patientIndex === -1) return;

          const patient = patients[patientIndex];
          const updatedStages = patient.stages.map(s => s.id === stageId ? { ...s, ...updates } : s);
          
          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages });

          const updatedPatient = { ...patient, stages: updatedStages };
          if (patient.activeStageId === stageId) {
              if (updates.total_steps) updatedPatient.total_steps = updates.total_steps;
          }

          const newPatients = [...patients];
          newPatients[patientIndex] = updatedPatient;
          set({ patients: newPatients });
      },

      softDeleteStage: async (patientId, stageId) => {
          const { patients } = get();
          const pIdx = patients.findIndex(p => p.id === patientId);
          if (pIdx === -1) return;
          const patient = patients[pIdx];

          const updatedStages = patient.stages.map(s => s.id === stageId ? { ...s, isDeleted: true } : s);
          
          let newActiveId = patient.activeStageId;
          if (patient.activeStageId === stageId) {
              const availableStage = updatedStages.find(s => !s.isDeleted && s.id !== stageId);
              if (availableStage) newActiveId = availableStage.id;
          }

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages, activeStageId: newActiveId });

          const updatedPatient = { ...patient, stages: updatedStages, activeStageId: newActiveId };
          const targetStage = updatedStages.find(s => s.id === newActiveId);
          if (targetStage) {
              updatedPatient.total_steps = targetStage.total_steps;
              updatedPatient.rules = targetStage.rules;
              updatedPatient.checklist_status = targetStage.checklist_status;
              updatedPatient.summary = targetStage.summary;
          }

          const newPatients = [...patients];
          newPatients[pIdx] = updatedPatient;
          set({ patients: newPatients });
      },

      restoreStage: async (patientId, stageId) => {
          const { patients } = get();
          const pIdx = patients.findIndex(p => p.id === patientId);
          if (pIdx === -1) return;
          
          const patient = patients[pIdx];
          const updatedStages = patient.stages.map(s => s.id === stageId ? { ...s, isDeleted: false } : s);

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages });

          const newPatients = [...patients];
          newPatients[pIdx] = { ...patient, stages: updatedStages };
          set({ patients: newPatients });
      },

      hardDeleteStage: async (patientId, stageId) => {
          const { patients } = get();
          const pIdx = patients.findIndex(p => p.id === patientId);
          if (pIdx === -1) return;

          const patient = patients[pIdx];
          const updatedStages = patient.stages.filter(s => s.id !== stageId);

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages });

          const newPatients = [...patients];
          newPatients[pIdx] = { ...patient, stages: updatedStages };
          set({ patients: newPatients });
      },

      addRule: async (patientId, ruleData) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;
        
        const newRule = { ...ruleData, id: Date.now().toString() };

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                return { ...stage, rules: [...stage.rules, newRule] };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            rules: updatedStages.find(s => s.id === activeStageId)?.rules 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      updateRule: async (patientId, updatedRule) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                return { 
                    ...stage, 
                    rules: stage.rules.map(r => r.id === updatedRule.id ? updatedRule : r) 
                };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            rules: updatedStages.find(s => s.id === activeStageId)?.rules 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      deleteRule: async (patientId, ruleId) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                return { 
                    ...stage, 
                    rules: stage.rules.filter(r => r.id !== ruleId),
                    checklist_status: stage.checklist_status.filter(c => c.ruleId !== ruleId)
                };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const currentStage = updatedStages.find(s => s.id === activeStageId)!;
        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            rules: currentStage.rules,
            checklist_status: currentStage.checklist_status
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      toggleChecklistItem: async (patientId, step, ruleId) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                const existingIndex = stage.checklist_status.findIndex(
                    (s) => s.step === step && s.ruleId === ruleId
                );
                let newStatus = [...stage.checklist_status];
                if (existingIndex > -1) {
                    newStatus[existingIndex] = { ...newStatus[existingIndex], checked: !newStatus[existingIndex].checked };
                } else {
                    newStatus.push({ step, ruleId, checked: true });
                }
                return { ...stage, checklist_status: newStatus };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            checklist_status: updatedStages.find(s => s.id === activeStageId)?.checklist_status 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      checkAllInStep: async (patientId, step) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                const rulesInStep = stage.rules.filter(r => step >= r.startStep && step <= r.endStep);
                const allChecked = rulesInStep.every(r => 
                    stage.checklist_status.some(s => s.step === step && s.ruleId === r.id && s.checked)
                );

                let newStatus = [...stage.checklist_status];
                if (allChecked) {
                    newStatus = newStatus.filter(s => !(s.step === step && rulesInStep.some(r => r.id === s.ruleId)));
                } else {
                    rulesInStep.forEach(r => {
                        if (!newStatus.some(s => s.step === step && s.ruleId === r.id && s.checked)) {
                            newStatus.push({ step, ruleId: r.id, checked: true });
                        }
                    });
                }
                return { ...stage, checklist_status: newStatus };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            checklist_status: updatedStages.find(s => s.id === activeStageId)?.checklist_status 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      saveSummary: async (patientId, summary) => {
        const { patients } = get();
        const patientIndex = patients.findIndex(p => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map(stage => {
            if (stage.id === activeStageId) {
                return { ...stage, summary }; 
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            summary 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },
    }),
    {
      name: "dental-patient-storage-v2", 
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
          selectedPatientId: state.selectedPatientId 
      }),
    }
  )
);

export const usePatientStoreHydrated = () => {
  const [hydrated, setHydrated] = useState(false);
  const store = usePatientStore();

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? store : null;
};