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
  case_number: string; 
  total_steps: number;
  clinic_name?: string; // 👈 [이 줄을 꼭 추가해주세요!]
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

  // Actions
  fetchPatients: () => Promise<void>;
  addPatient: (name: string, caseNumber: string, totalSteps: number, clinicName?: string) => Promise<void>;
  
  updatePatient?: (id: string, name: string, caseNumber: string, totalSteps: number, clinicName?: string) => Promise<void>; // 수정 기능도 추가
  selectPatient: (id: string | null) => void;
  deletePatient: (id: string) => Promise<void>;
  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  updateRule: (patientId: string, rule: Rule) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
 // 👇 [수정됨] 물음표(?)를 넣어서 에러를 방지했습니다!
 saveSummary: (patientId: string, data: { image?: string, memo?: string }) => Promise<void>;
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
 addPatient: async (name, caseNumber, totalSteps, clinicName) => {
  const { data, error } = await supabase
    .from('patients')
    .insert([{
      name,
      case_number: caseNumber,   // ✅ (수정) DB이름: 내변수
        total_steps: totalSteps,   // ✅ (수정) DB이름: 내변수
        clinic_name: clinicName,   // (이건 맞음)
        rules: [],
        checklist_status: []       // ✅ (수정) checkedItems: {} 가 아니라 checklist_status: [] 입니다!
      }])
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

// 3. 환자 정보 수정 (제자리에 쏙!)
updatePatient: async (id, name, caseNumber, totalSteps, clinicName) => {
  const { data, error } = await supabase
    .from('patients')
    .update({
      name,
      case_number: caseNumber,   // ✅ (수정)
      total_steps: totalSteps,   // ✅ (수정)
      clinic_name: clinicName
    })
    .eq('id', id)
    .select();

  if (data) {
    set((state) => ({
      patients: state.patients.map((p) => (p.id === id ? (data[0] as Patient) : p)),
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

// 4.5 규칙 수정 (addRule 바로 밑에 붙여넣기)
updateRule: async (patientId, updatedRule) => {
  const state = get();
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return;

  // 로컬 목록 업데이트
  const updatedRules = patient.rules.map((r) => 
    r.id === updatedRule.id ? updatedRule : r
  );

  // Supabase 업데이트
  const { error } = await supabase
    .from('patients')
    .update({ rules: updatedRules }) // JSON 전체 업데이트
    .eq('id', patientId);

  if (!error) {
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
  }, // 👈 deleteRule 여기서 끝남 (콤마 필수!)

  // 👇 3. 요약 저장 기능 (에러 완벽 수정판)
  saveSummary: async (patientId: string, data: { image?: string; memo?: string }) => {
    // 1. Supabase (DB)에 저장
    const { error } = await supabase
      .from('patients')
      .update({ summary: data } as any) // 👈 'as any'를 넣어서 강제로 저장시킴 (타입 에러 무시)
      .eq('id', patientId);

    // 2. 내 화면(로컬)에도 바로 반영
    if (!error) {
      set((state) => ({
        patients: state.patients.map((p) =>
          p.id === patientId ? { ...p, summary: data } : p
        ),
      }));
    } else {
      console.error("Error saving summary:", error);
      alert("저장 중 오류가 발생했습니다.");
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

// 👇 [교체] 전체 체크/해제 기능 (중복 제거 및 괄호 정리 완료)
checkAllInStep: async (patientId, step) => {
  const state = get();
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return;

  // 1. 현재 스텝에 해당하는 룰 찾기
  const rulesInStep = patient.rules.filter((r) => step >= r.startStep && step <= r.endStep);
  if (rulesInStep.length === 0) return;

  // 2. 현재 상태 확인 (전부 체크되어 있는지?)
  const currentStepStatus = patient.checklist_status.filter((s) => s.step === step);
  const allChecked = rulesInStep.every((r) => 
    currentStepStatus.some((s) => s.ruleId === r.id && s.checked)
  );

  let newStatus;
  if (allChecked) {
     // [해제 모드] 이미 다 체크됨 -> 싹 지우기 (Uncheck All)
     newStatus = patient.checklist_status.filter((s) => s.step !== step);
  } else {
     // [선택 모드] 하나라도 빈 게 있음 -> 싹 채우기 (Check All)
     const otherSteps = patient.checklist_status.filter((s) => s.step !== step);
     const newStepStatus = rulesInStep.map((r) => ({
        step,
        ruleId: r.id,
        checked: true
     }));
     newStatus = [...otherSteps, ...newStepStatus];
  }

  // 3. DB 및 로컬 업데이트
  await supabase.from("patients").update({ checklist_status: newStatus }).eq("id", patientId);

  set((state) => ({
    patients: state.patients.map((p) =>
      p.id === patientId ? { ...p, checklist_status: newStatus } : p
    ),
  }));
},
})); // 👈 여기가 중요합니다! (Store 닫기 괄호)

// Hydration 헬퍼 (이제 단순한 wrapper)
export const usePatientStoreHydrated = () => {
return usePatientStore();
};