## Why

<!-- The problem this PR solves. 1-2 sentences. -->

## What

<!-- Key design decisions only. Do NOT list file-level changes — that's what the diff is for.
     BAD:  "`chat-service.ts`에서 vector/graph 호출 제거, supabase.rpc()로 대체"
     GOOD: "직접 호출을 outbox 패턴으로 전환하여 쓰기 일관성 보장" -->

## How to verify

<!-- Concrete scenarios a reviewer can run or check.
     BAD:  "[ ] 타입체크 통과 확인"
     GOOD: "pnpm dev → 문서 저장 → Qdrant/Neo4j 동기화 로그 확인" -->

## Notes

<!-- (Optional) Trade-offs, risks, follow-up work. Delete section if none. -->

## Checklist

- [ ] CLAUDE.md updated (if new convention or architecture change)
