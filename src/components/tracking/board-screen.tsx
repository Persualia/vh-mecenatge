"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrackingBoard } from "@/tracking/application/load-tracking-board";
import { Board } from "./board";

const today = () => new Date().toLocaleDateString("sv-SE");

async function fetchBoard(fresh: boolean): Promise<TrackingBoard> {
  const response = await fetch(`/api/board?today=${today()}${fresh ? "&fresh=1" : ""}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No s’han pogut llegir les dades.");
  return body;
}

export function BoardScreen() {
  const [fresh, setFresh] = useState(false);
  const query = useQuery({ queryKey: ["board", today(), fresh], queryFn: () => fetchBoard(fresh) });

  if (query.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <Skeleton className="h-14 w-72" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <p className="text-sm text-muted-foreground">Llegint un any de dades diàries de Meta Ads…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>No s’han pogut llegir les dades</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Board
      board={query.data}
      refreshing={query.isFetching}
      onRefresh={() => {
        setFresh(true);
        query.refetch();
      }}
    />
  );
}
