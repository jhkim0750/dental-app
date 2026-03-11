"use client";

import React, { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase"; 
import { signOut } from "firebase/auth";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { Settings, LogOut, UserPlus, Trash2, Users, X, Check, XCircle, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

const MASTER_EMAIL = "jhkim@odsresin.com";

export function UserControls() {
  const [user, setUser] = useState(auth.currentUser);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");

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
    // 1. 등록된 사용자 가져오기
    const allowedSnap = await getDocs(collection(db, "allowed_users"));
    const users: string[] = [];
    allowedSnap.forEach((doc) => users.push(doc.id));
    setAllowedUsers(users);

    // 2. 대기 중인 요청 가져오기
    const pendingSnap = await getDocs(collection(db, "access_requests"));
    const requests: string[] = [];
    pendingSnap.forEach((doc) => requests.push(doc.id));
    setPendingRequests(requests);
  };

  useEffect(() => {
    if (isAdminOpen && isMaster) {
      fetchData();
    }
  }, [isAdminOpen, isMaster]);

  // 수동으로 이메일 추가하기
  const handleAddUser = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return alert("유효한 이메일을 입력해주세요.");
    
    try {
      await setDoc(doc(db, "allowed_users", email), { addedAt: new Date().toISOString() });
      setNewEmail("");
      fetchData(); 
    } catch (error) {
      alert("추가 중 오류가 발생했습니다.");
    }
  };

  // 대기 요청 승인하기
  const handleAcceptRequest = async (email: string) => {
    try {
      await setDoc(doc(db, "allowed_users", email), { addedAt: new Date().toISOString() });
      await deleteDoc(doc(db, "access_requests", email)); // 승인 후 대기실에서 삭제
      fetchData();
    } catch (error) {
      alert("승인 중 오류가 발생했습니다.");
    }
  };

  // 대기 요청 거절하기
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

  // 등록된 직원 삭제하기
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
            title="직원 권한 관리"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">Admin</span>
            {/* ✨ 빨간색 알림 점 (대기자가 있을 때만 표시) */}
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
            )}
          </Button>
        )}

        <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-slate-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      {isAdminOpen && isMaster && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={() => setIsAdminOpen(false)} />
          
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                <Users className="w-5 h-5 text-blue-600"/> VIP 직원 관리
              </h3>
              <button onClick={() => setIsAdminOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-5 space-y-6 max-h-[85vh] overflow-y-auto">
              
              {/* ✨ 1. 승인 대기 중인 요청 목록 */}
              {pendingRequests.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 animate-in slide-in-from-top-2">
                  <h4 className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5" /> 승인 대기 중인 요청 ({pendingRequests.length}명)
                  </h4>
                  <ul className="space-y-2">
                    {pendingRequests.map((email) => (
                      <li key={email} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-orange-100 shadow-sm">
                        <span className="text-sm font-bold text-slate-700 truncate mr-2">{email}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" onClick={() => handleAcceptRequest(email)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 gap-1 px-2.5">
                            <Check className="w-3 h-3" /> 승인
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRejectRequest(email)} className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ✨ 2. 수동 직원 추가 */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">직접 이메일 등록</h4>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 border p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50" 
                    placeholder="직원의 구글 이메일 입력" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                  />
                  <Button onClick={handleAddUser} className="bg-slate-800 hover:bg-slate-900 gap-2 px-4">
                    <UserPlus className="w-4 h-4" /> 등록
                  </Button>
                </div>
              </div>

              {/* ✨ 3. 등록된 직원 목록 */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2 px-1">현재 등록된 계정 ({allowedUsers.length}명)</h4>
                <div className="border border-slate-200 rounded-lg max-h-[200px] overflow-y-auto bg-slate-50/50">
                  {allowedUsers.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">등록된 직원이 없습니다.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {allowedUsers.map((email) => (
                        <li key={email} className="flex justify-between items-center p-3 bg-white hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-medium text-slate-700 truncate">{email}</span>
                          <button onClick={() => handleRemoveUser(email)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="권한 삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}