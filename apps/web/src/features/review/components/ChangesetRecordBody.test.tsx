import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type {
  ChangesetConfidentRelationSnapshot,
  ChangesetDetail,
  DigestDetailSnapshot,
  RelationEndpointDetailSnapshot,
} from "@web/features/review/types";

// 이 스위트는 kind별 분기·keeper/duplicate 방향이 안 뒤바뀌는지만 검증한다 —
// 실제 번역·라우팅은 대상이 아니라서 최소 스텁으로 대체한다.
vi.mock("@web/lib/tolgee", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@web/components/ui/RelativeTime", () => ({
  RelativeTime: ({ dateTime }: { dateTime: string }) => <time>{dateTime}</time>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
  linkOptions: (options: unknown) => options,
  useParams: () => ({ spacePublicId: "space-1" }),
}));

const { ChangesetRecordBody } = await import("./ChangesetRecordBody");

afterEach(() => {
  cleanup();
});

function digestSnapshot(
  overrides: Partial<DigestDetailSnapshot> = {},
): DigestDetailSnapshot {
  return {
    id: "digest-1",
    title: "제목",
    description: "설명",
    body: { type: "decision", situation: "상황" },
    topics: [],
    tags: [],
    referenceIds: [],
    externalUrls: [],
    authorId: null,
    authorName: null,
    status: "active",
    createdAt: "2026-07-01T00:00:00Z",
    sourceId: "source-1",
    ...overrides,
  };
}

function relationEndpoint(
  overrides: Partial<RelationEndpointDetailSnapshot> = {},
): RelationEndpointDetailSnapshot {
  return {
    statementId: "statement-1",
    statementContent: "문장",
    statementStatus: "active",
    sourceField: null,
    sourceFieldIndex: null,
    digest: digestSnapshot(),
    ...overrides,
  };
}

function confidentRelation(
  overrides: Partial<ChangesetConfidentRelationSnapshot> = {},
): ChangesetConfidentRelationSnapshot {
  return {
    relationType: "supports",
    from: relationEndpoint(),
    to: relationEndpoint({ statementId: "statement-2" }),
    ...overrides,
  };
}

function changesetDetail(
  body: ChangesetDetail["body"],
  overrides: Partial<ChangesetDetail> = {},
): ChangesetDetail {
  return {
    id: "cs-1",
    number: 1,
    spaceId: "space-1",
    type: "ingestion",
    status: "closed",
    outcome: "applied",
    title: "제목",
    authorId: null,
    authorName: null,
    closedById: null,
    closedByName: null,
    sourceId: null,
    revertsId: null,
    revertsNumber: null,
    invalidatedById: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    body,
    ...overrides,
  };
}

describe("ChangesetRecordBody", () => {
  it("ingestion_applied — 생성된 digest들을 전부 카드로 나열한다", () => {
    const detail = changesetDetail({
      kind: "ingestion_applied",
      digests: [
        digestSnapshot({ id: "d1", title: "첫 번째" }),
        digestSnapshot({ id: "d2", title: "두 번째" }),
      ],
    });
    const { getByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(getByText("첫 번째")).toBeTruthy();
    expect(getByText("두 번째")).toBeTruthy();
  });

  it.each([
    "ingestion_discarded",
    "relation_conflict_discarded",
    "relation_duplicate_discarded",
    "relation_confident_discarded",
  ] as const)(
    "%s — 본문에 아무것도 그리지 않는다(헤더 배지가 이미 설명함)",
    (kind) => {
      const detail = changesetDetail({ kind });
      const { container } = render(
        <ChangesetRecordBody changesetDetail={detail} />,
      );
      expect(container.innerHTML).toBe("");
    },
  );

  it("relation_conflict_applied — 진 쪽(archived)에만 대체됨 표시가 붙는다", () => {
    const detail = changesetDetail({
      kind: "relation_conflict_applied",
      from: relationEndpoint({ digest: digestSnapshot({ title: "A" }) }),
      to: relationEndpoint({
        digest: digestSnapshot({ title: "B" }),
        statementStatus: "archived",
      }),
    });
    const { container, getByText, queryAllByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(getByText("A")).toBeTruthy();
    expect(getByText("B")).toBeTruthy();
    expect(
      queryAllByText("review.digest_readonly_archived_badge"),
    ).toHaveLength(1);
    expect(container.querySelector(".line-through")?.textContent).toBe("B");
  });

  it("relation_duplicate_applied — 병합은 keeper·duplicate 둘 다 archive한다(resolve_duplicate_relation이 옛 Digest 둘 다 archive) — 순서(keeper가 first)는 그대로 유지된다", () => {
    const detail = changesetDetail({
      kind: "relation_duplicate_applied",
      keeper: relationEndpoint({
        digest: digestSnapshot({ title: "Keeper" }),
        statementStatus: "archived",
      }),
      duplicate: relationEndpoint({
        digest: digestSnapshot({ title: "Duplicate" }),
        statementStatus: "archived",
      }),
    });
    const { container, queryAllByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(
      queryAllByText("review.digest_readonly_archived_badge"),
    ).toHaveLength(2);
    const struckThrough = Array.from(
      container.querySelectorAll(".line-through"),
    ).map((el) => el.textContent);
    expect(struckThrough).toEqual(["Keeper", "Duplicate"]);
  });

  it("relation_confident_applied(supports 1건) — 둘 다 active면 대체됨 표시가 없고, relationType 캡션이 뜬다", () => {
    const detail = changesetDetail({
      kind: "relation_confident_applied",
      relations: [
        confidentRelation({
          relationType: "supports",
          from: relationEndpoint({ digest: digestSnapshot({ title: "A" }) }),
          to: relationEndpoint({ digest: digestSnapshot({ title: "B" }) }),
        }),
      ],
    });
    const { container, getByText, queryByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(container.querySelector(".line-through")).toBeNull();
    expect(queryByText("review.digest_readonly_archived_badge")).toBeNull();
    expect(getByText("review.relation_type_supports")).toBeTruthy();
  });

  it("relation_confident_applied(replaces 1건) — 대체된 to 쪽에 대체됨 표시가 붙는다", () => {
    const detail = changesetDetail({
      kind: "relation_confident_applied",
      relations: [
        confidentRelation({
          relationType: "replaces",
          from: relationEndpoint({
            digest: digestSnapshot({ title: "새 진술" }),
          }),
          to: relationEndpoint({
            statementId: "statement-2",
            digest: digestSnapshot({ title: "지난 진술" }),
            statementStatus: "archived",
          }),
        }),
      ],
    });
    const { container } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(container.querySelector(".line-through")?.textContent).toBe(
      "지난 진술",
    );
  });

  it("relation_confident_applied(배치 2건) — 하나만 그리고 나머지를 누락하지 않는다", () => {
    const detail = changesetDetail({
      kind: "relation_confident_applied",
      relations: [
        confidentRelation({
          relationType: "supports",
          from: relationEndpoint({
            statementId: "s1",
            digest: digestSnapshot({ title: "첫 관계 A" }),
          }),
          to: relationEndpoint({
            statementId: "s2",
            digest: digestSnapshot({ title: "첫 관계 B" }),
          }),
        }),
        confidentRelation({
          relationType: "resolves",
          from: relationEndpoint({
            statementId: "s3",
            digest: digestSnapshot({ title: "둘째 관계 A" }),
          }),
          to: relationEndpoint({
            statementId: "s4",
            digest: digestSnapshot({ title: "둘째 관계 B" }),
          }),
        }),
      ],
    });
    const { getByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(getByText("첫 관계 A")).toBeTruthy();
    expect(getByText("첫 관계 B")).toBeTruthy();
    expect(getByText("둘째 관계 A")).toBeTruthy();
    expect(getByText("둘째 관계 B")).toBeTruthy();
    expect(getByText("review.relation_type_supports")).toBeTruthy();
    expect(getByText("review.relation_type_resolves")).toBeTruthy();
  });

  it("revert — revertsNumber로 가는 링크를 보여준다", () => {
    const detail = changesetDetail({ kind: "revert", revertsNumber: 12 });
    const { getByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(getByText("#12")).toBeTruthy();
  });

  it("unsupported — 일반 안내 문구를 보여준다", () => {
    const detail = changesetDetail({ kind: "unsupported" });
    const { getByText } = render(
      <ChangesetRecordBody changesetDetail={detail} />,
    );
    expect(getByText("review.detail_generic_body")).toBeTruthy();
  });
});
