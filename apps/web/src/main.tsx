import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { TooltipProvider } from "@nema-io/weave";

import { trpc, trpcClient } from "@web/lib/trpc";

import { router } from "./app/router";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const queryClient = new QueryClient();

createRoot(root).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
