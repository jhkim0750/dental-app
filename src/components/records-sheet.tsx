"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { HotTable } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy } from "firebase/firestore";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store";
import { Save, Info, Settings, X, Plus, Undo2, Redo2, Loader2, DatabaseBackup } from "lucide-react";

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

registerAllModules();

const MASTER_EMAIL = "jhkim@odsresin.com";

let dynamicColorMap: Record<string, { bg: string; text: string }> = {};
let formattingKeywords: string[] = [];
let triggerViewportAdjust: (() => void) | null = null;

type RowObject = Record<string, any>;

const customBadgeRenderer = function (instance: any, td: HTMLTableCellElement, row: number, col: number, prop: string | number, value: any, cellProperties: any) {
  td.innerHTML = "";
  if (value) {
    let bgColor = "#e5e7eb"; let textColor = "#374151"; let fontWeight = "bold";
    if (value === "Program") { bgColor = "#dc2626"; textColor = "white"; fontWeight = "500"; } 
    else if (value === "3Shape") { bgColor = "#2563eb"; textColor = "white"; fontWeight = "500"; } 
    else if (dynamicColorMap[value]) { bgColor = dynamicColorMap[value].bg; textColor = dynamicColorMap[value].text; } 
    else if (value === "O" || value === "X") { bgColor = "transparent"; textColor = "#000"; }

    const span = document.createElement("span");
    span.style.cssText = `background-color: ${bgColor}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: ${fontWeight}; display: inline-block; line-height: 1.2;`;
    span.textContent = String(value);
    td.appendChild(span);
  }
  if (cellProperties.type === "dropdown" || cellProperties.type === "autocomplete") {
    const arrow = document.createElement("div"); arrow.className = "htAutocompleteArrow"; arrow.innerHTML = "&#x25BC;"; td.appendChild(arrow);
  }
  td.style.verticalAlign = "middle"; td.style.textAlign = "center";
  return td;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const customTextRenderer = function (instance: any, td: HTMLTableCellElement, row: number, col: number, prop: string | number, value: any) {
  td.innerHTML = "";
  // 💡 중요: 스크롤 시 셀이 재사용될 때 빨간색이 다른 셀로 번지는 것을 막는 방어막(초기화)입니다.
  td.style.color = "";
  td.style.fontWeight = "";
  td.style.verticalAlign = "middle"; td.style.textAlign = "left";
  td.style.whiteSpace = "pre-wrap"; td.style.wordBreak = "break-word";

  const rawText = value == null ? "" : String(value);
  if (!rawText) { td.textContent = ""; return td; }
  if (!formattingKeywords.length) { td.textContent = rawText; return td; }

  // 💡 수정: 복잡한 HTML 치환을 버리고, 단어가 하나라도 포함되어 있는지 아주 가볍게 스캔만 합니다.
  const hasKeyword = formattingKeywords.some(keyword => 
    keyword && keyword.trim() !== "" && rawText.includes(keyword.trim())
  );

  if (hasKeyword) {
    td.style.color = "#dc2626"; // 텍스트 전체 빨간색
    td.style.fontWeight = "700"; // 텍스트 전체 굵게
  }

  td.textContent = rawText; // 💡 HTML 찌꺼기 없이 순수 100% 무결점 텍스트로 렌더링합니다.
  return td;
};

export default function RecordsSheet() {
  const hotRef = useRef<any>(null);
  const store = usePatientStoreHydrated();
  const activePatient = store?.patients.find((p: any) => p.id === store.selectedPatientId);

  const [isMaster, setIsMaster] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // ✨ NEW: 저장 중복 방지 상태
  const [activeTab, setActiveTab] = useState<string>("");
  const [sheets, setSheets] = useState<string[]>([]);
  const [editingSheetIndex, setEditingSheetIndex] = useState<number | null>(null);
  const [editingSheetName, setEditingSheetName] = useState("");

  const handleAddSheet = () => {
    let newNum = sheets.length + 1;
    let newName = `Sheet${newNum}`;
    while (sheets.includes(newName)) { newNum++; newName = `Sheet${newNum}`; }
    syncCurrentTabToMaster(); 
    setSheets([...sheets, newName]);
    
    // 새 탭 기본 20행 생성
    const newTabRows = [];
    const hot = hotRef.current?.hotInstance;
    const headers = hot ? (hot.getColHeader() as string[]) : [];
    for (let i = 0; i < 20; i++) {
      const emptyRow: RowObject = {};
      headers.forEach(h => { emptyRow[h] = ""; });
      newTabRows.push(emptyRow);
    }
    masterDataRef.current[newName] = newTabRows;
    setActiveTab(newName);
    setTimeout(() => hotRef.current?.hotInstance?.loadData(masterDataRef.current[newName]), 50);
  };

  const handleDeleteSheet = (targetSheet: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sheets.length <= 1) { alert("최소 1개의 시트는 유지해야 합니다."); return; }
    if (confirm(`'${targetSheet}' 시트를 삭제하시겠습니까?\n(저장 전까지는 DB에서 지워지지 않습니다)`)) {
      const newSheets = sheets.filter(s => s !== targetSheet);
      delete masterDataRef.current[targetSheet];
      setSheets(newSheets);
      if (activeTab === targetSheet) handleTabChange(newSheets[0]);
    }
  };

  const handleRenameSheetComplete = (index: number) => {
    const newName = editingSheetName.trim();
    if (!newName || newName === sheets[index]) { setEditingSheetIndex(null); return; }
    if (sheets.includes(newName)) { alert("이미 존재하는 시트 이름입니다."); return; }
    
    const oldName = sheets[index];
    const newSheets = [...sheets];
    newSheets[index] = newName;

    syncCurrentTabToMaster(); 
    masterDataRef.current[newName] = masterDataRef.current[oldName];
    delete masterDataRef.current[oldName];

    setSheets(newSheets);
    if (activeTab === oldName) setActiveTab(newName);
    setEditingSheetIndex(null);
  };
    const masterDataRef = useRef<Record<string, RowObject[]>>({});

  const [tableHeight, setTableHeight] = useState<number>(700);
  const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);
  const [formattingInput, setFormattingInput] = useState("");
  const [savedKeywords, setSavedKeywords] = useState<string[]>([]);

  const isCtrlDownRef = useRef(false);

  const adjustTableToViewport = () => {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;

    const viewportHeight = window.innerHeight;
    const offsetHeight = 220; 
    const availableHeight = Math.max(viewportHeight - offsetHeight, 400); 
    
    setTableHeight(availableHeight);

    const rowHeight = 29; 
    const headerHeight = 42; 
    
    const visibleSlots = Math.ceil((availableHeight - headerHeight) / rowHeight);
    const actualRows = hot.countSourceRows();

    let requiredSpare = visibleSlots - actualRows;
    if (requiredSpare < 0) requiredSpare = 0; 

    if (hot.getSettings().minSpareRows !== requiredSpare) {
      hot.updateSettings({ minSpareRows: requiredSpare });
    }
  };

  useEffect(() => {
    triggerViewportAdjust = adjustTableToViewport;
  });

  useEffect(() => {
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        adjustTableToViewport();
      }, 100); 
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);


  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => { setIsMaster(u?.email === MASTER_EMAIL); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activePatient?.id) return;
    setIsLoading(true);

    const loadData = async () => {
      try {
        const stages = activePatient?.stages?.map((s: any) => s.name) || [];
        const firebaseStages = stages.length > 0 ? stages : ["STAGE 1", "STAGE 2"];

        const workerSnap = await getDocs(query(collection(db, "excel_workers"), orderBy("addedAt", "asc")));
        const fetchedWorkers: string[] = []; dynamicColorMap = {};
        workerSnap.forEach((workerDoc) => {
          const data = workerDoc.data(); fetchedWorkers.push(data.name);
          dynamicColorMap[data.name] = { bg: data.bgColor, text: data.textColor };
        });
        const finalWorkers = fetchedWorkers.length > 0 ? fetchedWorkers : ["작업자 없음"];
        const firebaseO_X = ["O", "X", ...finalWorkers];

        const formattingSnap = await getDoc(doc(db, "admin_settings", "conditional_formatting"));
        if (formattingSnap.exists() && Array.isArray(formattingSnap.data().redKeywords)) {
          formattingKeywords = formattingSnap.data().redKeywords; setSavedKeywords(formattingKeywords); setFormattingInput(formattingKeywords.join("\n"));
        } else {
          formattingKeywords = []; setSavedKeywords([]); setFormattingInput("");
        }

        const templateSnap = await getDoc(doc(db, "admin_settings", "excel_template"));
        let templateCols = [
          { title: "날짜", width: 90 }, { title: "STAGE", width: 110 }, { title: "STEP", width: 50 },
          { title: "상악", width: 60 }, { title: "하악", width: 60 }, { title: "작업자", width: 90 },
          { title: "비고", width: 300 }, { title: "Program", width: 100 },
        ];
        let templateRowCount = 20;

        if (templateSnap.exists()) {
          if (templateSnap.data().columns) templateCols = templateSnap.data().columns;
          if (templateSnap.data().rowCount) templateRowCount = templateSnap.data().rowCount;
        }

        const recordsSnap = await getDoc(doc(db, "patients_records", activePatient.id));
        let rawData: RowObject[] = [];
        let savedSheetNames: string[] = []; // ✨ NEW: 명시적으로 저장된 시트 목록 변수 추가
        if (recordsSnap.exists()) {
            if (recordsSnap.data().rows) rawData = recordsSnap.data().rows;
            if (recordsSnap.data().sheetNames) savedSheetNames = recordsSnap.data().sheetNames; // ✨ 시트 배열 획득
        }

        const newColHeaders = templateCols.map((c: any) => c.title);

        // ✨ [수정] 데이터를 투명 꼬리표(_SHEET_NAME_) 기준으로 쪼개서 캐싱
        masterDataRef.current = {};
        const parsedSheets = new Set<string>();

        rawData.forEach((row: any) => {
          // 기존 데이터(꼬리표 없음)는 무조건 Sheet1로 모음
          const sheetName = row["_SHEET_NAME_"] || "Sheet1";
          parsedSheets.add(sheetName);
          if (!masterDataRef.current[sheetName]) masterDataRef.current[sheetName] = [];
          masterDataRef.current[sheetName].push({ ...row });
        });

        // ✨ NEW: DB에 저장된 시트 목록(savedSheetNames)이 있으면 그것을 최우선으로 사용하여 빈 시트 증발을 막고, 과거 데이터인 경우에만 parsedSheets 사용
        const finalSheets = savedSheetNames.length > 0 ? savedSheetNames : (parsedSheets.size > 0 ? Array.from(parsedSheets) : ["Sheet1"]);

        finalSheets.forEach((sheet: string) => {
          if (!masterDataRef.current[sheet]) masterDataRef.current[sheet] = [];
          const sheetData = masterDataRef.current[sheet];
          if (sheetData.length < templateRowCount) {
            const rowsToAdd = templateRowCount - sheetData.length;
            for (let i = 0; i < rowsToAdd; i++) {
              const emptyRow: RowObject = {};
              newColHeaders.forEach((header: string) => { emptyRow[header] = ""; });
              sheetData.push(emptyRow);
            }
          }
        });

        setSheets(finalSheets);
        const initialTab = finalSheets[0];
        setActiveTab(initialTab);
        const clonedData = masterDataRef.current[initialTab]; // 초기 표출 데이터

        const newColumns = templateCols.map((c: any) => {
          const def: any = { data: c.title, type: "text", width: c.width, className: "htCenter htMiddle" };
          if (c.title === "STAGE") { def.type = "dropdown"; def.source = firebaseStages; def.className = "stage-column htCenter htMiddle"; }
          else if (c.title === "STEP") { def.type = "numeric"; } 
          else if (c.title === "상악" || c.title === "하악") { def.type = "dropdown"; def.source = firebaseO_X; def.renderer = customBadgeRenderer; }
          else if (c.title === "작업자") { def.type = "dropdown"; def.source = finalWorkers; def.renderer = customBadgeRenderer; }
          else if (c.title === "Program") { def.type = "dropdown"; def.source = ["Program", "3Shape"]; def.renderer = customBadgeRenderer; }
          else if (c.title === "비고") { def.type = "text"; def.wordWrap = true; def.className = "htMiddle htLeft"; def.renderer = customTextRenderer; }
          return def;
        });

        const hot = hotRef.current?.hotInstance;
        if (hot) {
          hot.updateSettings({
            colHeaders: newColHeaders,
            columns: newColumns,
            data: clonedData
          });
          setTimeout(() => adjustTableToViewport(), 50);
        }

      } catch (error) { console.error("데이터 로드 실패:", error); } finally { setIsLoading(false); }
    };
    loadData();
  }, [activePatient]);

  const hotSettings = useMemo(() => ({
    rowHeaders: true,
    autoRowSize: true,
    fillHandle: true,
    multiColumnSorting: true,
    manualColumnResize: true,
    preventOverflow: "horizontal" as "horizontal",
    undo: true,
    copyPaste: true,
    minSpareRows: 0, 

    afterCreateRow: function (this: any) {
      if (triggerViewportAdjust) setTimeout(triggerViewportAdjust, 50);
    },
    afterRemoveRow: function (this: any) {
      if (triggerViewportAdjust) setTimeout(triggerViewportAdjust, 50);
    },

    beforeKeyDown: function (this: any, e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const selected = this.getSelectedLast();
        if (selected) { this.getPlugin("CopyPaste").copy(); e.preventDefault(); e.stopImmediatePropagation(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        const selected = this.getSelectedLast();
        if (selected) { this.getPlugin("CopyPaste").cut(); e.preventDefault(); e.stopImmediatePropagation(); }
      }

      if (e.shiftKey && e.key.toLowerCase() === "d") {
        const selected = this.getSelectedLast();
        if (selected) {
          const [r1, c1, r2, c2] = selected;
          if (Math.abs(c2 - c1) > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const editor = this.getActiveEditor();
            if (editor && editor.isOpened()) {
              editor.close();
            }

            const startRow = Math.min(r1, r2);
            const amount = Math.abs(r1 - r2) + 1;
            this.alter("remove_row", startRow, amount);
            
            return false; 
          }
        }
      }
    },

    beforeAutofill: function (this: any, fillData: any[][], sourceRange: any, targetRange: any, direction: string) {
      if (isCtrlDownRef.current && direction === "down") {
        const startRow = sourceRange.from.row; const startCol = sourceRange.from.col;
        const startVal = Number(this.getDataAtCell(startRow, startCol));
        if (!isNaN(startVal)) {
          const numRows = targetRange.to.row - targetRange.from.row + 1;
          fillData.length = 0;
          for (let i = 0; i < numRows; i++) { fillData.push([startVal + i + 1]); }
        }
      }
    },

    contextMenu: {
      items: {
        copy: { name: "복사 (Ctrl+C)" }, cut: { name: "잘라내기 (Ctrl+X)" }, sp1: { name: "---------" },
        row_above: { name: "위에 행 삽입" }, row_below: { name: "아래에 행 삽입" },
        col_left: { name: "왼쪽에 열 삽입" }, col_right: { name: "오른쪽에 열 삽입" },
        remove_row: { name: "행 삭제" }, 
        remove_col: { 
          name: "열 삭제",
          callback: function (this: any, key: any, selection: any) {
            const col = selection[0].start.col;
            const headers = [...this.getColHeader()];
            const columns = [...this.getSettings().columns];

            headers.splice(col, 1);
            columns.splice(col, 1);
            
            this.updateSettings({ colHeaders: headers, columns: columns });
          }
        }, 
        hsep1: { name: "---------" },
        rename_col: {
          name: "✏️ 열 제목 변경",
          callback: function (this: any, key: any, selection: any) {
            const col = selection[0].start.col; const currentName = this.getColHeader(col);
            const newName = prompt("새로운 열 제목을 입력하세요:\n(팁: 제목을 STAGE, 작업자 등으로 지으면 자동 연결됩니다)", currentName);
            if (newName && newName.trim() !== "") {
              const finalName = newName.trim();
              
              const headers = [...this.getColHeader()]; 
              headers[col] = finalName;
              
              const columns = [...this.getSettings().columns];
              const oldKey = columns[col].data;
              columns[col] = { ...columns[col], data: finalName };
              
              const sourceData = this.getSourceData();
              sourceData.forEach((row: any) => {
                row[finalName] = row[oldKey];
                delete row[oldKey];
              });
              
              this.updateSettings({ colHeaders: headers, columns: columns });
            }
          },
        },
      },
    },

    afterDocumentKeyDown: function (this: any, e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === ";") {
        const selected = this.getSelected();
        if (selected && selected[0]) {
          const row = selected[0][0]; const col = selected[0][1]; const colTitle = this.getColHeader(col);
          if (colTitle === "날짜" || col === 0) {
            const today = new Date(); const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, "0"); const dd = String(today.getDate()).padStart(2, "0");
            this.setDataAtCell(row, col, `${yyyy}. ${mm}. ${dd}`); e.preventDefault();
          }
        }
      }
    },
  }), []);

  const handleSaveTemplate = async () => {
    const hot = hotRef.current?.hotInstance; if (!hot) return;
    const headers = hot.getColHeader() as string[]; const colsCount = hot.countCols(); const template = [];
    for (let i = 0; i < colsCount; i++) { template.push({ title: headers[i], width: hot.getColWidth(i) || 100 }); }
    
    const actualRowCount = hot.countSourceRows();
    
    try {
      await setDoc(doc(db, "admin_settings", "excel_template"), { columns: template, rowCount: actualRowCount });
      alert("💾 현재 표 모양이 전체 환자의 기본 양식으로 적용되었습니다!"); setIsEditMode(false);
    } catch (error) { console.error(error); alert("양식 저장 실패 ㅠㅠ"); }
  };

  const handleSaveConditionalFormatting = async () => {
    try {
      const keywords = formattingInput.split("\n").map((v) => v.trim()).filter((v) => v !== "");
      await setDoc(doc(db, "admin_settings", "conditional_formatting"), { redKeywords: keywords, updatedAt: new Date().toISOString() }, { merge: true });
      formattingKeywords = keywords; setSavedKeywords(keywords); setIsFormattingModalOpen(false);
      if (hotRef.current?.hotInstance) hotRef.current.hotInstance.render();
      alert("✅ 조건부 서식 단어가 저장되었습니다!");
    } catch (error) { console.error(error); alert("조건부 서식 저장 실패!"); }
  };

  const syncCurrentTabToMaster = () => {
    const hot = hotRef.current?.hotInstance;
    if (!hot || !activeTab) return;
    
    // ✨ NEW: 시각적 배열(getData) 대신 원본 객체(getSourceData)를 직접 추출하여 매핑 오류 원천 차단
    const sourceData = hot.getSourceData() as RowObject[];
    const cleanData: RowObject[] = sourceData.map((row: RowObject) => {
      const rowObj: RowObject = { ...row };
      Object.keys(rowObj).forEach(key => {
        if (key === "_SHEET_NAME_") return;
        const value = rowObj[key];
        if (key === "STEP") rowObj[key] = (value == null || value === "") ? "" : Number(value);
        else rowObj[key] = value == null ? "" : String(value);
      });
      // 백그라운드 투명 꼬리표 강제 부착
      rowObj["_SHEET_NAME_"] = activeTab;
      return rowObj;
    });
    
    masterDataRef.current[activeTab] = cleanData;
  };

  const handleTabChange = (tab: string) => {
    if (tab === activeTab) return;
    syncCurrentTabToMaster(); 
    setActiveTab(tab);
    const hot = hotRef.current?.hotInstance;
    if (hot) {
      hot.loadData(masterDataRef.current[tab]);
      setTimeout(() => adjustTableToViewport(), 50);
    }
  };
  
const handleSaveRecords = async () => {
    if (!activePatient?.id || isSaving) return; // ✨ NEW: 이미 저장 중이면 중복 실행 차단
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;
  
    // ✨ NEW: 작성 중인 셀(텍스트 에디터)이 열려있다면 강제로 입력을 완료(Commit)시킴
    const editor = hot.getActiveEditor();
    if (editor && editor.isOpened()) {
      editor.finishEditing();
    }

    setIsSaving(true); // ✨ NEW: 빗장 걸기 (저장 시작)

    try {
      syncCurrentTabToMaster(); 
  
      let allFlattenedData: RowObject[] = [];
      sheets.forEach(tab => {
        if (masterDataRef.current[tab]) {
          const sheetRows = masterDataRef.current[tab];
          let lastValidIndex = -1;
          
          for (let i = sheetRows.length - 1; i >= 0; i--) {
            const row = sheetRows[i];
            const hasData = Object.keys(row).some(k => k !== "_SHEET_NAME_" && row[k] !== "");
            if (hasData) {
              lastValidIndex = i;
              break;
            }
          }
          
          if (lastValidIndex >= 0) {
            const validRows = sheetRows.slice(0, lastValidIndex + 1);
            allFlattenedData = [...allFlattenedData, ...validRows];
          }
        }
      });
  
      await setDoc(doc(db, "patients_records", activePatient.id), { rows: allFlattenedData, sheetNames: sheets, lastUpdated: new Date().toISOString() }, { merge: true });
      alert("✅ 환자 Records 데이터가 안전하게 저장되었습니다!");
    } catch (error) { 
      console.error(error); 
      alert("데이터 저장 실패!"); 
    } finally {
      setIsSaving(false); // ✨ NEW: 성공하든 실패하든 무조건 빗장 풀기
    }
  };
      // ✨ NEW: 저장 함수 최신화 거울(Ref) 도입 (Ctrl+S 데이터 증발 버그 완벽 해결)
  const handleSaveRecordsRef = useRef(handleSaveRecords);
  useEffect(() => {
    handleSaveRecordsRef.current = handleSaveRecords;
  }, [handleSaveRecords]);

  // ✨ 5번 요청: Ctrl + S 단축키 및 키보드 상태 관리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      if (e.key === "Control" || e.metaKey) isCtrlDownRef.current = true; 
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveRecordsRef.current(); 
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === "Control" || !e.metaKey) isCtrlDownRef.current = false; };
    const handleBlur = () => { isCtrlDownRef.current = false; };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [activePatient]);

    const handleAddRow = () => {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;
  
    const actualRowCount = hot.countSourceRows();
    const insertIndex = actualRowCount > 0 ? actualRowCount - 1 : 0;
    hot.alter("insert_row_below", insertIndex, 1);

    setTimeout(() => {
      hot.selectCell(insertIndex + 1, 0);
    }, 50);
  };
  
  return (
    <div className="w-full h-full flex flex-col bg-slate-50 relative rounded-lg shadow-sm border border-slate-300 overflow-visible z-10">
      
      <div className="bg-white border-b border-slate-200 p-2 shrink-0 flex justify-between items-center transition-all z-20 shadow-sm">
        
        <div className="flex items-center gap-1.5">
          <button onClick={handleAddRow} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded hover:text-blue-600 transition-colors" title="아래에 행 1개 추가"><Plus className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-slate-200 mx-1"></div>
          <button onClick={() => hotRef.current?.hotInstance?.undo()} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors" title="실행 취소 (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
          <button onClick={() => hotRef.current?.hotInstance?.redo()} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors" title="다시 실행 (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-2">
          {isMaster && (
            <div className="flex items-center pr-3 mr-1 border-r border-slate-200">
              {isEditMode ? (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                  <span className="text-[10px] text-slate-400 mr-2 font-medium">※ 우클릭으로 열 이름/위치 수정 후 저장</span>
                  <button onClick={() => setIsEditMode(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded transition-colors"><X className="w-3.5 h-3.5 inline mr-1" /> 취소</button>
                  <button onClick={handleSaveTemplate} className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-md hover:bg-slate-900 transition-colors shadow-sm"><Save className="w-3.5 h-3.5" /> 템플릿 양식 저장</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-colors rounded"><Settings className="w-3.5 h-3.5" /> 양식 편집</button>
                  <button onClick={() => setIsFormattingModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-50 hover:text-red-600 transition-colors rounded"><Info className="w-3.5 h-3.5" /> 조건부 서식</button>
                </div>
              )}
            </div>
          )}
          
          <button onClick={handleSaveRecords} disabled={isSaving} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
            {isSaving ? "저장 중..." : "차트 저장 (DB)"}
          </button>
                  </div>
      </div>

{/* ✨ [수동 시트 UI 영역] */}
<div className="bg-slate-50 border-b border-slate-200 px-2 pt-2 flex items-center gap-1 overflow-x-auto custom-scrollbar shrink-0 z-20">
        {sheets.map((sheet, index) => (
          <div key={index} className="flex items-center relative group" style={{ marginBottom: "-1px" }}>
            {editingSheetIndex === index ? (
              <input
                autoFocus
                value={editingSheetName}
                onChange={(e) => setEditingSheetName(e.target.value)}
                onBlur={() => handleRenameSheetComplete(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSheetComplete(index);
                  if (e.key === "Escape") setEditingSheetIndex(null);
                }}
                className="px-3 py-2 w-28 text-sm font-bold outline-none border border-b-0 border-blue-500 rounded-t-md bg-white text-blue-600 shadow-[0_2px_0_0_white]"
              />
            ) : (
              <button
                onClick={() => handleTabChange(sheet)}
                onDoubleClick={() => {
                  setEditingSheetIndex(index);
                  setEditingSheetName(sheet);
                }}
                className={`px-4 py-2 pr-8 text-sm font-bold rounded-t-md transition-colors whitespace-nowrap border border-b-0 relative ${
                  activeTab === sheet 
                    ? "bg-white text-blue-600 border-slate-300 shadow-[0_2px_0_0_white] z-10" 
                    : "bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200 z-0"
                }`}
                title="더블클릭하여 시트 이름 변경"
              >
                {sheet}
              </button>
            )}
            
            {/* 시트 삭제(X) 버튼 */}
            {sheets.length > 1 && editingSheetIndex !== index && (
              <button
                onClick={(e) => handleDeleteSheet(sheet, e)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                  activeTab === sheet ? "text-slate-400 hover:bg-red-100 hover:text-red-500 opacity-100" : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-300"
                }`}
                title="시트 삭제"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {/* 시트 추가(+) 버튼 */}
        <button
          onClick={handleAddSheet}
          className="ml-1 px-3 py-1.5 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors mb-1"
          title="새 시트 추가"
        >
          <Plus className="w-4 h-4 font-bold" />
        </button>
      </div>

      <div className="flex-1 p-2 bg-white relative z-10">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-slate-400"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" /><span className="text-sm font-bold">환자 데이터를 불러오는 중...</span></div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          .handsontable thead th { text-align: center !important; vertical-align: middle !important; background-color: #e0e7ff !important; color: #312e81 !important; font-weight: 700 !important; box-sizing: border-box !important; padding-top: 0 !important; padding-bottom: 0 !important; line-height: 1.2 !important; }
          .handsontable thead th .colHeader { display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; text-align: center !important; white-space: nowrap !important; overflow: visible !important; text-overflow: clip !important; }
          .handsontable thead th > div, .handsontable thead th .relative { display: flex !important; align-items: center !important; justify-content: center !important; height: 100% !important; }
          .handsontable thead th .colHeader span { display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; }
          .handsontable th { box-sizing: border-box !important; }
          .handsontable td, .handsontable tbody th { vertical-align: middle !important; box-sizing: border-box !important; line-height: 1.4 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
          .handsontable tbody th { text-align: center !important; color: #1e3a8a !important; font-weight: 700 !important; }
          .handsontable tbody th .relative, .handsontable tbody th > div { display: flex !important; align-items: center !important; justify-content: center !important; height: 100% !important; min-height: 100% !important; width: 100% !important; line-height: 1 !important; }
          .handsontable tbody tr:nth-child(even) td { background-color: #f8fafc !important; }
          .handsontable tbody tr:hover td { background-color: #fef08a !important; transition: background-color 0.2s ease; }
          .handsontable td.stage-column { font-weight: 800 !important; color: #2563eb !important; background-color: #eff6ff !important; }
          .handsontable th, .handsontable td { padding-left: 4px !important; padding-right: 4px !important; }
          .htAutocompleteArrow { right: 4px !important; color: #9ca3af !important; font-size: 10px !important; }
          .handsontable.listbox { margin: 0 !important; z-index: 100000 !important; }
          .handsontable.listbox .wtHolder { overflow-y: auto !important; overflow-x: hidden !important; max-height: 400px !important; }
          .handsontable td.current,
          .handsontable td.area,
          .handsontable td.highlight,
          .handsontable td.current.highlight,
          .handsontable td.area.highlight,
          .handsontable td.ht__highlight {
            background-color: #dbeafe !important;
          }

          .handsontable tbody th.current,
          .handsontable tbody th.area,
          .handsontable tbody th.highlight,
          .handsontable tbody th.ht__highlight {
            background-color: #dbeafe !important;
            color: #1e3a8a !important;
          }
          .handsontable tbody th.current,
          .handsontable tbody th.area {
            background-color: #dbeafe !important;
            color: #1e3a8a !important;
          }
        `}} />

        <HotTable
          ref={hotRef}
          settings={hotSettings}
          width="100%"
          height={tableHeight}
          licenseKey="non-commercial-and-evaluation"
        />
      </div>

      {isFormattingModalOpen && (
        <div className="absolute inset-0 z-[200] bg-black/30 flex items-center justify-center">
          <div className="w-[520px] max-w-[90vw] bg-white rounded-xl shadow-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800">조건부 서식 관리자</h3>
              <button onClick={() => setIsFormattingModalOpen(false)} className="p-1 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="text-sm text-slate-600 mb-3">비고 셀 안에 아래 단어가 들어가면 해당 단어만 빨간 글씨로 표시됩니다.<br />한 줄에 한 단어씩 입력하세요.</div>
            <textarea value={formattingInput} onChange={(e) => setFormattingInput(e.target.value)} className="w-full h-56 border border-slate-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none" placeholder={`예시\n긴급\n재작업\n주의\n문제`} />
            <div className="mt-3 text-xs text-slate-400">현재 저장된 단어: {savedKeywords.length > 0 ? savedKeywords.join(", ") : "없음"}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsFormattingModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 bg-slate-100 rounded hover:bg-slate-200">취소</button>
              <button onClick={handleSaveConditionalFormatting} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded hover:bg-red-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}