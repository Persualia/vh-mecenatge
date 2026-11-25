"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";

// The board depends on today's date, so it only renders on the client.
const BoardScreen = dynamic(() => import("./board-screen").then((m) => m.BoardScreen), { ssr: false });

export function BoardLoader() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <BoardScreen />
    </QueryClientProvider>
  );
}
