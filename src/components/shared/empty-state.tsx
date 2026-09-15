import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** บอกว่าทำอะไรต่อได้ หรือทำไมถึงว่าง — ละได้ถ้าหัวข้อพูดครบแล้ว */
  description?: string;
  /** ปุ่มพาไปทำสิ่งที่จะทำให้ที่ว่างนี้มีของ */
  action?: React.ReactNode;
  className?: string;
};

/**
 * ที่ว่างหน้าตาเดียวของทั้งระบบ: หัวข้อ → คำอธิบาย → ปุ่ม
 *
 * ไม่มีไอคอน โดยตั้งใจ — ที่ว่างมีอยู่ทุกตาราง ทุกแท็บ ทุก dialog ไอคอนประจำที่ว่างจึงกลายเป็น
 * สัญลักษณ์ที่เห็นบ่อยที่สุดในระบบทั้งที่ไม่ได้บอกอะไรเกินกว่าข้อความข้างใต้มัน
 */
export function EmptyState({ title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-12 text-center", className)}>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
