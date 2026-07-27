import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import {
  useReviewDraftDispatch,
  useReviewDraftReader,
  useReviewDraftWriter,
} from "@web/features/review/hooks/useDigestReviewQuery";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import type {
  ReviewDraft,
  ReviewDraftAction,
} from "@web/features/review/reviewDraft";
import { buildUpdateReviewPayload } from "@web/features/review/reviewSavePayload";
import {
  classifyReviewSaveError,
  type ReviewSaveStatus,
} from "@web/features/review/reviewSaveStatus";
import { useCurrentSpaceId } from "@web/hooks/useCurrentSpaceId";

// 자동 저장 디바운스 — 필드 버퍼(useBufferedValue의 COMMIT_DELAY_MS=400ms, 타이핑
// 멈춤→초안 반영)와는 별개 축이다. 초안이 바뀔 때마다(필드 커밋 하나하나 포함) 그
// 위에 한 번 더 디바운스를 얹어 "초안 반영→서버 저장"을 한 번의 요청으로 묶는다.
// 두 디바운스가 겹쳐 보이는 지연이 나지 않도록 필드 쪽보다 넉넉히 길게 둔다.
const AUTOSAVE_DEBOUNCE_MS = 1000;

interface ReviewAutosaveEntry {
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  savingPromise: Promise<void> | null;
}

// changesetNumber로 라우트 shell 전체가 key를 걸어(router.tsx) 다른 changeset을
// 거쳐 돌아오면 이 Provider도 새 인스턴스로 리마운트된다 — dirty·타이머·진행 중인
// 저장 promise를 컴포넌트 ref로만 들면, 언마운트 시점에 흘려보낸(fire-and-forget)
// flushPendingSave가 아직 응답을 못 받은 채로 새 인스턴스가 뜨는 순간 그 인스턴스는
// "아무것도 안 밀렸다"고 오판해 확정이 그 저장을 기다리지 않고 먼저 나갈 수 있다
// (편집 → 이탈 → 다른 changeset → 복귀 → 즉시 확정 경로에서 조용한 데이터 유실).
// 세션(탭) 동안 changeset별로 하나씩만 존재하면 되므로 모듈 레벨 Map으로 빼서, 같은
// key로 다시 마운트된 인스턴스도 이전 인스턴스가 이미 띄워둔 저장을 그대로 이어받는다.
// gcTime: Infinity로 쿼리 캐시도 이미 세션 내내 안 비우기로 한 것과 같은 트레이드오프.
const autosaveEntries = new Map<string, ReviewAutosaveEntry>();

function getAutosaveEntry(key: string): ReviewAutosaveEntry {
  let entry = autosaveEntries.get(key);
  if (!entry) {
    entry = { dirty: false, timer: null, savingPromise: null };
    autosaveEntries.set(key, entry);
  }
  return entry;
}

// 확정·버리기로 리뷰 자체가 끝나면(다른 changeset을 잠깐 거쳐가는 것과 달리 이
// key로는 다시 편집이 들어올 일이 없다) 엔트리를 지운다 — 안 지우면 이 Map이 세션
// 내내 changeset 수만큼 무한히 쌓인다. 방금 저장·확정이 성공한 직후에만 부르므로
// dirty·진행 중인 저장이 남아있을 수 없다.
export function clearAutosaveEntry(spaceId: string, changesetNumber: number) {
  autosaveEntries.delete(`${spaceId}:${changesetNumber}`);
}

interface ReviewDraftContextValue {
  dispatch: (action: ReviewDraftAction) => void;
  // 타이핑 중인 필드가 "아직 초안에 안 넘긴 값이 있다"고 알려두는 자리 — 초안을
  // 바꾸는 다른 조작이 끼어들기 직전에 여기 모인 값들을 먼저 넘긴다.
  registerPendingCommit: (commit: () => void) => () => void;
  // dispatch를 거치지 않고 밀린 커밋만 넘긴다 — 확정처럼 "지금 이 순간 초안이
  // 뭔 모습인가"를 다시 읽어야 하는 지점에서, 포커스 이탈 없이도(예: 버튼 클릭이
  // blur를 안 일으키는 브라우저) 최신 값을 캐시에 반영해두기 위해 쓴다.
  flushPendingCommits: () => void;
  // 필드(useDraftField)가 자기 로컬 버퍼의 dirty 여부를 알려주는 자리 — 마운트
  // 내내 등록돼 있는 registerPendingCommit과 달리, 실제로 안 넘긴 값이 있는 동안만
  // 참으로 보고된다(hasPendingEdits가 이 값으로 판정한다).
  reportFieldDirty: (token: object, dirty: boolean) => void;
  // 디바운스를 기다리지 않고 지금 상태를 바로 저장한다. 이미 저장 중이면 그 결과를
  // 기다리고, 그 사이 또 편집이 생겼으면 한 라운드 더 돈다(ensureSaved 참고) —
  // 호출 시점의 초안이 실제로 반영될 때까지 보장한다. beforeunload·확정 직전에 쓴다.
  flushPendingSave: () => Promise<void>;
  // 포커스 복귀 재조회가 "지금 덮어써도 안전한가"를 판정하는 자리 — 리렌더를
  // 유발하지 않는 순수 조회라 이벤트 핸들러 안에서 그때그때 부른다.
  hasPendingEdits: () => boolean;
}

const ReviewDraftContext = createContext<ReviewDraftContextValue | null>(null);

interface ReviewSaveStatusContextValue {
  saveStatus: ReviewSaveStatus;
}

const ReviewSaveStatusContext =
  createContext<ReviewSaveStatusContextValue | null>(null);

interface ReviewUndoRedoContextValue {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ReviewUndoRedoContext = createContext<ReviewUndoRedoContextValue | null>(
  null,
);

interface ReviewDraftProviderProps {
  children: ReactNode;
}

export function ReviewDraftProvider({ children }: ReviewDraftProviderProps) {
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const dispatchToDraft = useReviewDraftDispatch(spaceId, changesetNumber);
  const updateReview = useUpdateReview(spaceId, changesetNumber);
  const readDraft = useReviewDraftReader(spaceId, changesetNumber);
  const writeDraft = useReviewDraftWriter(spaceId, changesetNumber);
  // 이 리뷰(changeset) 하나에 묶인 자동 저장 상태 — Map에서 매 렌더 다시 조회해도
  // 같은 key인 동안은 항상 같은 객체를 돌려받는다(리마운트돼도 마찬가지).
  const autosaveEntry = getAutosaveEntry(`${spaceId}:${changesetNumber}`);

  // updateReview(useMutation 반환값)는 isPending이 바뀔 때마다 새 객체라, 이걸 그대로
  // useCallback 의존성에 넣으면 저장 한 번마다 안정적이어야 할 콜백들(dispatch 등)의
  // 정체성이 흔들려 그걸 구독하는 모든 필드 컴포넌트가 편집마다 다시 그려진다 — 최신
  // 값은 ref로만 읽는다(useBufferedValue의 latestRef와 같은 결).
  const updateReviewRef = useRef(updateReview);
  useEffect(function syncLatestUpdateReview() {
    updateReviewRef.current = updateReview;
  });

  const pendingCommitsRef = useRef(new Set<() => void>());
  const flushingRef = useRef(false);
  const dirtyFieldsRef = useRef(new Set<object>());

  const registerPendingCommit = useCallback((commit: () => void) => {
    const pendingCommits = pendingCommitsRef.current;
    pendingCommits.add(commit);
    return () => {
      pendingCommits.delete(commit);
    };
  }, []);

  const reportFieldDirty = useCallback((token: object, dirty: boolean) => {
    if (dirty) {
      dirtyFieldsRef.current.add(token);
    } else {
      dirtyFieldsRef.current.delete(token);
    }
  }, []);

  // 각 commit이 다시 dispatch를 부르고 dispatch가 또 여길 부른다 — 재진입을 막지
  // 않으면 필드 하나를 넘길 때마다 전체 플러시가 처음부터 다시 돈다.
  const flushPendingCommits = useCallback(() => {
    if (flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    try {
      for (const commit of [...pendingCommitsRef.current]) {
        commit();
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  // ---- 자동 저장 ----
  const [saveStatus, setSaveStatus] = useState<ReviewSaveStatus>({
    kind: "clean",
  });

  // autosaveEntry.dirty가 참인 동안 반복한다 — 전송 중에 또 편집이 들어오면(다시
  // 참이 됨) 그 편집은 이번 요청에 안 실렸으니 한 라운드 더 돈다. expectedVersion은
  // 매 라운드 readDraft() 시점의 캐시 값을 쓰므로, 앞 라운드가 성공해 draftVersion이
  // 갱신된 뒤라면 다음 라운드는 그 새 버전으로 자연히 이어진다.
  const runSaveLoop = useCallback(async () => {
    while (autosaveEntry.dirty) {
      autosaveEntry.dirty = false;
      const draft = readDraft();
      if (!draft) {
        return;
      }
      try {
        await updateReviewRef.current.mutateAsync(
          buildUpdateReviewPayload(draft),
        );
        setSaveStatus({ kind: "clean" });
      } catch (error) {
        // 실패한 변경은 여전히 미저장 상태로 남겨, 다음 편집이나 flushPendingSave가
        // 다시 시도하게 한다 — 조용히 유실시키지 않는다.
        autosaveEntry.dirty = true;
        setSaveStatus(classifyReviewSaveError(error));
        throw error;
      }
    }
  }, [autosaveEntry, readDraft]);

  // 동시에 두 저장 요청을 띄우면 뒤엣것의 expectedVersion이 앞엣것 성공 후엔 낡은
  // 값이 되어 스스로를 버전 충돌로 오인시킨다 — 진행 중인 라운드가 있으면 그 promise를
  // 그대로 돌려줘 새 요청을 얹지 않는다. 이 라운드가 리마운트 전 인스턴스가 띄운
  // 것이어도(같은 key라 autosaveEntry를 공유) 여기서 그대로 이어받아 기다린다.
  const ensureSaved = useCallback((): Promise<void> => {
    if (autosaveEntry.savingPromise) {
      return autosaveEntry.savingPromise;
    }
    if (!autosaveEntry.dirty) {
      return Promise.resolve();
    }
    const promise = runSaveLoop().finally(() => {
      autosaveEntry.savingPromise = null;
    });
    autosaveEntry.savingPromise = promise;
    return promise;
  }, [autosaveEntry, runSaveLoop]);

  const scheduleAutosave = useCallback(() => {
    autosaveEntry.dirty = true;
    if (autosaveEntry.timer) {
      clearTimeout(autosaveEntry.timer);
    }
    autosaveEntry.timer = setTimeout(() => {
      autosaveEntry.timer = null;
      // 타이머 콜백은 아무도 기다리지 않는다 — 실패는 이미 saveStatus로 노출되니
      // 여기서는 unhandled rejection만 막는다.
      ensureSaved().catch(() => {});
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [autosaveEntry, ensureSaved]);

  const flushPendingSave = useCallback((): Promise<void> => {
    if (autosaveEntry.timer) {
      clearTimeout(autosaveEntry.timer);
      autosaveEntry.timer = null;
    }
    return ensureSaved();
  }, [autosaveEntry, ensureSaved]);

  const hasPendingEdits = useCallback(
    () =>
      dirtyFieldsRef.current.size > 0 ||
      autosaveEntry.dirty ||
      autosaveEntry.timer !== null ||
      updateReviewRef.current.isPending,
    [autosaveEntry],
  );

  // ---- 실행취소 / 다시 실행 ----
  // 세션 스코프 스냅샷 스택 — 새로고침하면 사라진다(review-flow.md "새로고침 후 최신
  // 저장 상태 유지"). 액션 역연산표 대신 캐시 값 자체를 통째로 넣었다 빼는 방식이라,
  // 예외 없이 모든 액션 타입이 자동으로 실행취소 대상이 된다.
  const [undoStack, setUndoStack] = useState<ReviewDraft[]>([]);
  const [redoStack, setRedoStack] = useState<ReviewDraft[]>([]);

  const dispatch = useCallback(
    (action: ReviewDraftAction) => {
      flushPendingCommits();
      const before = readDraft();
      if (before) {
        setUndoStack((stack) => [...stack, before]);
        setRedoStack([]); // 새 편집이 일어나면 다시 실행 기록은 의미를 잃는다(표준 관례).
      }
      scheduleAutosave();
      dispatchToDraft(action);
    },
    [flushPendingCommits, readDraft, scheduleAutosave, dispatchToDraft],
  );

  // undo/redo는 StrictMode에서 두 번 불릴 수 있는 setState updater 안에 writeDraft
  // 같은 부수효과를 두지 않는다 — 두 번째 호출이 이미 한 번 덮어쓴 캐시를 "현재값"으로
  // 잘못 읽어 redo/undo 스택에 엉뚱한 스냅샷을 쌓는 사고를 구조적으로 막기 위해, 스택
  // 조회·부수효과는 클로저 값으로 여기서 한 번만 하고 setState엔 순수한 배열 계산만 넘긴다.
  const undo = useCallback(() => {
    if (undoStack.length === 0) {
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    const current = readDraft();
    writeDraft(previous);
    scheduleAutosave();
    setUndoStack((stack) => stack.slice(0, -1));
    if (current) {
      setRedoStack((stack) => [...stack, current]);
    }
  }, [undoStack, readDraft, writeDraft, scheduleAutosave]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      return;
    }
    const next = redoStack[redoStack.length - 1];
    const current = readDraft();
    writeDraft(next);
    scheduleAutosave();
    setRedoStack((stack) => stack.slice(0, -1));
    if (current) {
      setUndoStack((stack) => [...stack, current]);
    }
  }, [redoStack, readDraft, writeDraft, scheduleAutosave]);

  useEffect(
    function flushDraftOnUnload() {
      function handleBeforeUnload() {
        flushPendingCommits();
        // 페이지를 떠나는 순간엔 디바운스를 기다릴 여유가 없다 — 완료를 보장할 수는
        // 없지만(unload 중 네트워크 요청은 브라우저가 취소할 수 있다) 최소한 시도는 한다.
        flushPendingSave().catch(() => {});
      }
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    },
    [flushPendingCommits, flushPendingSave],
  );

  useEffect(
    function flushDraftOnUnmount() {
      return function flushOnUnmount() {
        // SPA 라우팅으로 화면을 벗어나는 경우 beforeunload는 뜨지 않는다 — 아직 디바운스
        // 대기 중인 편집이 있으면 언마운트 시점에 마지막으로 한 번 더 시도한다(타이머
        // 취소는 flushPendingSave가 이미 한다). 같은 changeset으로 되돌아오면 새
        // 인스턴스가 이 promise를(autosaveEntry가 공유되므로) 그대로 이어받는다.
        flushPendingSave().catch(() => {});
      };
    },
    [flushPendingSave],
  );

  const draftContext = useMemo(
    () => ({
      dispatch,
      registerPendingCommit,
      flushPendingCommits,
      reportFieldDirty,
      flushPendingSave,
      hasPendingEdits,
    }),
    [
      dispatch,
      registerPendingCommit,
      flushPendingCommits,
      reportFieldDirty,
      flushPendingSave,
      hasPendingEdits,
    ],
  );
  const saveStatusContext = useMemo(() => ({ saveStatus }), [saveStatus]);
  const undoRedoContext = useMemo(
    () => ({
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    }),
    [undo, redo, undoStack.length, redoStack.length],
  );

  return (
    <ReviewDraftContext value={draftContext}>
      <ReviewSaveStatusContext value={saveStatusContext}>
        <ReviewUndoRedoContext value={undoRedoContext}>
          {children}
        </ReviewUndoRedoContext>
      </ReviewSaveStatusContext>
    </ReviewDraftContext>
  );
}

export function useReviewDraftContext(): ReviewDraftContextValue {
  const context = useContext(ReviewDraftContext);
  if (!context) {
    throw new Error(
      "useReviewDraftContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}

export function useReviewSaveStatusContext(): ReviewSaveStatusContextValue {
  const context = useContext(ReviewSaveStatusContext);
  if (!context) {
    throw new Error(
      "useReviewSaveStatusContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}

export function useReviewUndoRedoContext(): ReviewUndoRedoContextValue {
  const context = useContext(ReviewUndoRedoContext);
  if (!context) {
    throw new Error(
      "useReviewUndoRedoContext must be used within ReviewDraftProvider.",
    );
  }
  return context;
}
