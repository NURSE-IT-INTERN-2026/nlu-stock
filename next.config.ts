import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  // Served from a subpath on the faculty server; the CMU OAuth callback is registered
  // against it. See src/lib/base-path.ts for what Next does NOT prefix on its own.
  basePath: BASE_PATH,
  // Dev only: allow LAN hosts (e.g. testing from a phone/other machine) to reach
  // HMR + dev resources. No effect in production.
  allowedDevOrigins: ["10.124.129.83", "*.ngrok-free.dev"],
  // pdfkit resolves its AFM font data via __dirname; Turbopack rewrites that to
  // /ROOT so Helvetica.afm goes missing (PDF export 500s). Keep it external so
  // Node resolves the real node_modules path.
  serverExternalPackages: ["pdfkit"],
  // ไม่มี header ชุดนี้มาก่อนเลย — หน้าจอทั้งระบบถูก iframe ซ้อนได้ และเมื่อ XSS หลุดสักจุด
  // ก็ไม่มีอะไรรองรับ. frame-ancestors คือตัวที่เบราว์เซอร์ใหม่อ่านจริง ส่วน X-Frame-Options
  // ไว้ให้ตัวเก่า; ทั้งคู่พูดเรื่องเดียวกัน
  //
  // CSP เต็มใบ (script-src) ยังไม่ใส่: Next ฝัง inline script ของตัวเองทุกหน้า ต้องเดิน nonce
  // ผ่าน proxy ก่อน — คนละงานกัน. ที่อยู่ตรงนี้คือส่วนที่ได้เปล่า ไม่กระทบการ render
  //
  // เส้นทาง /uploads ตั้ง CSP: sandbox ของมันเองไว้แล้ว เบราว์เซอร์บังคับทั้งสองใบซ้อนกัน
  // อันไหนเข้มกว่าชนะ — ไฟล์แนบจึงยังถูกกักเหมือนเดิม
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ชื่อพัสดุ/รหัสเคสอยู่ใน path — อย่าให้มันติดไปกับ referer ตอนกดลิงก์ออกนอก
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  // E2E runs a second dev server (port 4517) alongside the dev server on 3000.
  // Give it a separate distDir so Next's single-instance dev lock doesn't trip.
  ...(process.env.E2E ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
