import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// ✨ 선생님이 보내주신 바로 그 설정값입니다!
const firebaseConfig = {
  apiKey: "AIzaSyABDSZ7w5vkWiIowQ-o4xxRUwRH3YC2XLs",
  authDomain: "dental-app-ods.firebaseapp.com",
  projectId: "dental-app-ods",
  storageBucket: "dental-app-ods.firebasestorage.app",
  messagingSenderId: "726377600009",
  appId: "1:726377600009:web:aefb012a6efd52375ed4d8",
  measurementId: "G-RXSPNRSL6Z"
};

const app = initializeApp(firebaseConfig);

// 파일 저장 창고 (STL 파일용)
export const storage = getStorage(app);
// 데이터베이스 (환자 정보 텍스트용)
export const db = getFirestore(app);