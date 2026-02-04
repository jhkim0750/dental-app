"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";

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
  created_at: string;
  name: string;
  case_number: string; // Supabase 컬럼명(snake_case)에 맞춤
  total_steps: number;
  rules: Rule[]; // JSONB로 저장됨
  checklist_status: ChecklistItemStatus[]; // JSONB로 저장됨
}

interface PatientState {
  patients: Patient[];
  selectedPatientId: string | null;
  isLoading: boolean;

  // Actions
  fetchPatients: () => Promise<void>;
  addPatient: (name: string, caseNumber: string, totalSteps: number) => Promise<void>;
  selectPatient: (id: string | null) => void;
  deletePatient: (id: string) => Promise<void>;
  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
  toggleChecklistItem: (patientId: string, step: number, ruleId: string) => Promise<void>;
  checkAllInStep: (patientId: string, step: number) => Promise<void>;
}

export const usePatientStore = create<PatientState>((set, get) => ({
  patients: [],
  selectedPatientId: null,
  isLoading: false,

  // 1. 데이터 불러오기 (새로고침 시 실행)
  fetchPatients: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching patients:", error);
    } else {
      set({ patients: data as Patient[] });
    }
    set({ isLoading: false });
  },

  // 2. 환자 추가
  addPatient: async (name, caseNumber, totalSteps) => {
    const { data, error } = await supabase
      .from("patients")
      .insert([
        {
          name,
          case_number: caseNumber,
          total_steps: totalSteps,
          rules: [],
          checklist_status: [],
        },
      ])
      .select();

    if (error) {
      console.error("Error adding patient:", error);
      alert("Error adding patient");
    } else if (data) {
      set((state) => ({
        patients: [data[0] as Patient, ...state.patients],
        selectedPatientId: data[0].id,
      }));
    }
  },

  selectPatient: (id) => set({ selectedPatientId: id }),

  // 3. 환자 삭제
  deletePatient: async (id) => {
    const { error } = await supabase.from("patients").delete().eq("id", id);
    if (error) {
      console.error("Error deleting:", error);
      return;
    }
    set((state) => ({
      patients: state.patients.filter((p) => p.id !== id),
      selectedPatientId: state.selectedPatientId === id ? null : state.selectedPatientId,
    }));
  },

  // 4. 규칙 추가 (JSON 업데이트)
  addRule: async (patientId, ruleData) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const newRule = { ...ruleData, id: crypto.randomUUID() };
    const updatedRules = [...patient.rules, newRule];

    // Supabase 업데이트
    const { error } = await supabase
      .from("patients")
      .update({ rules: updatedRules })
      .eq("id", patientId);

    if (!error) {
      // 로컬 상태 즉시 반영 (화면 갱신)
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, rules: updatedRules } : p
        ),
      }));
    }
  },

  // 5. 규칙 삭제
  deleteRule: async (patientId, ruleId) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const updatedRules = patient.rules.filter((r) => r.id !== ruleId);
    const updatedStatus = patient.checklist_status.filter((s) => s.ruleId !== ruleId);

    const { error } = await supabase
      .from("patients")
      .update({ rules: updatedRules, checklist_status: updatedStatus })
      .eq("id", patientId);

    if (!error) {
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, rules: updatedRules, checklist_status: updatedStatus } : p
        ),
      }));
    }
  },

  // 6. 체크박스 토글
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

    // Optimistic Update (화면 먼저 바꿈 - 반응속도 UP)
    set((state) => ({
      patients: state.patients.map((p) =>
        p.id === patientId ? { ...p, checklist_status: newStatus } : p
      ),
    }));

    // DB 저장
    await supabase.from("patients").update({ checklist_status: newStatus }).eq("id", patientId);
  },

  // 7. 전체 체크
  checkAllInStep: async (patientId, step) => {
    const state = get();
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) return;

    const activeRules = patient.rules.filter(r => step >= r.startStep && step <= r.endStep);
    if (activeRules.length === 0) return;

    const checkedItemsInStep = patient.checklist_status.filter(
      s => s.step === step && s.checked && activeRules.some(r => r.id === s.ruleId)
    );

    const isAllChecked = checkedItemsInStep.length === activeRules.length;
    let newStatus = [...patient.checklist_status];

    activeRules.forEach(rule => {
      const idx = newStatus.findIndex(s => s.step === step && s.ruleId === rule.id);
      if (idx >= 0) {
        newStatus[idx] = { ...newStatus[idx], checked: !isAllChecked };
      } else {
        newStatus.push({ step, ruleId: rule.id, checked: !isAllChecked });
      }
    });

    set((state) => ({
      patients: state.patients.map((p) =>
        p.id === patientId ? { ...p, checklist_status: newStatus } : p
      ),
    }));

    await supabase.from("patients").update({ checklist_status: newStatus }).eq("id", patientId);
  },
}));

// Hydration 헬퍼 (이제 단순한 wrapper)
export const usePatientStoreHydrated = () => {
  return usePatientStore();
};