"use client";

import { create } from "zustand";
import { db } from "@/lib/firebase"; // ✨ Supabase 대신 Firebase DB 가져오기
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp 
} from "firebase/firestore";

// --- 타입 정의 (기존과 동일) ---
export type ToothNumber = number;

export interface Rule {
  id: string;
  type: string;
  tooth: ToothNumber;
  startStep: number;
  endStep: number;
  note?: string;
}

export interface ChecklistItemStatus {
  step: number;
  ruleId: string;
  checked: boolean;
}

export interface Patient {
  id: string;
  created_at: any; // Firebase Timestamp 대응
  name: string;
  case_number: string; 
  total_steps: number;
  clinic_name?: string;
  rules: Rule[];
  checklist_status: ChecklistItemStatus[];
  summary?: {
    image?: string;
    memo?: string;
  };
}

interface PatientState {
  patients: Patient[];
  selectedPatientId: string | null;
  isLoading: boolean;

  fetchPatients: () => Promise<void>;
  addPatient: (name: string, caseNumber: string, totalSteps: number, clinicName?: string) => Promise<void>;
  updatePatient: (id: string, name: string, caseNumber: string, totalSteps: number, clinicName?: string) => Promise<void>;
  selectPatient: (id: string | null) => void;
  deletePatient: (id: string) => Promise<void>;
  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  updateRule: (patientId: string, rule: Rule) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
  saveSummary: (patientId: string, data: { image?: string, memo?: string }) => Promise<void>;
  toggleChecklistItem: (patientId: string, step: number, ruleId: string) => Promise<void>;
  checkAllInStep: (patientId: string, step: number) => Promise<void>;
}

export const usePatientStore = create<PatientState>((set, get) => ({
  patients: [],
  selectedPatientId: null,
  isLoading: false,

  // 1. 데이터 불러오기 (Firebase Firestore)
  fetchPatients: async () => {
    set({ isLoading: true });
    try {
      const q = query(collection(db, "patients"), orderBy("created_at", "desc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Patient[];
      
      set({ patients: data });
    } catch (error) {
      console.error("Error fetching patients:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  // 2. 환자 추가 (Firebase)
  addPatient: async (name, caseNumber, totalSteps, clinicName) => {
    try {
      const docRef = await addDoc(collection(db, "patients"), {
        name,
        case_number: caseNumber,
        total_steps: totalSteps,
        clinic_name: clinicName || "",
        rules: [],
        checklist_status: [],
        created_at: serverTimestamp(), // 서버 시간 저장
      });

      const newPatient: Patient = {
        id: docRef.id,
        name,
        case_number: caseNumber,
        total_steps: totalSteps,
        clinic_name: clinicName,
        rules: [],
        checklist_status: [],
        created_at: new Date().toISOString(),
      };

      set((state) => ({
        patients: [newPatient, ...state.patients],
        selectedPatientId: docRef.id,
      }));
    } catch (error) {
      console.error("Error adding patient:", error);
      alert("환자 추가 중 오류가 발생했습니다.");
    }
  },

  // 3. 환자 정보 수정
  updatePatient: async (id, name, caseNumber, totalSteps, clinicName) => {
    try {
      const patientRef = doc(db, "patients", id);
      await updateDoc(patientRef, {
        name,
        case_number: caseNumber,
        total_steps: totalSteps,
        clinic_name: clinicName
      });

      set((state) => ({
        patients: state.patients.map((p) => 
          p.id === id ? { ...p, name, case_number: caseNumber, total_steps: totalSteps, clinic_name: clinicName } : p
        ),
      }));
    } catch (error) {
      console.error("Error updating patient:", error);
    }
  },

  selectPatient: (id) => set({ selectedPatientId: id }),

  // 4. 환자 삭제
  deletePatient: async (id) => {
    try {
      await deleteDoc(doc(db, "patients", id));
      set((state) => ({
        patients: state.patients.filter((p) => p.id !== id),
        selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
      }));
    } catch (error) {
      console.error("Error deleting patient:", error);
    }
  },

  // 5. 규칙 추가
  addRule: async (patientId, ruleData) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const newRule = { ...ruleData, id: crypto.randomUUID() };
    const updatedRules = [...patient.rules, newRule];

    try {
      await updateDoc(doc(db, "patients", patientId), { rules: updatedRules });
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, rules: updatedRules } : p
        ),
      }));
    } catch (error) {
      console.error("Error adding rule:", error);
    }
  },

  // 6. 규칙 수정
  updateRule: async (patientId, updatedRule) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const updatedRules = patient.rules.map((r) => 
      r.id === updatedRule.id ? updatedRule : r
    );

    try {
      await updateDoc(doc(db, "patients", patientId), { rules: updatedRules });
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, rules: updatedRules } : p
        ),
      }));
    } catch (error) {
      console.error("Error updating rule:", error);
    }
  },

  // 7. 규칙 삭제
  deleteRule: async (patientId, ruleId) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const updatedRules = patient.rules.filter((r) => r.id !== ruleId);
    const updatedStatus = patient.checklist_status.filter((s) => s.ruleId !== ruleId);

    try {
      await updateDoc(doc(db, "patients", patientId), { 
        rules: updatedRules, 
        checklist_status: updatedStatus 
      });
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, rules: updatedRules, checklist_status: updatedStatus } : p
        ),
      }));
    } catch (error) {
      console.error("Error deleting rule:", error);
    }
  },

  // 8. 요약 저장 (Work Summary)
  saveSummary: async (patientId, data) => {
    try {
      await updateDoc(doc(db, "patients", patientId), { summary: data });
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, summary: data } : p
        ),
      }));
    } catch (error) {
      console.error("Error saving summary:", error);
      alert("저장 중 오류가 발생했습니다.");
    }
  },

  // 9. 체크박스 토글
  toggleChecklistItem: async (patientId, step, ruleId) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const existingIndex = patient.checklist_status.findIndex(
      (s) => s.step === step && s.ruleId === ruleId
    );
    let newStatus = [...patient.checklist_status];

    if (existingIndex >= 0) {
      newStatus[existingIndex] = {
        ...newStatus[existingIndex],
        checked: !newStatus[existingIndex].checked,
      };
    } else {
      newStatus.push({ step, ruleId, checked: true });
    }

    set((state) => ({
      patients: state.patients.map((p) =>
        p.id === patientId ? { ...p, checklist_status: newStatus } : p
      ),
    }));

    try {
      await updateDoc(doc(db, "patients", patientId), { checklist_status: newStatus });
    } catch (error) {
      console.error("Error toggling item:", error);
    }
  },

  // 10. 전체 체크/해제 기능
  checkAllInStep: async (patientId, step) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const rulesInStep = patient.rules.filter((r) => step >= r.startStep && step <= r.endStep);
    if (rulesInStep.length === 0) return;

    const currentStepStatus = patient.checklist_status.filter((s) => s.step === step);
    const allChecked = rulesInStep.every((r) => 
      currentStepStatus.some((s) => s.ruleId === r.id && s.checked)
    );

    let newStatus;
    if (allChecked) {
      newStatus = patient.checklist_status.filter((s) => s.step !== step);
    } else {
      const otherSteps = patient.checklist_status.filter((s) => s.step !== step);
      const newStepStatus = rulesInStep.map((r) => ({
        step,
        ruleId: r.id,
        checked: true
      }));
      newStatus = [...otherSteps, ...newStepStatus];
    }

    try {
      await updateDoc(doc(db, "patients", patientId), { checklist_status: newStatus });
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, checklist_status: newStatus } : p
        ),
      }));
    } catch (error) {
      console.error("Error check all:", error);
    }
  },
}));

export const usePatientStoreHydrated = () => {
  return usePatientStore();
};