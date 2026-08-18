// index.ts의 첫 import여야 한다 — Railway 커스텀 시작 명령이 `node dist/index.js`로
// 고정돼 있어(package.json의 start를 안 탄다) --import 프리로드에 기댈 수 없다.
import { initMonitoring } from "./infra/monitoring";

initMonitoring();
