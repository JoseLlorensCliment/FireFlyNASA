import { useCallback, useEffect, useState } from "react";

const KEY = "fi.recentlyViewed";
export interface RecentItem { accession: string; label: string; at: number }

function read(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>(read);
  useEffect(() => {
    const on = () => setItems(read());
    window.addEventListener("fi-recent", on);
    return () => window.removeEventListener("fi-recent", on);
  }, []);
  const push = useCallback((accession: string, label: string) => {
    const next = [{ accession, label, at: Date.now() }, ...read().filter((i) => i.accession !== accession)].slice(0, 6);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: feature degrades gracefully */
    }
    window.dispatchEvent(new Event("fi-recent"));
  }, []);
  return { items, push };
}
