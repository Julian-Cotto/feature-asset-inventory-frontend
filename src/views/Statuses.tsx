import { useEffect, useState } from "react";
import {
  AlertCircle,
  CircleDot,
  Flag,
  ListChecks,
  Plus,
  Wrench,
} from "lucide-react";

import { createStatus, listStatuses, updateStatus } from "../services/inventory";
import type { AssetStatus } from "../types/inventory";
import { AccentPill, SectionHeader } from "../components/visual";

function statusIcon(code: string) {
  const c = code.toLowerCase();
  if (c.includes("repair") || c.includes("broken")) return Wrench;
  if (c.includes("lost") || c.includes("missing")) return AlertCircle;
  if (c.includes("retired") || c.includes("disposed")) return Flag;
  return CircleDot;
}

function statusIconColor(code: string, isTerminal: boolean): string {
  if (isTerminal) return "text-danger-soft-fg";
  const c = code.toLowerCase();
  if (c.includes("active") || c.includes("ready")) return "text-success-soft-fg";
  if (c.includes("repair") || c.includes("hold")) return "text-warning-soft-fg";
  return "text-info-soft-fg";
}

export default function Statuses() {
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [isTerminal, setIsTerminal] = useState(false);
  const [sortOrder, setSortOrder] = useState(50);

  const reload = () =>
    listStatuses(true)
      .then(setStatuses)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void reload();
  }, []);

  const create = async () => {
    setError(null);
    try {
      await createStatus({
        code: code.trim(),
        label: label.trim(),
        is_terminal: isTerminal,
        sort_order: sortOrder,
      });
      setCode("");
      setLabel("");
      setIsTerminal(false);
      setSortOrder(50);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const activeCount = statuses.filter((s) => s.is_active).length;
  const terminalCount = statuses.filter((s) => s.is_terminal).length;

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Statuses</h2>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card card-body stack">
        <SectionHeader
          icon={<Plus size={16} />}
          title="Add status"
          tint="amber"
        />
        <div className="form-row">
          <div className="field" style={{ flex: 2 }}>
            <label className="label">Code</label>
            <input
              className="input"
              placeholder="lowercase_underscore"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label className="label">Label</label>
            <input
              className="input"
              placeholder="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field" style={{ width: "6rem" }}>
            <label className="label">Sort</label>
            <input
              className="input"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                className="checkbox"
                checked={isTerminal}
                onChange={(e) => setIsTerminal(e.target.checked)}
              />
              <span>Terminal</span>
            </label>
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void create()}
              disabled={!code || !label}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="card card-body stack">
        <SectionHeader
          icon={<ListChecks size={16} />}
          title="Statuses"
          tint="info"
          right={
            <span className="text-xs text-muted">
              <span className="text-success-soft-fg font-medium">
                {activeCount}
              </span>{" "}
              active ·{" "}
              <span className="text-danger-soft-fg font-medium">
                {terminalCount}
              </span>{" "}
              terminal
            </span>
          }
        />
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Sort</th>
                <th>Terminal</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => {
                const Icon = statusIcon(s.code);
                const iconClass = statusIconColor(s.code, s.is_terminal);
                return (
                  <tr key={s.code} style={{ opacity: s.is_active ? 1 : 0.55 }}>
                    <td>
                      <div
                        className="cluster"
                        style={{ gap: "0.625rem", flexWrap: "nowrap" }}
                      >
                        <Icon
                          size={16}
                          className={`${iconClass} shrink-0`}
                          aria-hidden
                        />
                        <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                          <span className="font-medium truncate">
                            {s.label}
                          </span>
                          <span className="font-mono text-xs text-muted truncate">
                            {s.code}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <AccentPill value={String(s.sort_order)} />
                    </td>
                    <td>
                      {s.is_terminal ? (
                        <span className="badge badge-danger">Terminal</span>
                      ) : (
                        <span className="badge badge-success">Open</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={s.is_active}
                        onChange={async (e) => {
                          await updateStatus(s.code, {
                            is_active: e.target.checked,
                          });
                          void reload();
                        }}
                        aria-label={`Toggle ${s.label} active`}
                      />
                    </td>
                  </tr>
                );
              })}
              {statuses.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-muted"
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No statuses.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
