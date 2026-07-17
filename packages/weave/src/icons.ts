export * from "lucide-react";
// apps/web는 LucideIcon을 직접 import하지 못하게 막혀있다(eslint.config.js) —
// 이 별칭을 프로젝트 표준 아이콘 컴포넌트 타입으로 쓴다.
export type { LucideIcon as IconComponent } from "lucide-react";
