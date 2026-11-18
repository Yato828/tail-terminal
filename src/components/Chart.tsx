import { tailBackendEnabled } from "../services/backend/config";
import { AssistantName, useProductBrand } from "../design-system/brand";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { mascot } from "../mascot/events";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  CANDLE_IVS,
  IV_MS,
  loadCandleResult,
  normalizeCandles,
  type Candle,
  type Interval,
  type CandleResult,
} from "../lib/axiom";
import {
  allHistoryRange,
  collectOlderHistory,
  historyIdentity,
  overviewInterval,
} from "../lib/chartHistory";
import { chartPrecision, chartPrice } from "../lib/chartFormat";
import { errorMessage } from "../lib/validation";
import { fmtQty } from "../lib/format";
import { THEME, usePreferences } from "../features/preferences/preferences";
import { requestScenario } from "../features/astra/scenarioClient";
import type { ChartScenario } from "../features/astra/scenario";
import {
  canUpdateTail,
  mergeSourceCandles,
  observeSpot,
  withSpotCandle,
  type SpotCandle,
} from "../lib/liveCandles";
import {
  subscribePoolSpot,
  type SpotTick,
  type StreamStatus,
} from "../lib/poolStream";
import {publishMarketSpot,publishMarketStreamStatus} from '../features/v2/market/live';
import "../features/v2/charts/charts.css";
import { heikinAshi } from "../features/v2/charts/math";
import { IndicatorControls } from "../features/v2/charts/IndicatorControls";
import { useIndicators } from "../features/v2/charts/useIndicators";
import {useChartEvents,EventControls} from '../features/v2/charts/EventControls';
import { CHART_COMMAND_EVENT, CHART_CROSSHAIR_EVENT, CHART_MODES, CHART_RANGE_EVENT, downloadChartJson, getChartData, loadChartSettings, publishChartContext, removeChartContext, saveChartSettings, type ChartCommand, type ChartMode } from "../features/v2/charts/state";
const tint = (hex: string) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0.35)`;
export function Chart({
  pool,
  token,
  symbol = "",
  priceUsd = 0,
  mcap,
  onSpot,
  onHistoryUnavailable,
  createdAt,
  chartId = "primary",
  settingsKey,
  syncGroup,
}: {
  pool: string;
  token: string;
  symbol?: string;
  priceUsd?: number;
  mcap?: number;
  onSpot?: (tick: SpotTick | null) => void;
  onHistoryUnavailable?: (interval: string, code?: string) => void;
  createdAt?: number;
  chartId?: string;
  settingsKey?: string;
  syncGroup?: string;
}) {
  const brand = useProductBrand();
  const storageKey = settingsKey ?? chartId;
  const [chartReady, setChartReady] = useState(false);
  const [saved] = useState(() => loadChartSettings(storageKey));
  const unavailableRef = useRef(onHistoryUnavailable);
  unavailableRef.current = onHistoryUnavailable;
  const { preferences: p, update } = usePreferences();
  const [iv, setIv] = useState<Interval>(() =>
      saved.interval ?? overviewInterval(createdAt, p.defaultInterval),
    ),
    [mode, setMode] = useState<"price" | "mcap">(saved.priceMode ?? "price");
  const [chartStyle, setChartStyle] = useState<ChartMode>(saved.chartMode);
  const [indicators, setIndicators] = useState(saved.indicators);
  const [volumeOverride, setVolumeOverride] = useState(saved.showVolume);
  const showVolume = volumeOverride ?? p.showVolume;
  const [rangeSelecting, setRangeSelecting] = useState(false);
  const [selectedRange, setSelectedRange] = useState<number[]>([]);
  const rangeSelectingRef = useRef(false), rangeRef = useRef<number[]>([]);
  rangeSelectingRef.current = rangeSelecting;
  rangeRef.current = selectedRange;
  const syncRef = useRef(syncGroup), syncApplying = useRef(false), chartIdRef = useRef(chartId);
  syncRef.current = syncGroup;
  chartIdRef.current = chartId;
  const [log, setLog] = useState(saved.log),
    [expanded, setExpanded] = useState(false),
    [bars, setBars] = useState<Candle[]>([]),
    [hover, setHover] = useState<Candle | null>(null);
  const [error, setError] = useState(""),
    [historyNote, setHistoryNote] = useState(""),
    [busy, setBusy] = useState(true),
    [paging, setPaging] = useState(false),
    [retry, setRetry] = useState(0),
    [source, setSource] = useState(""),
    [sourceNote, setSourceNote] = useState(""),
    [historyLimited, setHistoryLimited] = useState(false),
    [scope, setScope] = useState<"pool" | "token">("pool"),
    [volumeUnit, setVolumeUnit] = useState<"usd" | "token">("usd"),
    [viewMode, setViewMode] = useState<"all" | "recent" | "custom">("all"),
    [at, setAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const [scenario, setScenario] = useState<ChartScenario | null>(null),
    [scenarioBusy, setScenarioBusy] = useState(false),
    [scenarioError, setScenarioError] = useState("");
  const [tick, setTick] = useState<SpotTick | null>(null),
    [spot, setSpot] = useState<SpotCandle | null>(null),
    [feed, setFeed] = useState<StreamStatus | null>(null),
    [reconnect, setReconnect] = useState(0);
  const spotRef = useRef<SpotCandle | null>(null);
  const visibleBars = useMemo(
    () => (scope === "token" ? bars : withSpotCandle(bars, spot)),
    [bars, spot, scope],
  );
  const sourceResult = useRef<CandleResult | null>(null),
    sourceKey = useRef(""),
    fullRun = useRef(0),
    autoHistory = useRef(false),
    viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const fullHistory = useRef<(initial?: CandleResult) => void>(() => {});
  const root = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    volume = useRef<ISeriesApi<"Histogram"> | null>(null),
    priceLine = useRef<ISeriesApi<"Line"> | null>(null),
    areaLine = useRef<ISeriesApi<"Area"> | null>(null),
    projection = useRef<ISeriesApi<"Line"> | null>(null);
  const sourceBarsRef = useRef<Candle[]>([]);
  sourceBarsRef.current = bars;
  const barsRef = useRef<Candle[]>([]),
    drawn = useRef<{ bars: Candle[]; multiplier: number; colors: string }>({
      bars: [],
      multiplier: 1,
      colors: "",
    }),
    firstDraw = useRef(true),
    programmaticView = useRef(false),
    viewFrame = useRef(0),
    pageLock = useRef(false),
    generation = useRef(0),
    page = useRef<() => void>(() => {}),
    scenarioAbort = useRef<AbortController | null>(null),
    refreshVersion = useRef(-1);
  barsRef.current = visibleBars;
  const multiplier =
    mode === "mcap" && mcap && mcap > 0 && Number.isFinite(mcap) && priceUsd > 0 && Number.isFinite(priceUsd) ? mcap / priceUsd : 1;
  const indicatorData = useIndicators(chart, bars, indicators, volumeUnit, multiplier, showVolume, chartReady);
  const chartEvents=useChartEvents({mint:token,bars,interval:iv,series:chartStyle==='line'?priceLine:chartStyle==='area'?areaLine:series,ready:chartReady});
  useEffect(() => { saveChartSettings(storageKey, { version: 1, chartMode: chartStyle, priceMode: mode, interval: iv, log, showVolume: volumeOverride, indicators }); }, [storageKey, chartStyle, mode, iv, log, volumeOverride, indicators]);
  useEffect(() => {
    if (mode === "mcap" && (!mcap || mcap <= 0 || !Number.isFinite(mcap) || priceUsd <= 0 || !Number.isFinite(priceUsd))) setMode("price");
  }, [mode, mcap, priceUsd]);
  const theme = THEME[p.theme];
  const changeView = (action: () => void) => {
    programmaticView.current = true;
    cancelAnimationFrame(viewFrame.current);
    action();
    viewFrame.current = requestAnimationFrame(() => {
      programmaticView.current = false;
    });
  };
  const recentView = () => {
    fullRun.current++;
    pageLock.current = false;
    setPaging(false);
    setViewMode("recent");
    viewModeRef.current = "recent";
    const length = barsRef.current.length;
    if (length)
      changeView(() =>
        chart.current?.timeScale().setVisibleLogicalRange({
          from: length - p.visibleCandles,
          to: length + (scenario ? p.scenarioSteps + 2 : 5),
        }),
      );
  };
  const fitAll = (length = barsRef.current.length) => {
    if (length)
      changeView(() =>
        chart.current
          ?.timeScale()
          .setVisibleLogicalRange(allHistoryRange(length)),
      );
  };
  const changeInterval = (value: Interval) => {
    fullRun.current++;
    setViewMode("recent");
    viewModeRef.current = "recent";
    setIv(value);
  };
  const showAll = () => {
    setViewMode("all");
    viewModeRef.current = "all";
    const next = overviewInterval(createdAt, iv);
    if (next !== iv) {
      setIv(next);
      return;
    }
    fitAll();
    fullHistory.current();
  };
  useEffect(() => {
    if (!container.current) return;
    const api = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.muted,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: theme.edge },
        horzLines: { color: theme.edge },
      },
      rightPriceScale: {
        borderColor: theme.edge,
        scaleMargins: { top: 0.08, bottom: 0.23 },
      },
      timeScale: {
        borderColor: theme.edge,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        minBarSpacing: 0.05,
        shiftVisibleRangeOnNewBar: p.followLatest,
      },
      localization: { locale: "en-US" },
    });
    const candles = api.addSeries(CandlestickSeries, {
      upColor: p.upColor,
      downColor: p.downColor,
      borderUpColor: p.upColor,
      borderDownColor: p.downColor,
      wickUpColor: p.upColor,
      wickDownColor: p.downColor,
    });
    const closeLine = api.addSeries(LineSeries, {
      color: p.upColor,
      lineWidth: 2,
      visible: false,
      title: "Source close",
    });
    priceLine.current = closeLine;
    areaLine.current = api.addSeries(AreaSeries, { lineColor: p.upColor, topColor: tint(p.upColor), bottomColor: "rgba(0,0,0,0)", lineWidth: 2, visible: false, title: "Source close area" });
    const vols = api.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    vols
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    const path = api.addSeries(LineSeries, {
      color: "#ff963b",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title: "AI scenario · hypothetical",
    });
    chart.current = api;
    setChartReady(true);
    series.current = candles;
    volume.current = vols;
    projection.current = path;
    api.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        if (syncRef.current && !syncApplying.current) window.dispatchEvent(new CustomEvent(CHART_CROSSHAIR_EVENT, { detail: { chartId: chartIdRef.current, group: syncRef.current, time: null } }));
        return;
      }
      if (syncRef.current && !syncApplying.current) window.dispatchEvent(new CustomEvent(CHART_CROSSHAIR_EVENT, { detail: { chartId: chartIdRef.current, group: syncRef.current, time: Number(param.time) } }));
      setHover(
        barsRef.current.find((b) => b.t === Number(param.time) * 1000) ?? null,
      );
    });
    api.subscribeClick(param => {
      if (!rangeSelectingRef.current || !param.time) return;
      const time = Number(param.time) * 1000;
      // Selection may only anchor on actual source candles, never scenarios/spot.
      if (!sourceBarsRef.current.some(b => b.t === time)) return;
      setSelectedRange(old => old.length === 1 ? [Math.min(old[0], time), Math.max(old[0], time)] : [time]);
      if (rangeRef.current.length === 1) setRangeSelecting(false);
    });
    api.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        container.current?.setAttribute(
          "data-visible-from",
          String(range.from),
        );
        container.current?.setAttribute("data-visible-to", String(range.to));
      }
      if (
        range &&
        range.from < 2 &&
        viewModeRef.current === "custom" &&
        !firstDraw.current &&
        !programmaticView.current
      )
        page.current();
    });
    return () => {
      api.remove();
      chart.current = null;
      series.current = null;
      volume.current = null;
      priceLine.current = null;
      areaLine.current = null;
      projection.current = null;
      scenarioAbort.current?.abort();
      cancelAnimationFrame(viewFrame.current);
    };
  }, []);
  useEffect(() => {
    const api = chart.current;
    if (!api) return;
    api.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.muted,
        fontSize: p.textSize === "large" ? 12 : 11,
      },
      grid: {
        vertLines: { color: theme.edge, visible: p.showGrid },
        horzLines: { color: theme.edge, visible: p.showGrid },
      },
      rightPriceScale: {
        borderColor: theme.edge,
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.23 : 0.07 },
      },
      timeScale: {
        borderColor: theme.edge,
        shiftVisibleRangeOnNewBar: p.followLatest,
      },
      crosshair: {
        mode: p.showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: { color: theme.muted, visible: p.showCrosshair },
        horzLine: { color: theme.muted, visible: p.showCrosshair },
      },
    });
    series.current?.applyOptions({
      upColor: p.hollowCandles ? theme.background : p.upColor,
      downColor: p.downColor,
      borderUpColor: p.upColor,
      borderDownColor: p.downColor,
      wickUpColor: p.upColor,
      wickDownColor: p.downColor,
    });
    volume.current?.applyOptions({ visible: showVolume });
  }, [
    p.theme,
    p.upColor,
    p.downColor,
    showVolume,
    p.showGrid,
    p.showCrosshair,
    p.hollowCandles,
    p.followLatest,
    p.textSize,
  ]);
  useEffect(() => {
    generation.current++;
    fullRun.current++;
    autoHistory.current = false;
    sourceResult.current = null;
    sourceKey.current = "";
    pageLock.current = false;
    firstDraw.current = true;
    drawn.current = { bars: [], multiplier: 1, colors: "" };
    barsRef.current = [];
    setBars([]);
    setHover(null);
    setSelectedRange([]);
    setRangeSelecting(false);
    setSource("");
    setScope("pool");
    setVolumeUnit("usd");
    setSourceNote("");
    setHistoryLimited(false);
    setAt(0);
    setHistoryNote("");
    setError("");
    setBusy(true);
    setPaging(false);
    return () => {
      generation.current++;
      fullRun.current++;
    };
  }, [pool, token, iv]);
  useEffect(() => {
    spotRef.current = null;
    setSpot(null);
    setTick(null);
    onSpot?.(null);
  }, [pool, token, iv, p.streamPrices, p.streamCommitment, p.streamEndpoint]);
  useEffect(() => {
    let stop: (() => void) | undefined,
      disposed = false,
      frame = 0;
    let latest: SpotTick | null = null;
    const connect = () => {
      stop?.();
      stop = undefined;
      if (disposed || !p.liveUpdates || !p.streamPrices || document.hidden)
        return;
      setFeed(null);
      stop = subscribePoolSpot({
        pool,
        mint: token,
        commitment: p.streamCommitment,
        endpoint: p.streamEndpoint,
        onStatus: (next) => {
          if(disposed)return;
          publishMarketStreamStatus(token,pool,next);
          setFeed(next);
          if (next.state === "reconnecting") {
            spotRef.current = null;
            setSpot(null);
            setTick(null);
          }
        },
        onTick: (next) => {
          if (disposed) return;
          publishMarketSpot(token,pool,next);
          latest = next;
          spotRef.current = observeSpot(
            spotRef.current,
            next.price,
            next.receivedAt,
            IV_MS[iv],
          );
          if (!frame)
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (disposed) return;
              setSpot(spotRef.current);
              setTick(latest);
            });
        },
      });
    };
    const visibility = () => {
      if (document.hidden) {
        stop?.();
        stop = undefined;
        setFeed(null);
      } else connect();
    };
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      stop?.();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      onSpot?.(null);
    };
  }, [
    pool,
    token,
    iv,
    p.liveUpdates,
    p.streamPrices,
    p.streamCommitment,
    p.streamEndpoint,
    reconnect,
    onSpot,
  ]);
  const spotFresh = !!tick && now - tick.receivedAt < 15000;
  useEffect(() => {
    onSpot?.(
      p.liveUpdates && feed?.state === "live" && spotFresh ? tick : null,
    );
  }, [tick, feed?.state, p.liveUpdates, spotFresh, onSpot]);
  useEffect(() => {
    let stopped = false,
      inFlight = false,
      failures = 0;
    let announce = true;
    let motionRequest: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (stopped || inFlight) return;
      if (pageLock.current) {
        timer = setTimeout(run, p.refreshSeconds * 1000);
        return;
      }
      if (document.hidden) {
        if (p.liveUpdates) timer = setTimeout(run, p.refreshSeconds * 1000);
        return;
      }
      inFlight = true;
      if (announce && brand.product === "TAIL" && !motionRequest)
        motionRequest = mascot.begin("analyzing", "chart");
      try {
        const result = await loadCandleResult(
          pool,
          iv,
          token,
          undefined,
          0,
          retry ? 0 : p.refreshSeconds * 1000 - 100,
        );
        if (!stopped) {
          const identity = historyIdentity(result),
            sameSource = !sourceKey.current || sourceKey.current === identity;
          if (!sameSource) {
            firstDraw.current = true;
            autoHistory.current = false;
          }
          sourceKey.current = identity;
          sourceResult.current = result;
          setBars((old) =>
            sameSource ? mergeSourceCandles(old, result.bars) : result.bars,
          );
          setScope(result.scope ?? "pool");
          setVolumeUnit(result.volumeUnit ?? "usd");
          setSource(result.source);
          setSourceNote(result.warning ?? "");
          setHistoryLimited(result.historyLimited === true);
          setAt(result.fetchedAt);
          setError("");
          failures = 0;
          if (announce && brand.product === "TAIL")
            mascot.end(motionRequest, "idle");
          announce = false;
          if (
            viewModeRef.current === "all" &&
            result.paging &&
            !result.historyLimited &&
            !autoHistory.current
          ) {
            autoHistory.current = true;
            fullHistory.current(result);
          }
        }
      } catch (e) {
        if (!stopped) {
          setError(errorMessage(e));
          if (announce)
            unavailableRef.current?.(
              iv,
              e && typeof e === "object" && "code" in e
                ? String(e.code)
                : undefined,
            );
          failures++;
          if (announce && brand.product === "TAIL")
            mascot.end(motionRequest, "error");
          announce = false;
        }
      } finally {
        inFlight = false;
        if (!stopped) {
          setBusy(false);
          if (p.liveUpdates)
            timer = setTimeout(
              run,
              failures
                ? Math.min(
                    60000,
                    Math.max(15000, p.refreshSeconds * 1000) * failures,
                  )
                : p.refreshSeconds * 1000,
            );
        }
      }
    };
    const resume = () => {
      if (!document.hidden && p.liveUpdates) {
        clearTimeout(timer);
        void run();
      }
    };
    const manual = refreshVersion.current !== retry;
    refreshVersion.current = retry;
    if (p.liveUpdates || !barsRef.current.length || manual) void run();
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      if (brand.product === "TAIL") mascot.end(motionRequest, "cancel");
    };
  }, [pool, token, iv, retry, p.liveUpdates, p.refreshSeconds]);
  useEffect(() => {
    const candles = series.current,
      vols = volume.current;
    if (!candles || !vols) return;
    const precision = chartPrecision(
      (visibleBars.at(-1)?.c ?? priceUsd) * multiplier,
    );
    candles.applyOptions({
      priceFormat: {
        type: "custom",
        minMove: 10 ** -precision,
        formatter: (n: number) => chartPrice(n, precision),
      },
    });
    priceLine.current?.applyOptions({
      color: p.upColor,
      priceFormat: {
        type: "custom",
        minMove: 10 ** -precision,
        formatter: (n: number) => chartPrice(n, precision),
      },
    });
    areaLine.current?.applyOptions({ lineColor: p.upColor, topColor: tint(p.upColor), priceFormat: { type: "custom", minMove: 10 ** -precision, formatter: (n: number) => chartPrice(n, precision) } });
    areaLine.current?.setData(visibleBars.map(b => ({ time: Math.floor(b.t / 1000) as UTCTimestamp, value: b.c * multiplier })));
    priceLine.current?.setData(
      visibleBars.map((b) => ({
        time: Math.floor(b.t / 1000) as UTCTimestamp,
        value: b.c * multiplier,
      })),
    );
    const candle = (b: Candle) => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      open: b.o * multiplier,
      high: b.h * multiplier,
      low: b.l * multiplier,
      close: b.c * multiplier,
    });
    const vol = (b: Candle) => ({
      time: Math.floor(b.t / 1000) as UTCTimestamp,
      value: b.v,
      color: tint(b.c >= b.o ? p.upColor : p.downColor),
    });
    const colors = `${p.upColor}:${p.downColor}:${chartStyle}`;
    const displayBars = chartStyle === "heikin" ? heikinAshi(visibleBars) : visibleBars;
    const previous = drawn.current;
    if (
      previous.multiplier === multiplier &&
      previous.colors === colors &&
      chartStyle !== "heikin" &&
      canUpdateTail(previous.bars, visibleBars)
    ) {
      for (const b of visibleBars.slice(
        Math.max(0, previous.bars.length - 1),
      )) {
        candles.update(candle(b));
        vols.update(vol(b));
      }
    } else {
      candles.setData(
        displayBars.map(candle) as CandlestickData<UTCTimestamp>[],
      );
      vols.setData(visibleBars.map(vol));
    }
    drawn.current = { bars: visibleBars, multiplier, colors };
    if (visibleBars.length && firstDraw.current) {
      if (viewModeRef.current === "all") fitAll(visibleBars.length);
      else
        changeView(() =>
          chart.current?.timeScale().setVisibleLogicalRange({
            from: visibleBars.length - p.visibleCandles,
            to: visibleBars.length + 5,
          }),
        );
      firstDraw.current = false;
    } else if (
      visibleBars.length &&
      viewModeRef.current === "all" &&
      previous.bars.length !== visibleBars.length
    ) {
      fitAll(visibleBars.length);
    }
  }, [visibleBars, multiplier, p.upColor, p.downColor, chartStyle]);
  useEffect(() => {
    series.current?.applyOptions({ visible: chartStyle === "candles" || chartStyle === "heikin" });
    priceLine.current?.applyOptions({ visible: chartStyle === "line" });
    areaLine.current?.applyOptions({ visible: chartStyle === "area" });
  }, [chartStyle]);
  useEffect(() => {
    chart.current?.priceScale("right").applyOptions({
      mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [log]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", key);
    const t = setInterval(
      () => setNow(Date.now()),
      p.streamPrices ? 100 : 1000,
    );
    return () => {
      window.removeEventListener("keydown", key);
      clearInterval(t);
    };
  }, [p.streamPrices]);
  useEffect(() => {
    scenarioAbort.current?.abort();
    setScenario(null);
    setScenarioError("");
    setScenarioBusy(false);
  }, [token, pool, iv, p.aiScenario, p.scenarioSteps]);
  const scenarioEnded =
    !!scenario && !!bars.length && bars.at(-1)!.t >= scenario.points.at(-1)!.t;
  useEffect(() => {
    changeView(() =>
      projection.current?.setData(
        p.aiScenario && scenario && !scenarioEnded
          ? [
              {
                time: (scenario.anchor.t / 1000) as UTCTimestamp,
                value: scenario.anchor.price * multiplier,
              },
              ...scenario.points.map((pt) => ({
                time: (pt.t / 1000) as UTCTimestamp,
                value: pt.price * multiplier,
              })),
            ]
          : [],
      ),
    );
  }, [scenario, p.aiScenario, scenarioEnded, multiplier]);
  fullHistory.current = async (requested) => {
    const initial = requested ?? sourceResult.current;
    if (!initial || pageLock.current) return;
    if (initial.historyLimited) {
      setHistoryNote("This source limits history to 24h.");
      return;
    }
    pageLock.current = true;
    setPaging(true);
    setHistoryNote("Loading available history…");
    const version = generation.current,
      request = ++fullRun.current;
    const cancelled = () =>
      version !== generation.current || request !== fullRun.current;
    try {
      const result = await collectOlderHistory(
        {
          ...initial,
          bars:
            !requested && barsRef.current.length
              ? barsRef.current
              : initial.bars,
        },
        (before) => loadCandleResult(pool, iv, token, before),
        {
          maxPages: 8,
          cancelled,
          onPage: (rows) => {
            if (!cancelled()) {
              setBars(rows);
              if (viewModeRef.current === "all")
                requestAnimationFrame(() => {
                  if (!cancelled() && viewModeRef.current === "all")
                    fitAll(rows.length);
                });
            }
          },
        },
      );
      if (!cancelled()) {
        setBars(result.bars);
        if (viewModeRef.current === "all")
          requestAnimationFrame(() => {
            if (!cancelled() && viewModeRef.current === "all")
              fitAll(result.bars.length);
          });
        setHistoryNote(
          result.stopped === "limit"
            ? "Loaded 8 history pages. Older history can continue loading; coverage depends on the source."
            : "Source returned no older candles in the queried window. Gaps are preserved.",
        );
      }
    } catch (e) {
      if (!cancelled()) setHistoryNote(errorMessage(e));
    } finally {
      if (!cancelled()) {
        pageLock.current = false;
        setPaging(false);
      }
    }
  };
  page.current = async () => {
    if (pageLock.current || busy || historyLimited || !barsRef.current.length)
      return;
    pageLock.current = true;
    setPaging(true);
    const version = generation.current,
      request = ++fullRun.current,
      first = barsRef.current[0].t;
    const cancelled = () =>
      version !== generation.current || request !== fullRun.current;
    try {
      const result = await loadCandleResult(pool, iv, token, first - 1);
      if (cancelled()) return;
      if (
        sourceResult.current &&
        historyIdentity(sourceResult.current) !== historyIdentity(result)
      )
        throw new Error(
          "Historical source or volume units changed. Reload the chart to keep series separate.",
        );
      const older = result.bars.filter((b) => b.t < first);
      if (!older.length)
        setHistoryNote("No earlier history returned by connected sources.");
      else {
        const range = chart.current?.timeScale().getVisibleLogicalRange();
        setBars((old) => normalizeCandles([...older, ...old]));
        if (range)
          requestAnimationFrame(() => {
            if (cancelled()) return;
            changeView(() =>
              chart.current?.timeScale().setVisibleLogicalRange({
                from: range.from + older.length,
                to: range.to + older.length,
              }),
            );
          });
      }
    } catch (e) {
      if (!cancelled()) setHistoryNote(errorMessage(e));
    } finally {
      if (!cancelled()) {
        pageLock.current = false;
        setPaging(false);
      }
    }
  };
  const generate = async () => {
    const ac = new AbortController();
    scenarioAbort.current?.abort();
    scenarioAbort.current = ac;
    setScenarioBusy(true);
    setScenarioError("");
    try {
      const result = await requestScenario(
        {
          chainId: "solana",
          mint: token,
          pool,
          interval: iv,
          steps: p.scenarioSteps,
        },
        ac.signal,
      );
      if (!ac.signal.aborted) {
        setScenario(result);
        changeView(() =>
          chart.current?.timeScale().setVisibleLogicalRange({
            from: Math.max(0, barsRef.current.length - p.visibleCandles),
            to: barsRef.current.length + p.scenarioSteps + 3,
          }),
        );
      }
    } catch (e) {
      if (!ac.signal.aborted) setScenarioError(errorMessage(e));
    } finally {
      if (!ac.signal.aborted) setScenarioBusy(false);
    }
  };
  const shown =
      (hover && visibleBars.find((b) => b.t === hover.t)) ?? visibleBars.at(-1),
    stale =
      !!error ||
      (p.liveUpdates &&
        at > 0 &&
        now - at >
          Math.max(historyLimited ? 90000 : 30000, p.refreshSeconds * 3000));
  useEffect(() => {
    publishChartContext({ chartId, mint: token, pool, symbol, interval: iv, chartMode: chartStyle, priceMode: mode,
      indicators: indicators.enabled, source, fetchedAt: at || null, lastCandleAt: bars.at(-1)?.t ?? null,
      stale: !at || stale, scope, volumeUnit, candleCount: bars.length }, bars);
  }, [chartId, token, pool, symbol, iv, chartStyle, mode, indicators, source, at, stale, scope, volumeUnit, bars]);
  useEffect(() => () => removeChartContext(chartId), [chartId]);
  useEffect(() => {
    const command = (event: Event) => {
      const d = (event as CustomEvent<ChartCommand>).detail;
      if (!d || typeof d !== "object" || (d.chartId ? d.chartId !== chartId : chartId !== "primary")) return;
      if (d.interval && CANDLE_IVS.includes(d.interval)) changeInterval(d.interval);
      if (d.chartMode && CHART_MODES.includes(d.chartMode)) setChartStyle(d.chartMode);
    };
    window.addEventListener(CHART_COMMAND_EVENT, command);
    return () => window.removeEventListener(CHART_COMMAND_EVENT, command);
  }, [chartId]);
  useEffect(() => {
    const sync = (event: Event) => {
      const d = (event as CustomEvent<{ chartId: string; group: string; time: number | null }>).detail;
      if (!d || d.chartId === chartId || !syncGroup || d.group !== syncGroup) return;
      syncApplying.current = true;
      if (d.time === null) chart.current?.clearCrosshairPosition();
      else {
        const bar = barsRef.current.find(b => Math.floor(b.t / 1000) === d.time);
        if (bar && series.current) chart.current?.setCrosshairPosition(bar.c * multiplier, d.time as UTCTimestamp, chartStyle === "line" ? priceLine.current! : chartStyle === "area" ? areaLine.current! : series.current);
        else chart.current?.clearCrosshairPosition();
      }
      syncApplying.current = false;
    };
    window.addEventListener(CHART_CROSSHAIR_EVENT, sync);
    return () => window.removeEventListener(CHART_CROSSHAIR_EVENT, sync);
  }, [chartId, syncGroup, multiplier, chartStyle]);
  return (
    <div
      ref={root}
      data-chart-id={chartId}
      data-interval={iv}
      data-chart-mode={chartStyle}
      data-crosshair-time={hover?.t ?? ""}
      data-indicator-series={Object.entries(indicatorData).map(([key, points]) => `${key}:${points.length}`).join(",")}
      className={`sol-chart${expanded ? " expanded" : ""}`}
      data-candle-count={bars.length}
      data-history-view={viewMode}
      data-history-scope={scope}
      data-volume-unit={volumeUnit}
      data-first-candle={bars[0]?.t ?? ""}
      data-last-candle={bars.at(-1)?.t ?? ""}
      data-last-close={bars.at(-1)?.c ?? ""}
      data-live-price={tick?.price ?? ""}
      data-live-received-at={tick?.receivedAt ?? ""}
      data-live-slot={tick?.slot ?? ""}
      data-rendered-close={visibleBars.at(-1)?.c ?? ""}
    >
      <div className="chart-toolbar">
        <div className="chart-intervals">
          {CANDLE_IVS.map((value) => (
            <button
              key={value}
              className={iv === value ? "selected" : ""}
              onClick={() => changeInterval(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="chart-options">
          <button
            aria-pressed={chartStyle === "candles"}
            onClick={() => setChartStyle("candles")}
          >
            Candles
          </button>
          <button
            aria-pressed={chartStyle === "line"}
            onClick={() => setChartStyle("line")}
          >
            Line
          </button>
          <button aria-pressed={chartStyle === "area"} onClick={() => setChartStyle("area")}>Area</button>
          <button aria-pressed={chartStyle === "heikin"} onClick={() => setChartStyle("heikin")}>Heikin Ashi</button>
          <button
            className={mode === "price" ? "selected" : ""}
            onClick={() => setMode("price")}
          >
            Price
          </button>
          <button
            disabled={!mcap || mcap <= 0 || !Number.isFinite(mcap) || priceUsd <= 0 || !Number.isFinite(priceUsd)}
            className={mode === "mcap" ? "selected" : ""}
            onClick={() => setMode("mcap")}
          >
            MCap est.
          </button>
          <button aria-pressed={log} onClick={() => setLog((v) => !v)}>
            {log ? "Log" : "Linear"}
          </button>
          <button aria-pressed={showVolume} onClick={() => setVolumeOverride(v => !(v ?? p.showVolume))}>Volume</button>
          <button onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else if (root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setExpanded(true));
            else setExpanded(true);
          }}>Fullscreen</button>
          <button
            onClick={showAll}
            aria-pressed={viewMode === "all"}
            title="Load all available source history; overview interval adapts to market age"
          >
            All
          </button>
          <button onClick={recentView} aria-pressed={viewMode === "recent"}>
            Latest
          </button>
          <button title="Fit all loaded history" onClick={() => fitAll()}>
            Fit
          </button>
          <button
            aria-label={expanded ? "Restore chart" : "Expand chart"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "↙" : "↗"}
          </button>
        </div>
      </div>
      <div className="chart-legend">
        <b>
          {symbol} / {mode === "mcap" ? "MCap est. USD" : "USD"}
        </b>
        {chartStyle === "heikin" && <span>Heikin Ashi · derived view · OHLC legend is source</span>}
        {shown && (
          <span className="candle-key">
            <span>O {chartPrice(shown.o * multiplier)}</span>
            <span>H {chartPrice(shown.h * multiplier)}</span>
            <span>L {chartPrice(shown.l * multiplier)}</span>
            <span className={shown.c >= shown.o ? "up" : "dn"}>
              C {chartPrice(shown.c * multiplier)}
            </span>
            {showVolume && (
              <span>
                {spot?.t === shown.t && !bars.some((b) => b.t === shown.t)
                  ? "V pending source"
                  : `V ${fmtQty(shown.v)} ${volumeUnit === "usd" ? "USD" : symbol || "tokens"}`}
              </span>
            )}
          </span>
        )}
        <button
          className={`live-indicator ${stale && !(feed?.state === "live" && spotFresh) ? "delayed" : ""}`}
          aria-pressed={p.liveUpdates}
          onClick={() => update({ liveUpdates: !p.liveUpdates })}
          title="Pause or resume the live pool feed and source candle updates"
        >
          {!p.liveUpdates
            ? "Paused"
            : scope === "token"
              ? "Indexed · 15s"
              : p.streamPrices && feed?.state === "live" && spotFresh
                ? `LIVE · ${p.streamCommitment}`
                : p.streamPrices && feed?.state !== "unsupported"
                  ? "Waiting · WSS"
                  : `${stale ? "Delayed" : "Auto"} · ${p.refreshSeconds}s`}
        </button>
      </div>
      <div className="chart-frame">
        <div
          className="chart-surface chart-native"
          ref={container}
          onPointerDown={() => {
            setViewMode("custom");
            viewModeRef.current = "custom";
          }}
          onWheel={() => {
            setViewMode("custom");
            viewModeRef.current = "custom";
          }}
          aria-label={`${symbol} ${chartStyle === "heikin" ? "derived Heikin Ashi" : chartStyle} and source volume chart`}
        />
        {!bars.length && (
          <div className="chart-state" role="status">
            <b>
              {busy
                ? "Connecting to candle source…"
                : "Candle data unavailable"}
            </b>
            <span>
              {busy
                ? "Real source candles will appear here."
                : error || "No historical candles returned."}
            </span>
            {!busy && (
              <>
                <button onClick={() => setRetry((n) => n + 1)}>
                  Retry candle source
                </button>
                {iv !== "1h" && (
                  <button onClick={() => changeInterval("1h")}>
                    Load available 1h history
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {p.streamPrices && (
        <div
          className={`spot-feed ${feed?.state === "live" && tick && now - tick.receivedAt < 15000 ? "receiving" : ""}`}
          role="status"
        >
          <div>
            <b>
              {!p.liveUpdates
                ? "Feed paused"
                : feed?.state === "live" && tick
                  ? now - tick.receivedAt < 15000
                    ? "Streaming pool spot"
                    : "Waiting for fresh spot"
                  : feed?.state === "unsupported"
                    ? "Source candles only"
                    : "Connecting pool feed"}
            </b>
            <span>
              {tick
                ? `≈ ${chartPrice(tick.price)} · ${Math.max(0, now - tick.receivedAt)} ms since receipt · slot ${tick.slot.toLocaleString()} · ${tick.commitment}`
                : (feed?.message ?? "Opening read-only WebSocket…")}
            </span>
            <small>
              {feed?.provider ?? "Solana mainnet"}
              {tick ? ` · ${tick.kind} · ${tick.quote}` : ""}
            </small>
          </div>
          <button
            aria-label="Reconnect live feed"
            onClick={() => setReconnect((n) => n + 1)}
            disabled={!p.liveUpdates}
          >
            Reconnect
          </button>
        </div>
      )}
      {error && bars.length > 0 && (
        <p className="data-note" role="alert">
          Stale candles · {error}
        </p>
      )}
      <div className="chart-bottom">
        <span>
          {source || "Waiting for source"}
          {scope === "token" ? " · token-wide" : ""} ·{" "}
          {at ? `${new Date(at).toISOString()} · fetched ${Math.max(0, Math.floor((now - at) / 1000))}s ago` : "No data"}
        </span>
        <div>
          {paging && (
            <button
              onClick={() => {
                fullRun.current++;
                pageLock.current = false;
                setPaging(false);
                setHistoryNote(
                  "History loading stopped. Loaded candles are retained.",
                );
              }}
            >
              Stop loading history
            </button>
          )}
          <button
            onClick={() => {
              setHistoryNote("");
              if (!p.liveUpdates) {
                spotRef.current = null;
                setSpot(null);
                setTick(null);
              }
              setRetry((n) => n + 1);
            }}
          >
            Refresh
          </button>
          <button
            disabled={paging || busy || !bars.length || historyLimited}
            title={
              historyLimited
                ? "Keyless source covers the last 24h; older history requires an indexer API key"
                : undefined
            }
            onClick={() => {
              setHistoryNote("");
              pageLock.current = false;
              void page.current();
            }}
          >
            {historyLimited
              ? "24h history limit"
              : paging
                ? "Loading…"
                : "Older history"}
          </button>
          <a
            href={`https://dexscreener.com/solana/${pool}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Pool ↗
          </a>
        </div>
      </div>
      {!!bars.length && bars.length < 3 && iv !== "1m" && (
        <p className="chart-history-limit">
          Few candles at {iv}.{" "}
          <button onClick={() => changeInterval("1m")}>Show 1m</button>
        </p>
      )}
      {historyLimited && (
        <p className="chart-history-limit">
          Last 24h · observed hourly candles · partial edge bars
        </p>
      )}
      {historyNote && (
        <p className="data-note" role="status">
          {historyNote}
        </p>
      )}
      {p.aiScenario && !tailBackendEnabled() && (
        <div className="chart-scenario">
          <div>
            <b>
              <i /> <AssistantName /> scenario <small>HYPOTHETICAL</small>
            </b>
            <span>
              One possible path over {p.scenarioSteps} intervals. Unvalidated
              illustration, not a trading signal.
            </span>
          </div>
          <div className="scenario-actions">
            <button
              disabled={scenarioBusy || bars.length < 20}
              title={
                bars.length < 20
                  ? "At least 20 real source candles are required"
                  : `Request one hypothetical path from ${brand.assistant}`
              }
              onClick={() => void generate()}
            >
              {scenarioBusy
                ? `${brand.assistant} is drawing…`
                : scenario
                  ? "Regenerate scenario"
                  : "Generate scenario"}
            </button>
            {scenarioBusy && (
              <button
                onClick={() => {
                  scenarioAbort.current?.abort();
                  setScenarioBusy(false);
                }}
              >
                Stop scenario
              </button>
            )}
            {scenario && (
              <button onClick={() => setScenario(null)}>Clear scenario</button>
            )}
          </div>
          {scenarioError && <p role="alert">{scenarioError}</p>}
          {scenario && (
            <div className="scenario-detail">
              <p>
                {scenarioEnded
                  ? "This scenario horizon has ended; the path is hidden. "
                  : ""}
                {scenario.explanation}
              </p>
              <small>
                {scenario.model} · {scenario.source} · generated{" "}
                {new Date(scenario.generatedAt).toISOString()} · anchor{" "}
                {new Date(scenario.anchor.t).toISOString()}. Actual candles keep
                updating independently.
              </small>
              <details>
                <summary>Assumptions & limits</summary>
                <ul>
                  {scenario.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      )}
      <IndicatorControls value={indicators} onChange={setIndicators} volumeUnit={volumeUnit} counts={indicatorData} />
      <EventControls state={chartEvents}/>
      <details className="chart-disclosure chart-range-tools"><summary>Explain This Move · source range</summary>
        <button onClick={() => { setSelectedRange([]); setRangeSelecting(v => !v); }} aria-pressed={rangeSelecting}>{rangeSelecting ? "Cancel range selection" : "Select range on chart"}</button>
        <button disabled={!bars.length} onClick={() => { if (bars.length) setSelectedRange([bars[Math.max(0, bars.length - 100)].t, bars.at(-1)!.t]); }}>Use latest 100 source candles</button>
        <p role="status">{rangeSelecting ? selectedRange.length === 1 ? "Click the ending candle." : "Click the starting source candle, then the ending candle." : selectedRange.length === 2 ? `${new Date(selectedRange[0]).toISOString()} → ${new Date(selectedRange[1]).toISOString()}` : "Choose an actual OHLC range. No trades or causal events are inferred."}</p>
        <button disabled={selectedRange.length !== 2} onClick={() => { const data = getChartData(chartId, { from: selectedRange[0], to: selectedRange[1], maxBars: 500 }); if (data) downloadChartJson(`tail-${symbol || 'chart'}-source-range.json`, data); }}>Export source OHLCV range</button>
        <button disabled={selectedRange.length !== 2} onClick={() => { const data = getChartData(chartId, { from: selectedRange[0], to: selectedRange[1], maxBars: 200 }); if (data) window.dispatchEvent(new CustomEvent(CHART_RANGE_EVENT, { detail: data })); }}>Explain selected move</button>
        <p className="chart-help">Export up to 500 source candles; assistant context up to 200. Provisional spot, derived candles and hypothetical scenarios are excluded. Explanation availability depends on configured Fable; correlation does not prove cause.</p>
      </details>
      <details className="chart-disclosure">
        <summary>Source details & chart controls</summary>
        {sourceNote && <p className="data-note">{sourceNote}</p>}
        <p className="chart-help">
          Drag to pan · scroll to zoom · OHLC in UTC.{" "}
          {p.liveUpdates
            ? historyLimited
              ? "Hourly history refreshes every 60s; live pool spot is separate."
              : `Source candles update automatically every ${p.refreshSeconds}s; provider delays may apply.`
            : "Auto updates paused."}{" "}
          {mode === "mcap"
            ? "Historical market cap estimates use current implied supply; supply changes are not reconstructed."
            : "Historical candles from source; gaps are not filled."}{" "}
          {scope === "token" &&
            "Token-wide source candles and volumes are separate from the selected pool's spot feed. "}
          {p.streamPrices &&
            scope === "pool" &&
            "Live candle overlay uses observed pool spot at browser receipt time, not executed trade OHLC. Processed state may roll back. Volume comes only from the historical source. "}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            TradingView Lightweight Charts
          </a>
        </p>
      </details>
    </div>
  );
}
