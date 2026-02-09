import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const patientName = formData.get("patientName") as string;
    const step = formData.get("step") as string;

    if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

    // 1. Firebase Storage(창고)에 파일 업로드 경로 설정
    const storageRef = ref(storage, `patients/${patientName}/step_${step}/${file.name}`);
    const buffer = await file.arrayBuffer();
    
    // 업로드 실행
    const snapshot = await uploadBytes(storageRef, new Uint8Array(buffer));
    const downloadURL = await getDownloadURL(snapshot.ref);

    // 2. Firestore(장부)에 환자 데이터 기록 (리스트에 띄우기 위함)
    await addDoc(collection(db, "cases"), {
      patientName,
      step: parseInt(step),
      fileUrl: downloadURL,
      fileName: file.name,
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true, url: downloadURL });
  } catch (error) {
    console.error("Firebase 업로드 에러:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}