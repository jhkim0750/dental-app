import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useState, useEffect } from "react"; 
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc,
  query, limit, startAfter, orderBy, where 
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
  externalLink?: string; // ✨ NEW: 셋업 작업 노트 (스테이지별 독립 링크)
  shellLogs?: { id: string; name: string; createdAt: number; driveFolderId?: string; files: string[] }[]; // ✨ NEW: 셋업별 독립적인 쉘 업로드 기록
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
  globalMemo?: string; // ✨ NEW: 환자별 통합 메모장 (HTML 텍스트 저장용)
  memoCards?: { id: string; title: string; content: string }[]; // ✨ NEW: 카드형 메모장 데이터
}

interface PatientStore {  
  patients: Patient[];
  selectedPatientId: string | null;
  isLoading: boolean;
  hasMore: boolean; 
  lastDoc: any;     

  fetchPatients: (searchTerm?: string, loadMore?: boolean) => Promise<void>;  
  fetchPatientById: (id: string) => Promise<void>; 
  addPatient: (name: string, hospital: string, case_number: string, total_steps: number) => Promise<void>;
  updatePatient: (id: string, updates: Partial<Patient>) => Promise<void>;
  
  softDeletePatient: (id: string) => Promise<void>;
  restorePatient: (id: string) => Promise<void>;
  hardDeletePatient: (id: string) => Promise<void>;
  deletePatient: (id: string) => Promise<void>; 

  selectPatient: (id: string | null) => void;

  addStage: (patientId: string, stageName: string) => Promise<void>;
  selectStage: (patientId: string, stageId: string) => void;
  updateStageInfo: (patientId: string, stageId: string, updates: Partial<Stage>) => Promise<void>;  
  
  
  softDeleteStage: (patientId: string, stageId: string) => Promise<void>;
  restoreStage: (patientId: string, stageId: string) => Promise<void>;
  hardDeleteStage: (patientId: string, stageId: string) => Promise<void>;

  addRule: (patientId: string, rule: Omit<Rule, "id">) => Promise<void>;
  updateRule: (patientId: string, rule: Rule) => Promise<void>;
  deleteRule: (patientId: string, ruleId: string) => Promise<void>;
  
  toggleChecklistItem: (patientId: string, step: number, ruleId: string) => Promise<void>;
  checkAllInStep: (patientId: string, step: number) => Promise<void>;
  saveSummary: (patientId: string, summary: { image: string; memo: string }) => Promise<void>;
  
  updateStageExternalLink: (patientId: string, stageId: string, link: string) => Promise<void>; // ✨ NEW: 링크 저장 함수
  updatePatientGlobalMemo: (patientId: string, htmlContent: string) => Promise<void>; // ✨ NEW: 글로벌 메모 저장 함수
  updatePatientMemoCards: (patientId: string, cards: any[]) => Promise<void>; // ✨ NEW: 다중 카드 배열 저장 함수
  // ✨ NEW: 쉘 업로더가 쏜 데이터를 받아 시트에 안전하게 기입하는 지능형 엔진 (타입 등록)  
  insertOrUpdateRecord: (patientId: string, sheetName: string, uploadData: any) => Promise<void>;
  // ✨ NEW: 병렬 쉘 업로드 덮어쓰기를 원천 차단하는 원자적 누적 엔진
  appendShellLogFiles: (patientId: string, stageId: string, folderId: string, driveFolderId: string, newFiles: any[]) => Promise<void>;
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
                      createdAt: parsedCreatedAt, isDeleted: !!data.isDeleted,
                      globalMemo: data.globalMemo || "", // ✨ NEW: 새로고침 시 메모 데이터 끌고 오기
                      memoCards: Array.isArray(data.memoCards) ? data.memoCards : [] // ✨ FIX: 다중 카드 데이터 불러오기 복구 (데이터 증발 방지!)
                    } as Patient;                    
                } catch (err) { return null; }
            });

            const validPatients = processedPatients.filter((p): p is Patient => p !== null);
            validPatients.sort((a: Patient, b: Patient) => (b.createdAt || 0) - (a.createdAt || 0));

            set((state: PatientStore) => {
                const newPatients = loadMore ? [...state.patients, ...validPatients] : validPatients;
                
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
      
      fetchPatientById: async (id: string) => {
        try {
            const { patients } = get();
            if (patients.some((p: Patient) => p.id === id)) {
                set({ selectedPatientId: id });
                return;
            }

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
                  createdAt: parsedCreatedAt, isDeleted: !!data.isDeleted,
                  globalMemo: data.globalMemo || "", // ✨ NEW: 개별 환자 로드 시 메모 데이터 끌고 오기
                  memoCards: Array.isArray(data.memoCards) ? data.memoCards : [] // ✨ FIX: 다중 카드 데이터 불러오기 복구 (데이터 증발 방지!)
              } as Patient;
                            
                set((state: PatientStore) => {
                    const newPatients = [loadedPatient, ...state.patients];
                    const uniquePatients = Array.from(new Map(newPatients.map(p => [p.id, p])).values());
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

// ✨ NEW: 쉘 업로더가 쏜 데이터를 받아 시트에 안전하게 기입하는 지능형 엔진
insertOrUpdateRecord: async (patientId: string, sheetName: string, uploadData: any) => {
  try {
    const docRef = doc(db, "patients_records", patientId);
    const snap = await getDoc(docRef);
    let rows = snap.exists() && snap.data().rows ? snap.data().rows : [];
    let sheetNames = snap.exists() && snap.data().sheetNames ? snap.data().sheetNames : [];

    const today = new Date();
    const dateStr = `${today.getFullYear()}. ${String(today.getMonth() + 1).padStart(2, "0")}. ${String(today.getDate()).padStart(2, "0")}`;

    // 현재 타겟 시트(해당 스테이지)에 있는 줄들만 필터링
    const targetSheetRows = rows.filter((r: any) => (r["_SHEET_NAME_"] || "과거 기록") === sheetName);
    
    // 같은 STEP을 가진 줄이 있는지 맨 밑에서부터 거꾸로 찾음 (가장 최근 줄을 찾기 위함)
    let foundIndexInTarget = -1;
    for (let i = targetSheetRows.length - 1; i >= 0; i--) {
      if (targetSheetRows[i]["STEP"] === uploadData.step) {
        foundIndexInTarget = i;
        break;
      }
    }

// 1. "수정(Re)" 파일이거나, 아예 같은 스텝이 없는 경우 -> 맨 밑에 새 줄 추가(Append)
if (uploadData.isRevision || foundIndexInTarget === -1) {
  let newRow: any = {
    "_SHEET_NAME_": sheetName,
    "날짜": dateStr,
    "STAGE": sheetName,
    "STEP": uploadData.step,
    "작업자": uploadData.workerName,
    "비고": "",
    "Program": "Program" // ✨ NEW: 새 줄 생성 시 우측 끝 Program 열에 무조건 'Program' 기본값 장착!
  };

// ✨ NEW: 파일명 인식 불가 시 (안전망 가동!)
if (uploadData.fallbackMemo) {
  newRow["비고"] = uploadData.fallbackMemo;
  newRow["상악"] = "X";
  newRow["하악"] = "X";
}
else if (uploadData.isDPAT) {
  newRow["비고"] = `DPAT 업로드${uploadData.dpatTeeth ? ` (${uploadData.dpatTeeth})` : ''}`;
  newRow["상악"] = "X"; // ✨ 빈칸 방지: 처음 만들어질 때 무조건 X로 초기화
  newRow["하악"] = "X"; // ✨ 빈칸 방지: 처음 만들어질 때 무조건 X로 초기화
} else {
  newRow["상악"] = uploadData.isMax ? "O" : "X";
  newRow["하악"] = uploadData.isMan ? "O" : "X";
  if (uploadData.isRevision) newRow["비고"] = "(수정본 업로드)";
}
rows.push(newRow);  
} 
// 2. 이미 같은 스텝이 있는 경우 -> 안전하게 업데이트 (당일 무음 병합 및 DPAT 압축)
else {
  const originalRowIndex = rows.indexOf(targetSheetRows[foundIndexInTarget]);
  const targetRow = rows[originalRowIndex];

  if (uploadData.isDPAT) {
     const existingMemo = targetRow["비고"] || "";
     // ✨ NEW: 괄호 안에 괄호가 또 있는 형태(#33(Li))를 완벽하게 인식하도록 정규식 지능 업그레이드!
     const dpatRegex = /DPAT 업로드(?:\s*\(((?:[^)(]+|\([^)(]*\))*)\))?/;
     const match = existingMemo.match(dpatRegex);
          
     // ✨ NEW: 기존 DPAT 메모가 있다면 괄호 안으로 똑똑하게 압축 병합
     if (match) {
         let teethArr = match[1] ? match[1].split(",").map((s: string) => s.trim()) : [];
         let newTeeth = uploadData.dpatTeeth ? uploadData.dpatTeeth.split(",").map((s: string) => s.trim()) : [];
         newTeeth.forEach((t: string) => { if (t && !teethArr.includes(t)) teethArr.push(t); });
         
         const combinedTeeth = teethArr.length > 0 ? ` (${teethArr.join(", ")})` : "";
         const newDPATStr = `DPAT 업로드${combinedTeeth}`;
         targetRow["비고"] = existingMemo.replace(match[0], newDPATStr);
     } else {
         const newMemo = `DPAT 업로드${uploadData.dpatTeeth ? ` (${uploadData.dpatTeeth})` : ''}`;
         targetRow["비고"] = existingMemo ? `${existingMemo} / ${newMemo}` : newMemo;
     }
  } else {
     if (uploadData.isMax && targetRow["상악"] !== "O") {
         targetRow["상악"] = "O";
         if (!targetRow["하악"]) targetRow["하악"] = "X"; // 빈칸 발견 시 X로 방어
         // ✨ NEW: 당일 업로드가 아닐 때만 촌스러운 메모 남기기 (무음 병합)
         if (targetRow["날짜"] !== dateStr) {
             targetRow["비고"] = (targetRow["비고"] ? targetRow["비고"] + " / " : "") + `상악 추가 업로드: ${dateStr}`;
         }
     }
     if (uploadData.isMan && targetRow["하악"] !== "O") {
         targetRow["하악"] = "O";
         if (!targetRow["상악"]) targetRow["상악"] = "X"; // 빈칸 발견 시 X로 방어
// ✨ NEW: 당일 업로드가 아닐 때만 촌스러운 메모 남기기 (무음 병합)
         if (targetRow["날짜"] !== dateStr) {
          targetRow["비고"] = (targetRow["비고"] ? targetRow["비고"] + " / " : "") + `하악 추가 업로드: ${dateStr}`;
         }
     }
  }
}

// 시트 탭 목록 갱신 (✨ NEW: 기록이 추가된 최신 시트를 무조건 맨 앞으로 끌어올리기!)
    sheetNames = sheetNames.filter((name: string) => name !== sheetName);
    sheetNames.unshift(sheetName);

    // ✨ NEW: [스마트 정렬 엔진] - 방금 업로드된 타겟 시트만 스텝(STEP) 순서대로 예쁘게 정렬!
    const otherRows = rows.filter((r: any) => (r["_SHEET_NAME_"] || "과거 기록") !== sheetName);    
    const targetRows = rows.filter((r: any) => (r["_SHEET_NAME_"] || "과거 기록") === sheetName);

    targetRows.sort((a: any, b: any) => {
      const stepA = typeof a["STEP"] === 'number' ? a["STEP"] : parseInt(a["STEP"], 10);
      const stepB = typeof b["STEP"] === 'number' ? b["STEP"] : parseInt(b["STEP"], 10);
      const isAValid = !isNaN(stepA);
      const isBValid = !isNaN(stepB);

      if (isAValid && isBValid) return stepA - stepB; // 둘 다 숫자면 1, 2, 3... 오름차순
      if (isAValid && !isBValid) return -1; // 숫자가 있는 정상 스텝을 무조건 위로
      if (!isAValid && isBValid) return 1;  // 숫자가 없는 빈칸(수동 추가)은 무조건 아래로
      return 0;
    });

    // 다른 시트(과거 기록 등) 데이터와 정렬된 타겟 시트 데이터를 안전하게 하나로 합침
    const finalSortedRows = [...otherRows, ...targetRows];

    await setDoc(docRef, { rows: finalSortedRows, sheetNames, lastUpdated: new Date().toISOString() }, { merge: true });

  } catch (e) {
    console.error("Auto Record Insert Failed:", e);
  }
},

updateStageInfo: async (patientId: string, stageId: string, updates: Partial<Stage>) => {
  const { patients } = get();
  const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
  if (patientIndex === -1) return;

  const patient = patients[patientIndex];
  const updatedStages = patient.stages.map((s: Stage) => s.id === stageId ? { ...s, ...updates } : s);
  
  const updatedPatient = { ...patient, stages: updatedStages };
  if (patient.activeStageId === stageId) {
      if (updates.total_steps) updatedPatient.total_steps = updates.total_steps;
  }

  const newPatients = [...patients];
  newPatients[patientIndex] = updatedPatient;
  set({ patients: newPatients });

  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, { stages: updatedStages });
},

appendShellLogFiles: async (patientId: string, stageId: string, folderId: string, driveFolderId: string, newFiles: any[]) => {
  const { patients } = get();
  const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
  if (patientIndex === -1) return;

  const patient = patients[patientIndex];
  const updatedStages = patient.stages.map((s: Stage) => {
      if (s.id === stageId) {
          const currentLogs = s.shellLogs || [];
          const newLogs = currentLogs.map((log: any) => {
              if (log.id === folderId) {
                  return { ...log, driveFolderId, files: [...(log.files || []), ...newFiles] };
              }
              return log;
          });
          return { ...s, shellLogs: newLogs };
      }
      return s;
  });

  const appendPatientsList = [...patients];
  appendPatientsList[patientIndex] = { ...patient, stages: updatedStages };
  set({ patients: appendPatientsList });

  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, { stages: updatedStages });
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

      // ✨ NEW: 링크만 따로 파이어베이스 서버에 즉시 자동 저장하는 함수
      updateStageExternalLink: async (patientId: string, stageId: string, link: string) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patient = patients[patientIndex];
        const updatedStages = patient.stages.map((s: Stage) => s.id === stageId ? { ...s, externalLink: link } : s);

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { stages: updatedStages });

        const newPatients = [...patients];
        newPatients[patientIndex] = { ...patient, stages: updatedStages };
        set({ patients: newPatients });
      },

// ✨ NEW: 환자별 통합 메모장 저장 함수 (기존 데이터 손상 0%)
      updatePatientGlobalMemo: async (patientId: string, htmlContent: string) => {        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { globalMemo: htmlContent });

        const newPatients = [...patients];
        newPatients[patientIndex] = { ...newPatients[patientIndex], globalMemo: htmlContent } as Patient;
        set({ patients: newPatients });
      },
// ✨ NEW: 카드형 메모장 저장 함수 (순서 변경 등 배열 데이터 실시간 동기화)
      updatePatientMemoCards: async (patientId: string, cards: any[]) => {
        const { patients } = get();
        const patientIndex = patients.findIndex((p: Patient) => p.id === patientId);
        if (patientIndex === -1) return;

        const patientRef = doc(db, "patients", patientId);
        await updateDoc(patientRef, { memoCards: cards });

        const newPatients = [...patients];
        newPatients[patientIndex] = { ...newPatients[patientIndex], memoCards: cards } as Patient;
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