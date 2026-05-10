import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmTone = "default" | "info" | "warning" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** When true, only "OK" button is shown (alert mode). */
  singleButton?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface Ctx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: Omit<ConfirmOptions, "singleButton">) => Promise<void>;
}

const ConfirmCtx = createContext<Ctx | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider.");
  return ctx.confirm;
}

export function useAlert(): (opts: Omit<ConfirmOptions, "singleButton">) => Promise<void> {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useAlert must be used inside ConfirmProvider.");
  return ctx.alert;
}

function toneIcon(tone: ConfirmTone): string {
  switch (tone) {
    case "danger":
      return "✕";
    case "warning":
      return "!";
    case "info":
      return "i";
    default:
      return "?";
  }
}

function toneIconClass(tone: ConfirmTone): string {
  switch (tone) {
    case "danger":
      return "bg-danger-soft text-danger-soft-fg";
    case "warning":
      return "bg-warning-soft text-warning-soft-fg";
    case "info":
      return "bg-primary-soft text-primary-soft-fg";
    default:
      return "bg-surface-muted text-text-muted";
  }
}

function toneConfirmBtn(tone: ConfirmTone): string {
  switch (tone) {
    case "danger":
      return "btn btn-danger";
    case "warning":
      return "btn btn-primary";
    default:
      return "btn btn-primary";
  }
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const downOnBackdropRef = useRef(false);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...opts, resolve });
      }),
    [],
  );

  const alertFn = useCallback(
    (opts: Omit<ConfirmOptions, "singleButton">): Promise<void> =>
      new Promise<void>((resolve) => {
        setRequest({
          ...opts,
          singleButton: true,
          resolve: () => resolve(),
        });
      }),
    [],
  );

  // Esc closes (returns false / dismiss for alerts)
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        request.resolve(false);
        setRequest(null);
      } else if (e.key === "Enter") {
        request.resolve(true);
        setRequest(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  function close(value: boolean) {
    if (!request) return;
    request.resolve(value);
    setRequest(null);
  }

  return (
    <ConfirmCtx.Provider value={{ confirm, alert: alertFn }}>
      {children}
      {request && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            downOnBackdropRef.current = e.target === e.currentTarget;
          }}
          onMouseUp={(e) => {
            if (
              downOnBackdropRef.current &&
              e.target === e.currentTarget
            ) {
              close(false);
            }
            downOnBackdropRef.current = false;
          }}
        >
          <div
            className="modal-panel"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cluster">
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${toneIconClass(
                  request.tone ?? "default",
                )}`}
                aria-hidden="true"
              >
                {toneIcon(request.tone ?? "default")}
              </span>
              {request.title && (
                <h2 className="modal-title">{request.title}</h2>
              )}
            </div>
            <div className="text-sm text-text">{request.message}</div>
            <div className="modal-actions">
              {request.singleButton ? (
                <span />
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => close(false)}
                  autoFocus
                >
                  {request.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                type="button"
                className={`${toneConfirmBtn(request.tone ?? "default")} btn-sm`}
                onClick={() => close(true)}
              >
                {request.confirmLabel ?? (request.singleButton ? "OK" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
