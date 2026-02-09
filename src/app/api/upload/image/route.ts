import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 1. 저장할 폴더 만들기 (public/uploads/images)
    const uploadDir = path.join(process.cwd(), "public", "uploads", "images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 2. 파일 이름 중복 방지 (날짜 + 랜덤숫자)
    const ext = path.extname(file.name);
    const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // 3. 파일 저장
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    // 4. 저장된 주소(URL) 보내주기
    const fileUrl = `/uploads/images/${fileName}`;
    return NextResponse.json({ url: fileUrl });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}