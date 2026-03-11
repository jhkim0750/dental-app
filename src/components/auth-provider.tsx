"use client";

import React, { useEffect, useState } from "react";
import { auth, db, googleProvider } from "@/lib/firebase"; 
import { signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Loader2, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const MASTER_EMAIL = "jhkim@odsresin.com";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (currentUser.email === MASTER_EMAIL) {
          setIsAllowed(true);
        } else {
          try {
            const docRef = doc(db, "allowed_users", currentUser.email || "");
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
              setIsAllowed(true); 
            } else {
              setIsAllowed(false); 
              // ✨ [핵심 기능] 명단에 없으면 'access_requests(대기실)'에 자동 등록!
              await setDoc(doc(db, "access_requests", currentUser.email || ""), {
                email: currentUser.email,
                requestedAt: new Date().toISOString()
              }, { merge: true });
            }
          } catch (error) {
            console.error("권한 에러:", error);
            setIsAllowed(false);
          }
        }
      } else {
        setUser(null);
        setIsAllowed(false);
      }
      setLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("로그인 실패:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50/50 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-500 text-sm font-medium tracking-wide">보안 환경을 준비 중입니다...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-50 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-100/50 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-cyan-100/50 rounded-full mix-blend-multiply filter blur-3xl opacity-70"></div>

        <div className="relative z-10 bg-white/90 backdrop-blur-xl p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/50 flex flex-col items-center text-center max-w-[400px] w-full">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 shadow-inner ring-1 ring-blue-100/50">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
          </div>
          <div className="mb-2 w-full">
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dental Work Note</h1>
          </div>
          <p className="text-slate-500 mb-10 text-[15px] leading-relaxed">
            허가된 관계자만 접근할 수 있는 <br />
            <span className="font-semibold text-blue-600">보안 클라우드 워크스페이스</span>입니다.
          </p>
          <button 
            onClick={handleLogin} 
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-slate-700 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google 계정으로 계속하기
          </button>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center bg-slate-50 overflow-hidden">
        <div className="relative z-10 bg-white/90 backdrop-blur-xl p-10 rounded-2xl shadow-lg border border-orange-100 flex flex-col items-center text-center max-w-[400px] w-full">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 ring-1 ring-orange-200">
            <Clock className="w-7 h-7 text-orange-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">승인 대기 중</h1>
          <p className="text-slate-500 mb-8 text-[15px] leading-relaxed">
            <strong className="text-slate-800 block mb-1">{user.email}</strong>
            원장님(마스터)에게 <strong className="text-orange-600">접근 승인 요청</strong>을 보냈습니다.<br/>승인이 완료된 후 다시 로그인해 주세요.
          </p>
          <Button onClick={async () => await signOut(auth)} variant="outline" className="w-full font-bold">
            돌아가기 (로그아웃)
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}