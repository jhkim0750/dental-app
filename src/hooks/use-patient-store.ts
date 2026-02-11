import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, 
  query, orderBy, Timestamp, getDoc 
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// --- 타입 정의 ---
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
  case_number: string;
  total_steps: number;
  created_at: any;
  checklist_status: ChecklistStatus[];
  rules: Rule[];
  summary?: { image: string; memo: string };
  isDeleted?: boolean; 
  deletedAt?: any;
}

interface PatientStore {
  patients: Patient[];
  selectedPatientId: string | null;
  isLoading: boolean;

  fetchPatients: () => Promise<void>;
  selectPatient: (id: string | null) => void;
  addPatient: (name: string, case_number: string, total_steps: number) => Promise<void>;
  
  // ✨ [추가] 환자 정보 수정 (총 스텝 등)
  updatePatient: (id: string, data: Partial<Patient>) => Promise<void>;

  softDeletePatient: (id: string) => Promise<void>;
  restorePatient: (id: string) => Promise<void>;
  hardDeletePatient: (id: string) => Promise<void>;

  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  updateRule: (patientId: string, rule: Rule) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
  toggleChecklistItem: (patientId: string, step: number, ruleId: string) => Promise<void>;
  checkAllInStep: (patientId: string, step: number) => Promise<void>;
  saveSummary: (patientId: string, summary: { image: string, memo: string }) => Promise<void>;
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
          const q = query(collection(db, "patients"), orderBy("created_at", "desc"));
          const snapshot = await getDocs(q);
          const loadedPatients = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Patient[];
          set({ patients: loadedPatients });
        } catch (error) {
          console.error("Failed to fetch patients:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      selectPatient: (id) => set({ selectedPatientId: id }),

      addPatient: async (name, case_number, total_steps) => {
        try {
          const newPatient = {
            name,
            case_number,
            total_steps,
            created_at: Timestamp.now(),
            checklist_status: [],
            rules: [],
            isDeleted: false
          };
          const docRef = await addDoc(collection(db, "patients"), newPatient);
          const patientWithId = { id: docRef.id, ...newPatient } as Patient;
          
          set((state) => ({ 
            patients: [patientWithId, ...state.patients],
            selectedPatientId: docRef.id 
          }));
        } catch (error) {
          console.error("Error adding patient:", error);
        }
      },

      // ✨ [구현] 환자 정보 수정 기능
      updatePatient: async (id, data) => {
        try {
            const patientRef = doc(db, "patients", id);
            await updateDoc(patientRef, data);
            set((state) => ({
                patients: state.patients.map(p => p.id === id ? { ...p, ...data } : p)
            }));
        } catch (error) {
            console.error("Error updating patient:", error);
        }
      },

      softDeletePatient: async (id) => {
        try {
          const patientRef = doc(db, "patients", id);
          await updateDoc(patientRef, { isDeleted: true, deletedAt: Timestamp.now() });
          set((state) => ({
            patients: state.patients.map(p => p.id === id ? { ...p, isDeleted: true, deletedAt: new Date() } : p),
            selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId
          }));
        } catch (error) { console.error("Error moving to trash:", error); }
      },

      restorePatient: async (id) => {
        try {
          const patientRef = doc(db, "patients", id);
          await updateDoc(patientRef, { isDeleted: false, deletedAt: null });
          set((state) => ({
            patients: state.patients.map(p => p.id === id ? { ...p, isDeleted: false, deletedAt: null } : p)
          }));
        } catch (error) { console.error("Error restoring patient:", error); }
      },

      hardDeletePatient: async (id) => {
        try {
          await deleteDoc(doc(db, "patients", id));
          set((state) => ({
            patients: state.patients.filter((p) => p.id !== id),
            selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
          }));
        } catch (error) { console.error("Error deleting patient permanently:", error); }
      },

      addRule: async (patientId, ruleData) => {
        const newRule = { ...ruleData, id: Date.now().toString() };
        const state = get();
        const target = state.patients.find(p => p.id === patientId);
        if (!target) return;
        const updatedRules = [...(target.rules || []), newRule];
        await updateDoc(doc(db, "patients", patientId), { rules: updatedRules });
        set({ patients: state.patients.map(p => p.id === patientId ? { ...p, rules: updatedRules } : p) });
      },

      updateRule: async (patientId, updatedRule) => {
        const state = get();
        const target = state.patients.find(p => p.id === patientId);
        if (!target) return;
        const updatedRules = target.rules.map(r => r.id === updatedRule.id ? updatedRule : r);
        await updateDoc(doc(db, "patients", patientId), { rules: updatedRules });
        set({ patients: state.patients.map(p => p.id === patientId ? { ...p, rules: updatedRules } : p) });
      },

      deleteRule: async (patientId, ruleId) => {
        const state = get();
        const target = state.patients.find(p => p.id === patientId);
        if (!target) return;
        const updatedRules = target.rules.filter(r => r.id !== ruleId);
        await updateDoc(doc(db, "patients", patientId), { rules: updatedRules });
        set({ patients: state.patients.map(p => p.id === patientId ? { ...p, rules: updatedRules } : p) });
      },

      toggleChecklistItem: async (patientId, step, ruleId) => {
        const state = get();
        const target = state.patients.find(p => p.id === patientId);
        if (!target) return;
        
        const existingIndex = target.checklist_status.findIndex(s => s.step === step && s.ruleId === ruleId);
        let newStatus = [...target.checklist_status];
        
        if (existingIndex >= 0) {
          newStatus[existingIndex] = { ...newStatus[existingIndex], checked: !newStatus[existingIndex].checked };
        } else {
          newStatus.push({ step, ruleId, checked: true });
        }
        
        await updateDoc(doc(db, "patients", patientId), { checklist_status: newStatus });
        set({ patients: state.patients.map(p => p.id === patientId ? { ...p, checklist_status: newStatus } : p) });
      },

      checkAllInStep: async (patientId, step) => {
        const state = get();
        const target = state.patients.find(p => p.id === patientId);
        if (!target) return;

        const rulesInStep = target.rules.filter(r => step >= r.startStep && step <= r.endStep);
        let newStatus = [...target.checklist_status];

        const allChecked = rulesInStep.every(r => 
          newStatus.some(s => s.step === step && s.ruleId === r.id && s.checked)
        );

        if (allChecked) {
          newStatus = newStatus.map(s => (s.step === step ? { ...s, checked: false } : s));
        } else {
          rulesInStep.forEach(r => {
             const idx = newStatus.findIndex(s => s.step === step && s.ruleId === r.id);
             if (idx >= 0) newStatus[idx].checked = true;
             else newStatus.push({ step, ruleId: r.id, checked: true });
          });
        }
        
        await updateDoc(doc(db, "patients", patientId), { checklist_status: newStatus });
        set({ patients: state.patients.map(p => p.id === patientId ? { ...p, checklist_status: newStatus } : p) });
      },

      saveSummary: async (patientId, summary) => {
        await updateDoc(doc(db, "patients", patientId), { summary });
        set((state) => ({
          patients: state.patients.map((p) => p.id === patientId ? { ...p, summary } : p)
        }));
      }
    }),
    {
      name: "patient-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

import { useState, useEffect } from "react";
export function usePatientStoreHydrated() {
  const [hydrated, setHydrated] = useState(false);
  const store = usePatientStore();
  useEffect(() => { setHydrated(true); }, []);
  return hydrated ? store : null;
}