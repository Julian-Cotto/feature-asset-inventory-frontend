import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";

export type ToastKind = "info" | "success" | "warning" | "danger";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** ms until auto-dismiss. 0 = persistent until user closes. */
  duration: number;
}

interface ToastContextValue {
  notify: (input: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
  /** Wrap a promise: shows a pending toast + indeterminate top progress
   *  bar, then swaps to success/error on settle. Resolves with the
   *  promise's value or re-throws. */
  run: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: {
      pending: string;
      success: string | ((result: T) => string);
      error?: string | ((err: unknown) => string);
    },
  ) => Promise<T>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  warning: 5000,
  danger: 6000,
};

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [inflightCount, setInflightCount] = useState(0);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue["notify"]>(
    ({ kind, title, detail, duration }) => {
      const id = nextId.current++;
      const finalDuration = duration ?? DEFAULT_DURATION[kind];
      setToasts((prev) => [...prev, { id, kind, title, detail, duration: finalDuration }]);
      if (finalDuration > 0) {
        const t = setTimeout(() => dismiss(id), finalDuration);
        timers.current.set(id, t);
      }
      return id;
    },
    [dismiss],
  );

  const run = useCallback<ToastContextValue["run"]>(
    async (promise, messages) => {
      const pendingId = notify({
        kind: "info",
        title: messages.pending,
        duration: 0,
      });
      setInflightCount((c) => c + 1);
      try {
        const result = await (typeof promise === "function" ? promise() : promise);
        dismiss(pendingId);
        const successTitle =
          typeof messages.success === "function"
            ? messages.success(result)
            : messages.success;
        notify({ kind: "success", title: successTitle });
        return result;
      } catch (err) {
        dismiss(pendingId);
        const errorTitle =
          typeof messages.error === "function"
            ? messages.error(err)
            : messages.error ?? "Action failed";
        const detail = err instanceof Error ? err.message : String(err);
        notify({ kind: "danger", title: errorTitle, detail });
        throw err;
      } finally {
        setInflightCount((c) => Math.max(0, c - 1));
      }
    },
    [dismiss, notify],
  );

  // Clean up timers on unmount
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ notify, dismiss, run }), [notify, dismiss, run]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {inflightCount > 0 && <div className="progress-bar" aria-hidden="true" />}
      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <div key={t.id} className={`toast toast-${t.kind}`}>
                <Icon size={16} className="toast-icon" strokeWidth={1.75} />
                <div className="toast-body">
                  <div className="toast-title">{t.title}</div>
                  {t.detail && <div className="toast-detail">{t.detail}</div>}
                </div>
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
