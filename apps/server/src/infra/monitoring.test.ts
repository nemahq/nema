import { afterEach, describe, expect, it, vi } from "vitest";

const { initMock, onUnhandledRejectionIntegrationMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  onUnhandledRejectionIntegrationMock: vi.fn(),
}));
vi.mock("@sentry/node", () => ({
  init: initMock,
  onUnhandledRejectionIntegration: onUnhandledRejectionIntegrationMock,
}));

import { initMonitoring } from "@server/infra/monitoring";

const ORIGINAL_APP_ENV = process.env.APP_ENV;

afterEach(() => {
  if (ORIGINAL_APP_ENV === undefined) {
    delete process.env.APP_ENV;
  } else {
    process.env.APP_ENV = ORIGINAL_APP_ENV;
  }
  vi.clearAllMocks();
});

describe("initMonitoring", () => {
  it("APP_ENV=production이면 enabled: true로 켠다", () => {
    process.env.APP_ENV = "production";
    initMonitoring();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, environment: "production" }),
    );
  });

  it("APP_ENV=staging이면 enabled: false다 — 오타 하나로 알림이 조용히 꺼지는 걸 이 테스트가 막는다", () => {
    process.env.APP_ENV = "staging";
    initMonitoring();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("OnUnhandledRejection 기본 통합을 strict 모드로 교체한다 — 안 하면 처리되지 않은 거부가 서버를 안 죽이고 조용히 계속 돈다", () => {
    process.env.APP_ENV = "production";
    initMonitoring();

    const options = initMock.mock.calls[0]?.[0];
    const strictIntegration = { name: "OnUnhandledRejection", mode: "strict" };
    onUnhandledRejectionIntegrationMock.mockReturnValueOnce(strictIntegration);
    const httpIntegration = { name: "Http" };

    const replaced = options.integrations([
      { name: "OnUnhandledRejection" },
      httpIntegration,
    ]);

    expect(onUnhandledRejectionIntegrationMock).toHaveBeenCalledWith({
      mode: "strict",
    });
    expect(replaced).toEqual([strictIntegration, httpIntegration]);
  });
});
