import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useState, useEffect } from "react"; 
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc,
  query, limit, startAfter, orderBy, where // ✨ NEW: 검색과 더보기를 위한 기능 추가
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
  imageUrl?: string;
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
  hasMore: boolean; // ✨ NEW: 다음 페이지가 있는지 확인
  lastDoc: any;     // ✨ NEW: 마지막으로 불러온 환자 기억

  // ✨ CHANGED: 검색어와 불러오기 옵션 추가
  fetchPatients: (searchTerm?: string, loadMore?: boolean) => Promise<void>;  
  fetchPatientById: (id: string) => Promise<void>; // ✨ NEW: VIP 단독 픽업 기능 추가
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

const saveTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

const debouncedFirebaseSave = (patientId: string, getStore: () => PatientStore) => {
  if (saveTimeouts[patientId]) {
    clearTimeout(saveTimeouts[patientId]);
  }
  saveTimeouts[patientId] = setTimeout(async () => {
    try {
      const { patients } = getStore();
      const patient = patients.find((p: Patient) => p.id === patientId);
      if (patient) {
        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: patient.stages });
      }
      delete saveTimeouts[patientId];
    } catch (error) {
      console.error("체크리스트 서버 동기화 실패:", error);
    }
  }, 800); 
};

export const usePatientStore = create<PatientStore>()(
  persist(
    (set, get) => ({
      patients: [],
      selectedPatientId: null,
      isLoading: false,
      hasMore: true,
      lastDoc: null,

      fetchPatients: async (searchTerm = "", loadMore = false) => {
        const { lastDoc, patients } = get();
        if (!loadMore) {
            set({ isLoading: true, lastDoc: null, hasMore: true });
        } else {
            set({ isLoading: true });
        }

        try {
            let q;
            const patientsRef = collection(db, "patients");
            const term = searchTerm.trim();

            if (term !== "") {
                const isNumeric = /^\d+$/.test(term);
                const searchField = isNumeric ? "case_number" : "name";

                if (loadMore && lastDoc) {
                    q = query(patientsRef, where(searchField, ">=", term), where(searchField, "<=", term + "\uf8ff"), startAfter(lastDoc), limit(20));
                } else {
                    q = query(patientsRef, where(searchField, ">=", term), where(searchField, "<=", term + "\uf8ff"), limit(20));
                }
            } else {
                if (loadMore && lastDoc) {
                    q = query(patientsRef, orderBy("createdAt", "desc"), startAfter(lastDoc), limit(20));
                } else {
                    q = query(patientsRef, orderBy("createdAt", "desc"), limit(20));
                }
            }

            // ✨ FIX 2: 파이어베이스 정렬 에러 시 뻗지 않고 비상 호출하도록 대비!
            let snapshot;
            try {
                snapshot = await getDocs(q);
            } catch (fallbackErr) {
                console.warn("Firebase query error, using fallback...", fallbackErr);
                const fallbackQ = query(patientsRef, limit(30));
                snapshot = await getDocs(fallbackQ);
            }

            const lastVisible = snapshot.docs[snapshot.docs.length - 1];

            const processedPatients = snapshot.docs.map((docSnap) => {
                const data = docSnap.data(); 
                try {
                    if (!data.name || typeof data.name !== 'string' || data.name.trim() === "") return null; 
                    const hospitalName = data.hospital || data.clinic_name || "";
                    
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

                    let stages = Array.isArray(data.stages) ? data.stages : [];
                    let rules = Array.isArray(data.rules) ? data.rules : [];
                    let checklist_status = Array.isArray(data.checklist_status) ? data.checklist_status : [];
                    let activeStageId = data.activeStageId;

                    if (stages.length === 0) {
                        const initialStage: Stage = {
                            id: `stage-${Date.now()}`, name: "1st Setup", total_steps: Number(data.total_steps) || 20,
                            rules: rules, checklist_status: checklist_status,
                            summary: data.summary || {}, createdAt: parsedCreatedAt || Date.now()
                        };
                        stages = [initialStage];
                        activeStageId = initialStage.id;
                    }

                    const currentStage = stages.find((s: Stage) => s.id === activeStageId) || stages.find((s: Stage) => !s.isDeleted) || stages[0];
                    
                    return {
                      id: docSnap.id, name: data.name, hospital: hospitalName, case_number: data.case_number,
                      stages: stages, activeStageId: currentStage?.id || activeStageId, 
                      total_steps: currentStage.total_steps, rules: currentStage.rules,
                      checklist_status: currentStage.checklist_status, summary: currentStage.summary,
                      createdAt: parsedCreatedAt, isDeleted: !!data.isDeleted
                    } as Patient;
                } catch (err) { return null; }
            });

            const validPatients = processedPatients.filter((p): p is Patient => p !== null);
            validPatients.sort((a: Patient, b: Patient) => (b.createdAt || 0) - (a.createdAt || 0));

            set((state: PatientStore) => {
                const newPatients = loadMore ? [...state.patients, ...validPatients] : validPatients;
                
                // ✨ FIX 1: 화면 튕김(Kick-out) 완벽 방지!
                // 새로운 검색 결과에 현재 환자가 없더라도, 억지로 목록에 끼워 넣어서 화면 유지를 보장합니다.
                let finalPatients = newPatients;
                if (state.selectedPatientId) {
                    const activePatient = state.patients.find(p => p.id === state.selectedPatientId);
                    if (activePatient && !finalPatients.some(p => p.id === activePatient.id)) {
                        finalPatients = [activePatient, ...finalPatients];
                    }
                }

                const uniquePatients = Array.from(new Map(finalPatients.map(p => [p.id, p])).values());
                return {
                    patients: uniquePatients,
                    isLoading: false,
                    lastDoc: lastVisible,
                    hasMore: snapshot.docs.length === 20
                };
            });
        } catch (error) {
            console.error("Error fetching patients:", error);
            set({ isLoading: false });
        }
      },
      
// ✨ NEW: 노션 URL 링크를 타고 들어왔을 때, 해당 환자만 파이어베이스에서 단독으로 불러오는 기능
fetchPatientById: async (id: string) => {
  try {
      const { patients } = get();
      // 1. 만약 이미 불러온 20명 안에 있는 환자라면 바로 선택만 하고 끝냅니다.
      if (patients.some((p: Patient) => p.id === id)) {
          set({ selectedPatientId: id });
          return;
      }

      // 2. 20명 안에 없다면 파이어베이스에 그 1명만 딱 집어서 가져오라고 명령합니다.
      const docRef = doc(db, "patients", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
          const data = docSnap.data();
          
          let parsedCreatedAt = 0;
          try {
              if (typeof data.createdAt === 'number') parsedCreatedAt = data.createdAt;
              else if (data.createdAt?.toMillis) parsedCreatedAt = data.createdAt.toMillis();
              else if (data.createdAt?.seconds) parsedCreatedAt = data.createdAt.seconds * 1000;
              else if (typeof data.createdAt === 'string') parsedCreatedAt = new Date(data.createdAt).getTime();
          } catch (e) {}

          let stages = Array.isArray(data.stages) ? data.stages : [];
          let activeStageId = data.activeStageId;

          if (stages.length === 0) {
              const initialStage: Stage = {
                  id: `stage-${Date.now()}`, name: "1st Setup", total_steps: Number(data.total_steps) || 20,
                  rules: Array.isArray(data.rules) ? data.rules : [], 
                  checklist_status: Array.isArray(data.checklist_status) ? data.checklist_status : [], 
                  summary: data.summary || {}, createdAt: parsedCreatedAt || Date.now()
              };
              stages = [initialStage];
              activeStageId = initialStage.id;
          }

          const currentStage = stages.find((s: Stage) => s.id === activeStageId) || stages.find((s: Stage) => !s.isDeleted) || stages[0];
          
          const loadedPatient = {
              id: docSnap.id, name: data.name, hospital: data.hospital || data.clinic_name || "", case_number: data.case_number,
              stages: stages, activeStageId: currentStage?.id || activeStageId, 
              total_steps: currentStage.total_steps, rules: currentStage.rules,
              checklist_status: currentStage.checklist_status, summary: currentStage.summary,
              createdAt: parsedCreatedAt, isDeleted: !!data.isDeleted
          } as Patient;

          // 3. 데려온 환자를 현재 목록 맨 앞에 끼워 넣고, 선택된 상태로 만듭니다.
          set((state: PatientStore) => {
              const newPatients = [loadedPatient, ...state.patients];
              const uniquePatients = Array.from(new Map(newPatients.map(p => [p.id, p])).values());

              // 🚨 [치명적 버그 방어] 서버에서 데이터를 가져오는 0.5초 사이에 유저가 홈 버튼을 눌렀다면,
              // 가져온 환자를 목록에 추가는 해주되, 현재 화면(selectedPatientId)을 홈(null) 상태로 안전하게 유지합니다!
              const finalSelectedId = state.selectedPatientId === id ? id : state.selectedPatientId;

              return { patients: uniquePatients, selectedPatientId: finalSelectedId };
          });
      }
  } catch (error) {
      console.error("Error fetching patient by ID:", error);
  }
},

      addPatient: async (name: string, hospital: string, case_number: string, total_steps: number) => {
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

        set((state: PatientStore) => ({ patients: [createdPatient, ...state.patients] }));
      },

      updatePatient: async (id: string, updates: Partial<Patient>) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, updates);
        set((state: PatientStore) => ({
          patients: state.patients.map((p: Patient) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      softDeletePatient: async (id: string) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, { isDeleted: true, deletedAt: Date.now() });
        set((state: PatientStore) => ({
          patients: state.patients.map((p: Patient) => (p.id === id ? { ...p, isDeleted: true } : p)),
          selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
        }));
      },

      restorePatient: async (id: string) => {
        const patientRef = doc(db, "patients", id);
        await updateDoc(patientRef, { isDeleted: false, deletedAt: null });
        set((state: PatientStore) => ({
          patients: state.patients.map((p: Patient) => (p.id === id ? { ...p, isDeleted: false } : p)),
        }));
      },

      hardDeletePatient: async (id: string) => {
        await deleteDoc(doc(db, "patients", id));
        set((state: PatientStore) => ({
          patients: state.patients.filter((p: Patient) => p.id !== id),
          selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
        }));
      },

      deletePatient: async (id: string) => {
         await deleteDoc(doc(db, "patients", id));
         set((state: PatientStore) => ({
           patients: state.patients.filter((p: Patient) => p.id !== id),
           selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
         }));
      },

      selectPatient: (id: string | null) => set({ selectedPatientId: id }),

      addStage: async (patientId: string, stageName: string) => {
          const { patients } = get();
          const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
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

      selectStage: async (patientId: string, stageId: string) => {
          const { patients } = get();
          const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
          if (patientIndex === -1) return;

          const patient = patients[patientIndex];
          const targetStage = patient.stages.find((s: Stage) => s.id === stageId);
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

      updateStageInfo: async (patientId: string, stageId: string, updates: { name?: string, total_steps?: number }) => {
          const { patients } = get();
          const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
          if (patientIndex === -1) return;

          const patient = patients[patientIndex];
          const updatedStages = patient.stages.map((s: Stage) => s.id === stageId ? { ...s, ...updates } : s);
          
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

      softDeleteStage: async (patientId: string, stageId: string) => {
          const { patients } = get();
          const pIdx = patients.findIndex((p: Patient) => p.id === patientId);
          if (pIdx === -1) return;
          const patient = patients[pIdx];

          const updatedStages = patient.stages.map((s: Stage) => s.id === stageId ? { ...s, isDeleted: true } : s);
          
          let newActiveId = patient.activeStageId;
          if (patient.activeStageId === stageId) {
              const availableStage = updatedStages.find((s: Stage) => !s.isDeleted && s.id !== stageId);
              if (availableStage) newActiveId = availableStage.id;
          }

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages, activeStageId: newActiveId });

          const updatedPatient = { ...patient, stages: updatedStages, activeStageId: newActiveId };
          const targetStage = updatedStages.find((s: Stage) => s.id === newActiveId);
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

      restoreStage: async (patientId: string, stageId: string) => {
          const { patients } = get();
          const pIdx = patients.findIndex((p: Patient) => p.id === patientId);
          if (pIdx === -1) return;
          
          const patient = patients[pIdx];
          const updatedStages = patient.stages.map((s: Stage) => s.id === stageId ? { ...s, isDeleted: false } : s);

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages });

          const newPatients = [...patients];
          newPatients[pIdx] = { ...patient, stages: updatedStages };
          set({ patients: newPatients });
      },

      hardDeleteStage: async (patientId: string, stageId: string) => {
          const { patients } = get();
          const pIdx = patients.findIndex((p: Patient) => p.id === patientId);
          if (pIdx === -1) return;

          const patient = patients[pIdx];
          const updatedStages = patient.stages.filter((s: Stage) => s.id !== stageId);

          const patientRef = doc(db, "patients", patientId);
          await updateDoc(patientRef, { stages: updatedStages });

          const newPatients = [...patients];
          newPatients[pIdx] = { ...patient, stages: updatedStages };
          set({ patients: newPatients });
      },

      addRule: async (patientId: string, ruleData: Omit<Rule, "id">) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;
        
        const newRule = { ...ruleData, id: Date.now().toString() };

        const updatedStages = patient.stages.map((stage: Stage) => {
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
            rules: updatedStages.find((s: Stage) => s.id === activeStageId)?.rules 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      updateRule: async (patientId: string, updatedRule: Rule) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map((stage: Stage) => {
            if (stage.id === activeStageId) {
                return { 
                    ...stage, 
                    rules: stage.rules.map((r: Rule) => r.id === updatedRule.id ? updatedRule : r) 
                };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            rules: updatedStages.find((s: Stage) => s.id === activeStageId)?.rules 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });
      },

      deleteRule: async (patientId: string, ruleId: string) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map((stage: Stage) => {
            if (stage.id === activeStageId) {
                return { 
                    ...stage, 
                    rules: stage.rules.filter((r: Rule) => r.id !== ruleId),
                    checklist_status: stage.checklist_status.filter((c: ChecklistStatus) => c.ruleId !== ruleId)
                };
            }
            return stage;
        });

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const currentStage = updatedStages.find((s: Stage) => s.id === activeStageId)!;
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

      toggleChecklistItem: async (patientId: string, step: number, ruleId: string) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map((stage: Stage) => {
            if (stage.id === activeStageId) {
                const existingIndex = stage.checklist_status.findIndex(
                    (s: ChecklistStatus) => s.step === step && s.ruleId === ruleId
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

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            checklist_status: updatedStages.find((s: Stage) => s.id === activeStageId)?.checklist_status 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });

        debouncedFirebaseSave(patientId, get);
      },

      checkAllInStep: async (patientId: string, step: number) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map((stage: Stage) => {
            if (stage.id === activeStageId) {
                const rulesInStep = stage.rules.filter((r: Rule) => step >= r.startStep && step <= r.endStep);
                const allChecked = rulesInStep.every((r: Rule) => 
                    stage.checklist_status.some((s: ChecklistStatus) => s.step === step && s.ruleId === r.id && s.checked)
                );

                let newStatus = [...stage.checklist_status];
                if (allChecked) {
                    newStatus = newStatus.filter((s: ChecklistStatus) => !(s.step === step && rulesInStep.some((r: Rule) => r.id === s.ruleId)));
                } else {
                    rulesInStep.forEach((r: Rule) => {
                        if (!newStatus.some((s: ChecklistStatus) => s.step === step && s.ruleId === r.id && s.checked)) {
                            newStatus.push({ step, ruleId: r.id, checked: true });
                        }
                    });
                }
                return { ...stage, checklist_status: newStatus };
            }
            return stage;
        });

        const updatedPatient = { 
            ...patient, 
            stages: updatedStages,
            checklist_status: updatedStages.find((s: Stage) => s.id === activeStageId)?.checklist_status 
        };
        const newPatients = [...patients];
        newPatients[patientIndex] = updatedPatient;
        set({ patients: newPatients });

        debouncedFirebaseSave(patientId, get);
      },

      saveSummary: async (patientId: string, summary: { image: string; memo: string }) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const activeStageId = patient.activeStageId || patient.stages[0].id;

        const updatedStages = patient.stages.map((stage: Stage) => {
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
      partialize: (state: any) => ({}), 
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