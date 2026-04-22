import { useEffect } from "react";

import { type MemoryTab, setStorage } from "@web/utils/localStorage";

export function useRememberMemoryTab(tab: MemoryTab) {
  useEffect(
    function rememberMemoryTab() {
      setStorage("memoryLastTab", tab);
    },
    [tab],
  );
}
