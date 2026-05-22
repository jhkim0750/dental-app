"use client";

import React, { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from "firebase/firestore";
import { 
  Settings, 
  LogOut, 
  UserPlus, 
  Trash2, 
  Users, 
  X, 
  Check, 
  XCircle, 
  BellRing, 
  TableProperties, 
  ShieldCheck,
  DatabaseBackup // ✨ 백업 아이콘 추가
} from "lucide-react";
import { Button } from "@/components/ui/button";

const MASTER_EMAIL = "jhkim@odsresin.com";

const PILL_COLORS = [
  { bg: '#fecaca', text: '#991b1b' }, 
  { bg: '#fed7aa', text: '#9a3412' }, 
  { bg: '#fef08a', text: '#854d0e' }, 
  { bg: '#bbf7d0', text: '#166534' }, 
  { bg: '#bfdbfe', text: '#1e3a8a' }, 
  { bg: '#e9d5ff', text: '#6b21a8' },
];

export function UserControls() {
  const [user, setUser] = useState(auth.currentUser);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  
  const [adminTab, setAdminTab] = useState<'auth' | 'excel'>('auth');

  const [excelWorkers, setExcelWorkers] = useState<any[]>([]);
  const [newWorkerName, setNewWorkerName] = useState("");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsub();
  }, []);

  const isMaster = user?.email === MASTER_EMAIL;

  const handleLogout = async () => {
    if (confirm("시스템에서 로그아웃 하시겠습니까?")) {
      await signOut(auth);
    }
  };

  const fetchData = async () => {
    const allowedSnap = await getDocs(collection(db, "allowed_users"));
    const users: string[] = [];
    allowedSnap.forEach((doc) => users.push(doc.id));
    setAllowedUsers(users);

    const pendingSnap = await getDocs(collection(db, "access_requests"));
    const requests: string[] = [];
    pendingSnap.forEach((doc) => requests.push(doc.id));
    setPendingRequests(requests);
  };

  useEffect(() => {
    if (isAdminOpen && isMaster) {
      fetchData();
      
      const q = query(collection(db, "excel_workers"), orderBy("addedAt", "asc"));
      const unsubWorkers = onSnapshot(q, (snapshot) => {
        const workers: any[] = [];
        snapshot.forEach((doc) => workers.push({ id: doc.id, ...doc.data() }));
        setExcelWorkers(workers);
      });
      
      return () => unsubWorkers();
    }
  }, [isAdminOpen, isMaster]);

  // ==========================================
  // ✨ [NEW] 파이어베이스 전체 환자 데이터 엑셀 백업 함수
  // ==========================================
  const handleExportAllPatients = async () => {
    try {
      alert("전체 환자 데이터를 불러와 엑셀을 생성합니다. 데이터가 많으면 몇 초 정도 걸릴 수 있습니다 ⏳");

      // 1. 파이어베이스에서 '모든 환자 정보(껍데기)' 가져오기
      const patientsSnap = await getDocs(collection(db, "patients"));
      const patientsMap: Record<string, any> = {};
      patientsSnap.forEach(doc => {
        patientsMap[doc.id] = doc.data();
      });

      // 2. 파이어베이스에서 '모든 레코드(표 데이터)' 가져오기
      const recordsSnap = await getDocs(collection(db, "patients_records"));

      // 3. 엑셀에 들어갈 고정 헤더
      const headers = ["날짜", "병원명", "환자명", "환자번호", "STAGE", "STEP", "상악", "하악", "작업자", "비고", "프로그램"];
      const csvRows: any[][] = [];

      // 4. 레코드를 하나씩 돌면서 환자 정보와 조립하기
      recordsSnap.forEach(recordDoc => {
        const patientId = recordDoc.id;
        const patientData = patientsMap[patientId];
        const recordData = recordDoc.data();

        if (patientData && recordData.rows && Array.isArray(recordData.rows)) {
          recordData.rows.forEach((row: any) => {
            // 완전히 비어있는 빈 줄(gap)은 엑셀에서 제외
            const hasData = Object.values(row).some(v => v !== null && v !== "");
            if (!hasData) return;

            const cleanText = (text: any) => String(text || "").replace(/"/g, '""');

            csvRows.push([
              cleanText(row["날짜"]),
              cleanText(patientData.hospital || patientData.clinic_name),
              cleanText(patientData.name),
              cleanText(patientData.case_number),
              cleanText(row["STAGE"]),
              cleanText(row["STEP"]),
              cleanText(row["상악"]),
              cleanText(row["하악"]),
              cleanText(row["작업자"]),
              cleanText(row["비고"]),
              cleanText(row["Program"])
            ]);
          });
        }
      });

      if (csvRows.length === 0) {
        alert("백업할 데이터가 없습니다.");
        return;
      }

      // 5. 엑셀(CSV) 파일로 굽기 (한글 깨짐 방지용 \ufeff 포함)
      const csvContent = [
        headers.join(","),
        ...csvRows.map(r => r.map(v => `"${v}"`).join(","))
      ].join("\n");

      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      const fileName = `Total_Database_Backup_${new Date().toLocaleDateString().replace(/\s/g, "")}.csv`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("전체 백업 실패:", error);
      alert("백업 중 오류가 발생했습니다.");
    }
  };

  // ==========================================
  // [1] 접근 권한 (이메일) 관련 함수
  // ==========================================
  const handleAddUser = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return alert("유효한 이메일을 입력해주세요.");
    }
    
    try {
      await setDoc(doc(db, "allowed_users", email), { 
        addedAt: new Date().toISOString() 
      });
      setNewEmail("");
      fetchData(); 
    } catch (error) {
      alert("이메일 추가 중 오류가 발생했습니다.");
    }
  };

  const handleAcceptRequest = async (email: string) => {
    try {
      await setDoc(doc(db, "allowed_users", email), { 
        addedAt: new Date().toISOString() 
      });
      await deleteDoc(doc(db, "access_requests", email));
      fetchData();
    } catch (error) {
      alert("승인 중 오류가 발생했습니다.");
    }
  };

  const handleRejectRequest = async (email: string) => {
    if (confirm(`[${email}] 계정의 요청을 거절하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "access_requests", email));
        fetchData();
      } catch (error) {
        alert("거절 중 오류가 발생했습니다.");
      }
    }
  };

  const handleRemoveUser = async (email: string) => {
    if (confirm(`[${email}] 계정의 접근 권한을 영구 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "allowed_users", email));
        fetchData(); 
      } catch (error) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  // ==========================================
  // [2] 엑셀 작업자 이름표 관련 함수
  // ==========================================
  const handleAddWorker = async () => {
    const name = newWorkerName.trim();
    if (!name) return;
    
    if (excelWorkers.some(w => w.name === name)) {
      return alert('이미 등록된 이름입니다!');
    }
    
    try {
      const colorIndex = excelWorkers.length % PILL_COLORS.length;
      const selectedColor = PILL_COLORS[colorIndex];
      
      await addDoc(collection(db, "excel_workers"), { 
        name, 
        bgColor: selectedColor.bg, 
        textColor: selectedColor.text, 
        addedAt: new Date().toISOString() 
      });
      setNewWorkerName("");
    } catch (error) {
      alert("이름표 추가 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteWorker = async (workerId: string, workerName: string) => {
    if (confirm(`'${workerName}' 이름을 명단에서 영구 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, "excel_workers", workerId));
      } catch (error) {
        alert("삭제 중 오류가 발생했습니다.");
      }
    }
  };

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 ml-1 relative">
        {isMaster && (
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-1.5 h-8 text-blue-600 border-blue-200 hover:bg-blue-50 bg-blue-50/50 relative" 
            onClick={() => setIsAdminOpen(true)}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Admin</span>
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
            )}
          </Button>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1.5 h-8 text-slate-500 hover:text-red-600 hover:bg-red-50" 
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      {isAdminOpen && isMaster && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onMouseDown={() => setIsAdminOpen(false)} 
          />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                <Settings className="w-5 h-5 text-blue-600"/> 
                시스템 관리자 설정
              </h3>
              <button 
                onClick={() => setIsAdminOpen(false)} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="flex border-b shrink-0 bg-white">
              <button 
                className={`flex-1 py-3 text-[13px] font-bold border-b-2 flex justify-center items-center gap-1.5 ${
                  adminTab === 'auth' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:bg-slate-50'
                }`} 
                onClick={() => setAdminTab('auth')}
              >
                <ShieldCheck className="w-4 h-4" /> 
                접근 권한 (이메일)
              </button>
              <button 
                className={`flex-1 py-3 text-[13px] font-bold border-b-2 flex justify-center items-center gap-1.5 ${
                  adminTab === 'excel' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:bg-slate-50'
                }`} 
                onClick={() => setAdminTab('excel')}
              >
                <Users className="w-4 h-4" /> 
                엑셀 이름표 (작업자)
              </button>
            </div>

            <div className="p-5 overflow-y-auto w-full">
              
              {/* ===================================== */}
              {/* 탭 1: 접근 권한                         */}
              {/* ===================================== */}
              {adminTab === 'auth' && (
                <div className="space-y-6 animate-in fade-in">
                  
                  {pendingRequests.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5" /> 
                        승인 대기 중인 요청 ({pendingRequests.length}명)
                      </h4>
                      <ul className="space-y-2">
                        {pendingRequests.map((email) => (
                          <li key={email} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-orange-100 shadow-sm">
                            <span className="text-sm font-bold text-slate-700 truncate mr-2">{email}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button 
                                size="sm" 
                                onClick={() => handleAcceptRequest(email)} 
                                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 gap-1 px-2.5"
                              >
                                <Check className="w-3 h-3" /> 승인
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleRejectRequest(email)} 
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">직접 이메일 등록</h4>
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 border p-2.5 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        placeholder="이메일 입력" 
                        value={newEmail} 
                        onChange={e => setNewEmail(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                      />
                      <Button 
                        onClick={handleAddUser} 
                        className="bg-slate-800 hover:bg-slate-900 gap-2 px-4"
                      >
                        <UserPlus className="w-4 h-4" /> 등록
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">등록된 계정 ({allowedUsers.length}명)</h4>
                    <ul className="divide-y border rounded-lg max-h-[300px] overflow-y-auto">
                      {allowedUsers.map(email => (
                        <li key={email} className="flex justify-between p-3 text-sm font-medium items-center hover:bg-slate-50">
                          {email} 
                          <button 
                            onClick={() => handleRemoveUser(email)} 
                            className="p-1.5 text-slate-300 hover:text-red-500 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>
              )}

              {/* ===================================== */}
              {/* 탭 2: 엑셀 이름표                       */}
              {/* ===================================== */}
              {adminTab === 'excel' && (
                <div className="space-y-6 animate-in fade-in">
                  
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">작업자 이름(ID) 추가</h4>
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 border p-2.5 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        placeholder="예: 정현, 홍길동 원장" 
                        value={newWorkerName} 
                        onChange={e => setNewWorkerName(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleAddWorker()}
                      />
                      <Button 
                        onClick={handleAddWorker} 
                        className="bg-slate-800 hover:bg-slate-900 gap-2 px-4"
                      >
                        <UserPlus className="w-4 h-4" /> 등록
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">현재 등록된 엑셀 이름표 ({excelWorkers.length}명)</h4>
                    <ul className="divide-y border rounded-lg max-h-[300px] overflow-y-auto">
                      {excelWorkers.map(w => (
                        <li key={w.id} className="flex justify-between p-3 text-sm group items-center hover:bg-slate-50 transition-colors">
                          <span 
                            className="font-bold px-2 py-1 rounded-md" 
                            style={{ backgroundColor: w.bgColor, color: w.textColor }}
                          >
                            {w.name}
                          </span> 
                          <button 
                            onClick={() => handleDeleteWorker(w.id, w.name)} 
                            className="p-1.5 text-slate-300 hover:text-red-500 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>
              )}

            </div>
            
            {/* ✨ [NEW] 엑셀 백업을 위한 모달 전용 하단 영역 (Footer) */}
            <div className="p-4 border-t bg-slate-50 flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-slate-800">전체 데이터 백업</span>
                <span className="text-[10px] font-medium text-slate-500 mt-0.5">모든 환자의 레코드를 엑셀로 다운로드합니다.</span>
              </div>
              <Button 
                onClick={handleExportAllPatients} 
                className="bg-green-600 hover:bg-green-700 text-white gap-1.5 shadow-sm font-bold"
              >
                <DatabaseBackup className="w-4 h-4"/> 엑셀 다운로드
              </Button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}