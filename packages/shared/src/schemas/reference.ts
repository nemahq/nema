import { z } from "zod";

// DB enum reference_type의 SSOT (07-modeling Reference).
// organization은 법인·팀 같은 행위주체, product는 그 주체가 만든 제품·서비스 자체 —
// 판단 대상이 달라 별개 타입이다(예: 비바리퍼블리카 vs 토스).
export const REFERENCE_TYPES = [
  "person",
  "organization",
  "project",
  "product",
  "term",
] as const;

export const ReferenceTypeSchema = z.enum(REFERENCE_TYPES);
export type ReferenceType = z.infer<typeof ReferenceTypeSchema>;

export const REFERENCE_TITLE_MAX_LENGTH = 200;
// body는 "다듬어지며 유지되는 내용"이라 상한을 원본(10만 자)보다 훨씬 작게 —
// 레퍼런스는 정의·설명이지 문서 보관함이 아니다. 다만 프로필·스펙 붙여넣기 같은
// 정상 사용을 물지 않도록 넉넉히 잡는다(입력 거부가 가장 나쁜 경험).
export const REFERENCE_BODY_MAX_LENGTH = 20_000;
// 대표 링크(홈페이지·LinkedIn·repo·docs) — 대상을 식별하는 소수의 링크지
// Digest가 논하는 링크 더미가 아니라, Digest 상한보다 작게 잡는다.
export const REFERENCE_EXTERNAL_URLS_MAX = 10;
