import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

export const dynamic = 'force-dynamic'; // ✨ NEW: Next.js 서버 캐싱 강제 무력화 (항상 새 토큰 발급)

export async function GET() {
  try {    
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        // \n 문자가 이스케이프되어 들어오는 것을 방지하여 정상적인 줄바꿈으로 치환
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      // 구글 드라이브 파일 업로드 전용 권한
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      throw new Error('토큰 발급 실패');
    }

    return NextResponse.json({ token: token.token });
  } catch (error) {
    console.error('Drive API 토큰 발급 에러:', error);
    return NextResponse.json({ error: '구글 드라이브 연동에 실패했습니다. (.env 확인 필요)' }, { status: 500 });
  }
}