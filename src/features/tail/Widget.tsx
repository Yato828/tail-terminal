import { useEffect, useRef, type ReactNode } from "react";
import type { WidgetId } from "./workspace";
import { Icon } from "./Icon";
export function Widget({
  id,
  title,
  pinned,
  edit,
  height,
  onHeight,
  onMove,
  onHide,
  onPin,
  onExpand,
  onDrop,
  children,
}: {
  id: WidgetId;
  title: string;
  pinned: boolean;
  edit: boolean;
  height?: number;
  onHeight: (n: number) => void;
  onMove: (n: number) => void;
  onHide: () => void;
  onPin: () => void;
  onExpand: () => void;
  onDrop: (id: WidgetId) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !edit) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h = Math.round(el.getBoundingClientRect().height);
        if (h >= 140 && h !== height) onHeight(h);
      }, 300);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [edit, height, onHeight]);
  return (
    <section
      ref={ref}
      className={`tail-widget widget-${id}${edit ? " editing" : ""}`}
      style={height ? { height } : undefined}
      data-widget={id}
      aria-label={title}
      onDragOver={(e) => {
        if (edit && !pinned) e.preventDefault();
      }}
      onDrop={(e) => {
        if (pinned) return;
        e.preventDefault();
        const from = e.dataTransfer.getData("text/tail-widget");
        if (
          ["pulse", "smart", "trending", "chart", "trade", "fable"].includes(
            from,
          )
        )
          onDrop(from as WidgetId);
      }}
    >
      {edit && (
        <header
          className="widget-editor"
          draggable={!pinned}
          onDragStart={(e) => e.dataTransfer.setData("text/tail-widget", id)}
        >
          <span>{title}</span>
          <button
            aria-label={`Move ${title} up`}
            disabled={pinned}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            aria-label={`Move ${title} down`}
            disabled={pinned}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            aria-label={`Pin ${title}`}
            aria-pressed={pinned}
            onClick={onPin}
          >
            <Icon name="pin" size={13} />
          </button>
          <button aria-label={`Maximize ${title}`} onClick={onExpand}>
            <Icon name="expand" size={13} />
          </button>
          <button
            aria-label={`Hide ${title}`}
            disabled={pinned}
            onClick={onHide}
          >
            <Icon name="close" size={13} />
          </button>
        </header>
      )}
      {children}
    </section>
  );
}
