import { useState } from "react";

import { ChatInput } from "@web/components/ui/ChatInput";
import { MODE_CONFIG, useStartSession } from "@web/features/session";
import { useTranslation } from "@web/lib/tolgee";

const REMEMBER_MODE = MODE_CONFIG["remember"];

export function EmptyState() {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const { startSession, isPending } = useStartSession();

  function handleSubmit(content: string) {
    startSession(content, "remember");
    setInputValue("");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-card">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-6">
        <div className="text-center">
          <p className="text-base text-fg-primary">
            {t("memory.empty_heading")}
          </p>
          <p className="mt-1 text-sm text-fg-secondary">
            {t("memory.empty_subheading")}
          </p>
        </div>
        <div className="w-full">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={t(REMEMBER_MODE.placeholderKey)}
            submitDisabled={isPending}
            onSubmit={handleSubmit}
            submitIcon={REMEMBER_MODE.icon}
            autoFocus
          />
        </div>
      </div>
    </main>
  );
}
