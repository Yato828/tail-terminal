import { loadCandleResult } from "../../lib/axiom";
import { recoverHistoryMarket } from "./historyRecovery";
import { rankMarkets } from "./marketRanking";
import { tailBackendEnabled } from "../../services/backend/config";
import { subscribeBackendSnapshot } from "../../services/backend/stream";
import { coinFromPair } from "../../services/backend/market";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../preferences/preferences";
import {
  getMarkets,
  getNewPairs,
  searchTokens,
  getToken,
  getNetwork,
} from "../../services/adapters/tail";
import type { AxiomCoin } from "../../lib/axiom";
import { WSOL } from "../../lib/const";
import { errorMessage, readLocal, saveLocal } from "../../lib/validation";
import { readTerminalLink } from "../../lib/siteLink";
import { mascot } from "../../mascot/events";
export function useTerminalData(activeLayout: string) {
  const { preferences } = usePreferences();
  const input = useRef<HTMLInputElement>(null);
  const [tokenError, setTokenError] = useState("");
  const [marketRecoveryNote, setMarketRecoveryNote] = useState("");
  const recoveryAttempts = useRef(new Set<string>()),
    selectionVersion = useRef(0);
  useEffect(
    () => () => {
      selectionVersion.current++;
    },
    [],
  );
  const [markets, setMarkets] = useState<AxiomCoin[]>([]),
    [newPairs, setNewPairs] = useState<AxiomCoin[]>([]),
    [coin, setCoin] = useState<AxiomCoin | null>(null);
  const [feedError, setFeedError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [at, setAt] = useState(0);
  const [newPairError, setNewPairError] = useState("");
  const [newPairLoading, setNewPairLoading] = useState(false);
  const [network, setNetwork] = useState<{
      tps: number;
      slot: number;
      at: number;
    } | null>(null),
    [networkError, setNetworkError] = useState("");
  const [query, setQuery] = useState(""),
    [hits, setHits] = useState<AxiomCoin[]>([]),
    [searching, setSearching] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [searchError, setSearchError] = useState(""),
    [hitIndex, setHitIndex] = useState(0);
  const [history, setHistory] = useState<string[]>(() =>
    readLocal(
      "tail.search.v1",
      (r) =>
        Array.isArray(r)
          ? r
              .filter((v) => typeof v === "string" && v.length <= 120)
              .slice(0, 8)
          : [],
      [],
    ),
  );
  const [listMode, setListMode] = useState("Trending"),
    [timeframe, setTimeframe] = useState<"5m" | "1h" | "24h">("24h");
  useEffect(()=>{const clear=()=>setHistory([]);window.addEventListener('part:clear-data',clear);return()=>window.removeEventListener('part:clear-data',clear);},[]);
  useEffect(() => {
    if (activeLayout === "New Launches") setListMode("New Pairs");
  }, [activeLayout]);
  const select = (next: AxiomCoin) => {
    selectionVersion.current++;
    setMarketRecoveryNote("");
    setCoin(next);
    setSearchOpen(false);
    setQuery("");
    setTokenError("");
    const url = new URL(location.href);
    url.searchParams.set("mint", next.address);
    url.searchParams.set("pool", next.pairAddress);
    historyReplace(url);
  };
  function historyReplace(url: URL) {
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function run() {
      try {
        const rows = await getMarkets();
        if (!stopped) {
          setMarkets(rows);
          setAt(Date.now());
          setFeedError("");
        }
      } catch (e) {
        if (!stopped) setFeedError(errorMessage(e));
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(run, 60000);
        }
      }
    }
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [retry]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const data = await getNetwork();
        if (!stopped) {
          setNetwork({ ...data, at: Date.now() });
          setNetworkError("");
        }
      } catch (e) {
        if (!stopped) setNetworkError(errorMessage(e));
      } finally {
        if (!stopped) timer = setTimeout(run, 30000);
      }
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (listMode !== "New Pairs" && activeLayout !== "New Launches") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setNewPairLoading(true);
    const run = async () => {
      try {
        const rows = await getNewPairs();
        if (!stopped) {
          setNewPairs(rows);
          setNewPairError("");
        }
      } catch (e) {
        if (!stopped) setNewPairError(errorMessage(e));
      } finally {
        if (!stopped) {
          setNewPairLoading(false);
          timer = setTimeout(run, 60000);
        }
      }
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [listMode, activeLayout, retry]);
  useEffect(() => {
    const mint = readTerminalLink(location.search).mint;
    if (!mint) return;
    let stopped = false;
    const requestId = mascot.begin("searching", "linked-token");
    searchTokens(mint)
      .then((rows) => {
        if (!stopped) {
          const pool = new URLSearchParams(location.search).get("pool");
          const exact =
            rows.find((c) => c.address === mint && c.pairAddress === pool) ??
            rows.find((c) => c.address === mint);
          if (exact) select(exact);
          else setTokenError("No Solana market found for this mint.");
          mascot.end(requestId, exact ? "idle" : "error");
        }
      })
      .catch((e) => {
        if (!stopped) {
          setTokenError(errorMessage(e));
          mascot.end(requestId, "error");
        }
      });
    return () => {
      stopped = true;
      mascot.end(requestId, "cancel");
    };
  }, []);
  useEffect(() => {
    if (!coin) return;
    let stopped = false;
    const requestId = mascot.begin("analyzing", "token");
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const next = await getToken(coin);
        if (!stopped) {
          setCoin(next);
          setTokenError("");
          mascot.end(requestId, "idle");
        }
      } catch (e) {
        if (!stopped) {
          setTokenError(`Stale token snapshot · ${errorMessage(e)}`);
          mascot.end(requestId, "error");
        }
      } finally {
        if (!stopped) {
          if (preferences.liveUpdates)
            timer = setTimeout(
              run,
              tailBackendEnabled() ? 60000 : preferences.refreshSeconds * 1000,
            );
        }
      }
    };
    void run();
    let unsubscribe: (() => void) | undefined;
    const subscribe = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (tailBackendEnabled() && preferences.liveUpdates && !document.hidden)
        unsubscribe = subscribeBackendSnapshot(coin.address, {
          snapshot: (r) => {
            if (stopped) return;
            const next =
              r.token?.pairAddress === coin.pairAddress
                ? coinFromPair(r.token, {
                    ...r,
                    source: `${r.source} · polling snapshot via SSE`,
                  })
                : null;
            if (next) {
              setCoin(next);
              setTokenError("");
            }
          },
          error: (message) => {
            if (!stopped) setTokenError(`Stale polling snapshot · ${message}`);
          },
        });
    };
    subscribe();
    document.addEventListener("visibilitychange", subscribe);
    return () => {
      unsubscribe?.();
      document.removeEventListener("visibilitychange", subscribe);
      stopped = true;
      clearTimeout(timer);
      mascot.end(requestId, "cancel");
    };
  }, [
    coin?.pairAddress,
    coin?.address,
    preferences.liveUpdates,
    preferences.refreshSeconds,
  ]);
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSearching(false);
      return;
    }
    let stopped = false;
    setSearching(true);
    setSearchError("");
    setHits([]);
    let requestId: string | null = null;
    const timer = setTimeout(() => {
      requestId = mascot.begin("searching", "search");
      searchTokens(query.trim())
        .then((rows) => {
          if (!stopped) {
            setHits(rows);
            setHitIndex(0);
            setHistory((h) => {
              const next = [
                query.trim(),
                ...h.filter((q) => q !== query.trim()),
              ].slice(0, 8);
              saveLocal("tail.search.v1", next);
              return next;
            });
            mascot.end(requestId, "idle");
          }
        })
        .catch((e) => {
          if (!stopped) {
            setSearchError(errorMessage(e));
            mascot.end(requestId, "error");
          }
        })
        .finally(() => {
          if (!stopped) {
            setSearching(false);
          }
        });
    }, 350);
    return () => {
      stopped = true;
      clearTimeout(timer);
      mascot.end(requestId, "cancel");
    };
  }, [query]);
  const recoverMarket = async (interval: string, code?: string) => {
    if (
      !coin ||
      !tailBackendEnabled() ||
      code === "HISTORY_PLAN_REQUIRED" ||
      code === "HISTORY_WINDOW" ||
      !["1h", "4h", "1d"].includes(interval)
    )
      return;
    const key = `${coin.address}:${interval}`;
    if (recoveryAttempts.current.has(key)) return;
    recoveryAttempts.current.add(key);
    if (recoveryAttempts.current.size > 30)
      recoveryAttempts.current.delete(
        recoveryAttempts.current.values().next().value!,
      );
    const version = selectionVersion.current;
    setMarketRecoveryNote(
      "Candle source unavailable for this pool. Checking other markets for the same token…",
    );
    try {
      const candidates = await searchTokens(coin.address);
      const next = await recoverHistoryMarket(
        coin,
        candidates,
        async (candidate) => {
          if (version !== selectionVersion.current)
            throw new Error("Selection changed");
          return loadCandleResult(
            candidate.pairAddress,
            interval,
            candidate.address,
          );
        },
      );
      if (version !== selectionVersion.current) return;
      if (next) {
        select(next);
        setMarketRecoveryNote(
          `History source switched to ${next.dex} pool ${next.pairAddress}. Selected token is unchanged.`,
        );
      } else
        setMarketRecoveryNote(
          "No covered alternative pool was found in this bounded check. Selected mint and source pool have not been substituted.",
        );
    } catch {
      if (version === selectionVersion.current)
        setMarketRecoveryNote(
          "Alternative market lookup unavailable. Retry the source or choose another token.",
        );
    }
  };
  const rows = rankMarkets(
    listMode === "New Pairs" ? newPairs : markets,
    listMode,
    timeframe,
  );
  const sol = markets.find((c) => c.address === WSOL);
  return {
    markets,
    coin,
    feedError: listMode === "New Pairs" ? newPairError : feedError,
    marketError: feedError,
    loading: listMode === "New Pairs" ? newPairLoading : loading,
    setRetry,
    at,
    network,
    networkError,
    query,
    setQuery,
    hits,
    searching,
    searchOpen,
    setSearchOpen,
    searchError,
    history,
    hitIndex,
    setHitIndex,
    listMode,
    setListMode,
    timeframe,
    setTimeframe,
    tokenError,
    marketRecoveryNote,
    recoverMarket,
    select,
    input,
    rows,
    sol,
  };
}
