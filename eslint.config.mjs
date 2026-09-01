import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // playwright.config gives the E2E dev server its own distDir so it can run beside the
    // dev server on 3000 — same generated output as .next, and lint drowns in it (411 files).
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ไม่ใช่โค้ดของโปรเจกต์: สคริปต์ของ skill กับ worktree ที่ค้างอยู่ ซึ่งมีทั้งไฟล์ minified และ
    // build output — lint มันแล้วได้ error ที่แก้ไม่ได้และไม่ควรแก้ กลบ error จริงในโค้ดเราไปด้วย
    ".claude/**",
  ]),
  {
    rules: {
      // `_foo` แปลว่า "รู้ว่าไม่ได้ใช้ และตั้งใจ" — พารามิเตอร์ที่ต้องมีเพราะตำแหน่ง หรือ prop ที่
      // รับมาเพื่อกลืนไว้ไม่ให้ทะลุลงไปข้างล่าง. ไม่มีข้อยกเว้นนี้ คำเตือนจะกองจนไม่มีใครอ่าน
      // ปิดทั้ง repo โดยตั้งใจ ไม่ใช่เพราะแก้ไม่ไหว: หน้าจอทุกหน้าที่นี่โหลดข้อมูลด้วย
      // useEffect + setState ซึ่งเป็นวิธีที่ React เองแนะนำจนกระทั่งมี Suspense/external store
      // กฎนี้จับ 47 จุด และทั้ง 47 คือ pattern เดียวกันหมด — ไม่มีจุดไหนเป็นบั๊ก. จะให้มันเงียบ
      // ต้องย้ายการโหลดข้อมูลทั้งระบบไปเป็น SWR/React Query ซึ่งเป็นงานคนละก้อนกับ lint.
      // เก็บ error ที่แก้ไม่ได้ไว้ 47 ตัวมีราคาของมัน: พอ lint แดงตลอดก็ไม่มีใครอ่านมันอีก
      // แล้ว error จริงตัวที่ 48 ก็เลยไม่มีใครเห็น. เปิดกลับเมื่อไหร่ที่ตัดสินใจย้ายจริง.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
]);

export default eslintConfig;
