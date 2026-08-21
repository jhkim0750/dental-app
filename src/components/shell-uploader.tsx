"use client";

import React, { useState, useEffect } from "react";
import { CloudUpload, FolderPlus, FolderOpen, ChevronDown, ChevronUp, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePatientStoreHydrated } from "@/hooks/use-patient-store"; // ✨ NEW
import { auth } from "@/lib/firebase"; // ✨ NEW: 관리자 이메일 확인용

interface ShellUploaderProps {
  patient: any;
}

interface ShellFolder {
  id: string;
  name: string;
  createdAt: number;
  driveFolderId?: string; // ✨ NEW: 만들어진 구글 드라이브 폴더 기억
  files?: string[];       // ✨ NEW: 그 안에 들어간 파일들 박제
  isUploading?: boolean;
  progress?: number;
}

export function ShellUploader({ patient }: ShellUploaderProps) {
  const store = usePatientStoreHydrated(); // ✨ NEW
  const [folders, setFolders] = useState<ShellFolder[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null); // ✨ NEW: 현재 로그인한 이메일

  // ✨ NEW: 화면이 켜질 때 파이어베이스에서 로그인된 이메일을 가져옵니다
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });
    return () => unsub();
  }, []);  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // 현재 활성화된 스테이지 이름과 환자 번호 가져오기
  const currentStage = patient?.stages?.find((s: any) => s.id === patient.activeStageId) || patient?.stages?.[0];

  // ✨ NEW: 셋업(스테이지)이 바뀔 때마다 해당 셋업의 폴더 기록을 불러와서 화면에 복원 (완벽한 격리)
  useEffect(() => {
    if (currentStage?.shellLogs) {
      setFolders(currentStage.shellLogs.map((log: any) => ({ ...log, isUploading: false, progress: 0 })));
    } else {
      setFolders([]);
    }
  }, [currentStage?.id, currentStage?.shellLogs]);  
  
  const setupName = currentStage?.name || "신규";
  const caseNumber = patient?.case_number || "환자번호없음";

  // 기본 양식 생성
  const defaultFormat = `${setupName} (${caseNumber}) STAGE?-?~? T0.5 OFF0.05`;

  const handleOpenModal = () => {
    setNewFolderName(defaultFormat);
    setIsModalOpen(true);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: ShellFolder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      createdAt: Date.now(),
      files: [],
      isUploading: false,
      progress: 0,
    };
    
    // 화면에 띄우고 동시에 파이어베이스(현재 셋업 방 안)에 영구 저장
    const newLogs = [newFolder, ...(currentStage?.shellLogs || [])];
    if (store && currentStage) {
      store.updateStageInfo(patient.id, currentStage.id, { shellLogs: newLogs });
    }
    
    setFolders(newLogs);
    setIsModalOpen(false);
    setExpandedFolderId(newFolder.id);
  };

  const createGoogleDriveFolder = async (folderName: string, accessToken: string) => {
    const response = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ["1agzrAMczTc2hFf54zArv9ENddndciIfp"], // 원장님 공유 폴더
      }),
    });
    if (!response.ok) throw new Error('폴더 생성 실패');
    const data = await response.json();
    return data.id; 
  };

  // ✨ NEW: existingDriveFolderId 파라미터 추가
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, folderId: string, folderName: string, existingDriveFolderId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isUploading: true, progress: 0 } : f));

    try {
      const tokenResponse = await fetch('/api/get-drive-token', { cache: 'no-store' });
      if (!tokenResponse.ok) throw new Error("토큰 발급 API 호출 실패");      
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.token;

// 💡 이미 만들어둔 구글 폴더가 있다면 새로 안 만들고 재활용! 없으면 생성!
let driveFolderId = existingDriveFolderId;
      
// ✨ NEW: 기존 폴더가 있다면, 휴지통에 버려졌거나 영구 삭제되었는지 '사전 검문'
if (driveFolderId) {
  const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFolderId}?fields=trashed`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // 1. 완전히 영구 삭제되어 찾을 수 없는 경우 (404 등)
  if (!checkRes.ok) {
    throw new Error("폴더가 삭제되었을 수 있습니다");
  }
  
  // 2. 파일은 존재하지만 '휴지통'에 들어가 있는 경우
  const checkData = await checkRes.json();
  if (checkData.trashed) {
    throw new Error("폴더가 삭제되었을 수 있습니다");
  }
} else {
  // 기존 폴더가 없으면 새로 생성
  driveFolderId = await createGoogleDriveFolder(folderName, accessToken);
}

for (let i = 0; i < files.length; i++) {        
        const file = files[i];
        const metadata = { name: file.name, parents: [driveFolderId] };
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: formData,
        });
        
        // ✨ NEW: 구글에서 폴더를 못 찾거나 실패하면 즉시 에러 발생! (가짜 박제 방지)
        if (!uploadRes.ok) throw new Error("구글 드라이브 업로드 실패 (폴더가 삭제되었을 수 있습니다)");

        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, progress: Math.round(((i + 1) / files.length) * 100) } : f));        
      }

      // 💡 업로드된 파일명과 현재 시간을 파이어베이스 배열에 누적(Append) 저장
      if (store && currentStage) {
          const now = Date.now();
          const uploadedFilesWithDate = files.map(f => ({ name: f.name, date: now }));
          const newLogs = (currentStage.shellLogs || []).map((log: any) => {
              if (log.id === folderId) {
                  return { ...log, driveFolderId, files: [...(log.files || []), ...uploadedFilesWithDate] };
              }
              return log;
          });
          await store.updateStageInfo(patient.id, currentStage.id, { shellLogs: newLogs });
      }

    } catch (error: any) {
      console.error("업로드 에러:", error);
      
      // ✨ NEW: 구글 드라이브 폴더 삭제 에러인 경우 명확한 맞춤형 경고창 띄우기
      if (error.message && error.message.includes("폴더가 삭제되었을 수 있습니다")) {
        alert("이미 삭제된 구글 드라이브 폴더입니다. 해당 기록을 삭제해 주세요.");
      } else {
        alert("구글 드라이브 업로드 중 오류가 발생했습니다.");
      }
      
      // ✨ NEW: 업로드 실패 시, 게이지를 100%로 덮어씌우지 않고 0%로 초기화 후 함수 종료
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isUploading: false, progress: 0 } : f));
      return; 
    } 
    
    // ✨ NEW: 에러 없이 완벽하게 성공했을 때만 100% 완료 처리
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isUploading: false, progress: 100 } : f));
  };

  // ✨ NEW: 관리자 전용 폴더 기록 삭제 함수 (화면/DB 상의 기록만 삭제)
  const handleDeleteFolderLog = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation(); // 폴더 펼침/접힘 이벤트 방지
    if (!confirm("이 폴더 업로드 기록을 삭제하시겠습니까?")) return;

    if (store && currentStage) {
      const updatedLogs = (currentStage.shellLogs || []).filter((log: any) => log.id !== folderId);
      await store.updateStageInfo(patient.id, currentStage.id, { shellLogs: updatedLogs });
      setFolders(updatedLogs);
    }
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4 shrink-0">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CloudUpload className="w-6 h-6 text-blue-600" /> Shell Upload to Google Drive
        </h2>
        <Button onClick={handleOpenModal} className="bg-blue-600 hover:bg-blue-700 gap-2 shadow-sm font-bold">
          <FolderPlus className="w-4 h-4" /> 폴더 추가
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-20 custom-scrollbar">
        {folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-bold">우측 상단의 '+ 폴더 추가' 버튼을 눌러주세요.</p>
          </div>
        ) : (
          folders.map((folder) => {
            const isExpanded = expandedFolderId === folder.id;
            return (
              <div key={folder.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all duration-300">
                <div
                  className="px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)}
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className={cn("w-5 h-5", isExpanded ? "text-blue-500" : "text-slate-400")} />
                    <span className="font-extrabold text-slate-700 text-sm tracking-tight">{folder.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
{/* ✨ NEW: jhkim@odsresin.com 관리자 전용 삭제 버튼 (실제 로그인 유저 기준) */}
{currentUserEmail === "jhkim@odsresin.com" && (
                      <button
                        onClick={(e) => handleDeleteFolderLog(e, folder.id)}                        
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="기록 삭제 (관리자 전용)"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-4">
                    {/* 1. 드래그 앤 드롭 영역 */}
                    <div 
                      className={cn("w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors cursor-pointer group relative overflow-hidden shrink-0", 
                        folder.isUploading ? "border-blue-400 bg-blue-50/80" : "border-blue-200 bg-blue-50/30 text-blue-500 hover:bg-blue-50/60 hover:border-blue-400")}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        if (folder.isUploading) return;
                        handleDrop(e, folder.id, folder.name, folder.driveFolderId);
                      }}
                    >
                      {folder.isUploading ? (
                        <div className="flex flex-col items-center gap-2 text-blue-600 z-10">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span className="text-sm font-extrabold tracking-tight">구글 드라이브 전송 중... {folder.progress}%</span>
                          <div className="w-48 h-2 bg-blue-100 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${folder.progress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <CloudUpload className="w-8 h-8 mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                          <span className="text-sm font-bold">이곳에 .stl 파일을 드래그 앤 드롭 하세요</span>
                          <span className="text-xs text-blue-400 mt-1 font-medium">구글 드라이브로 즉시 다이렉트 업로드됩니다.</span>
                        </>
                      )}
                    </div>

                    {/* 2. 박제된 파일 기록 영역 (우측 날짜/시간 표시 및 과거 데이터 호환성 보장) */}
                    {folder.files && folder.files.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm animate-in fade-in">
                        <h4 className="text-xs font-bold text-slate-500 mb-2 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-green-500"/> 업로드 완료된 파일 목록
                        </h4>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                          {folder.files.map((fileItem: any, idx: number) => {
                            // 단순 문자열(옛날 데이터) 및 시간 객체(새 데이터) 모두 호환
                            const fileName = typeof fileItem === 'string' ? fileItem : fileItem.name;
                            const fileDate = typeof fileItem === 'object' && fileItem.date ? fileItem.date : null;

                            return (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                <div className="flex items-center gap-2 truncate pr-2">
                                  <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-extrabold tracking-tighter shrink-0">.stl</span>
                                  <span className="font-medium truncate">{fileName}</span>
                                </div>
                                {fileDate && (
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                    {new Date(fileDate).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xl w-[600px] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600" /> 새 폴더 만들기
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-3 font-medium">아래 양식에서 <strong className="text-blue-600 font-extrabold">?</strong> 기호를 지우고 필요한 숫자를 입력하세요.</p>
            
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full border-2 border-blue-100 rounded-lg p-3 text-sm font-extrabold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all mb-6"
              autoFocus
            />
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>취소</Button>
              <Button onClick={handleCreateFolder} className="bg-blue-600 hover:bg-blue-700">
                <Check className="w-4 h-4 mr-1" /> 만들기
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}