import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
// ✨ [새로 추가된 부분] 파이어베이스의 '인증(Auth)' 부서에서 도구를 가져옵니다.
import { getAuth, GoogleAuthProvider } from "firebase/auth"; 

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

// ✨ [새로 추가된 부분] 앱에서 쓸 수 있도록 인증 도구들을 내보냅니다 (기존 코드에 영향 없음!)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();