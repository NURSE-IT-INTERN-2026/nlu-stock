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
