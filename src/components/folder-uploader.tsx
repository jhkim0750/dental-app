"use client";

import React, { useRef, useState } from "react";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { UploadCloud, Loader2 } from "lucide-react";
import { usePatientStore } from "@/hooks/use-patient-store";

interface FolderUploaderProps {
  patientId: string;
  onUploadComplete: () => void;
}

export default function FolderUploader({ patientId, onUploadComplete }: FolderUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadText, setUploadText] = useState("Upload Folder");
  const { fetchPatients } = usePatientStore();

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    if (!confirm(`${files.length}개의 파일을 Patient ID: ${patientId}에 업로드하시겠습니까?`)) return;

    setIsUploading(true);
    const stepsData: { [key: number]: { upper?: string; lower?: string } } = {};

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // ✨ 기존 로직 그대로: "내폴더/1_Malocclusion/upper.stl" -> "1_Malocclusion/upper.stl"
        const fullPath = file.webkitRelativePath;
        const pathParts = fullPath.split("/");
        const relativePath = pathParts.slice(1).join("/"); 
        const fileName = pathParts[pathParts.length - 1].toLowerCase();

        // 1. 스텝 번호 추출 (폴더명이나 파일명에서 숫자 찾기)
        const stepMatch = relativePath.match(/(\d+)/);
        if (!stepMatch) continue;
        const stepNum = parseInt(stepMatch[1]);

        // 2. 상/하악 판단 (선생님 파일 규칙에 맞춰 확장 가능)
        // 파일명이나 경로에 'u'가 들어가면 상악, 'l'이 들어가면 하악으로 판단하는 기존 방식 유지
        const isUpper = fileName.includes("upper") || fileName.includes("_u") || fileName.includes("maxilla");
        const isLower = fileName.includes("lower") || fileName.includes("_l") || fileName.includes("mandible");

        setUploadText(`${i + 1}/${files.length} 업로드...`);

        // 3. Firebase Storage 업로드
        const storageRef = ref(storage, `dental_cases/${patientId}/step_${stepNum}/${fileName}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);

        if (!stepsData[stepNum]) stepsData[stepNum] = {};
        if (isUpper) stepsData[stepNum].upper = url;
        if (isLower) stepsData[stepNum].lower = url;
      }

      // 4. Firestore 환자 데이터 업데이트 (워크 서머리 저장방식 유지)
      const finalSteps = Object.keys(stepsData)
        .map((key) => ({
          step: parseInt(key),
          upper: stepsData[parseInt(key)].upper || "",
          lower: stepsData[parseInt(key)].lower || ""
        }))
        .sort((a, b) => a.step - b.step);

      const patientRef = doc(db, "patients", patientId);
      await updateDoc(patientRef, {
        steps: finalSteps,
        total_steps: finalSteps.length > 0 ? Math.max(...finalSteps.map(s => s.step)) + 1 : 0
      });

      alert("업로드가 완료되었습니다! 🎉");
      fetchPatients(); 
      onUploadComplete();
    } catch (err) {
      console.error(err);
      alert("업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      setUploadText("Upload Folder");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFolderSelect}
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
      />
      <Button 
        variant="outline" 
        onClick={() => fileInputRef.current?.click()} 
        disabled={isUploading}
        className="gap-2 bg-white text-slate-700 border-slate-300 hover:bg-slate-50 w-full"
      >
        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        {uploadText}
      </Button>
    </>
  );
}