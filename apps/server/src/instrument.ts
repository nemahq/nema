// 다른 모듈보다 먼저 로드돼야 계측이 걸린다 — start 스크립트가 --import로
// index.ts보다 먼저 이 파일을 불러온다(package.json 참고).
import { initMonitoring } from "./infra/monitoring";

initMonitoring();
