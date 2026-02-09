import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// ✨ Firebase 콘솔 -> 프로젝트 설정에서 복사한 값을 여기에 붙여넣으세요.
const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app); // 파일 저장용
export const db = getFirestore(app);      // 환자 정보 저장용