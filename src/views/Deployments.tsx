import { useEffect, useState } from "react";

import ExportDropdown from "../components/ExportDropdown";
import Select from "../components/Select";
import { StatTile, StatTileRow } from "../components/StatTile";
import { listDeployments } from "../services/deployments";
import { downloadDeploymentsExport } from "../services/exports";
import type { Deployment, DeploymentStatus } from "../types/deployment";

interface Props {
  onSelect: (id: number) => void;
  onCreate: () => void;
}

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  planning: "Planning",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusBadgeClass(s: DeploymentStatus): string {
  switch (s) {
    case "completed":
      return "badge badge-success";
    case "cancelled":
      return "badge badge-danger";
    case "in_progress":
      return "badge badge-soft";
    default:
      return "badge";
  }
}

export default function Deployments({ onSelect, onCreate }: Props) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  // All active deployments (any status) — powers the stat tiles independent of filters.
  const [allActive, setAllActive] = useState<Deployment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const reload = async () => {
    try {
      const data = await listDeployments({
        status: statusFilter || undefined,
        q: q || undefined,
        archived: showArchived,
        limit: 200,
      });
      setDeployments(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void reload();
  }, [statusFilter, showArchived]);

  // Stats over all active (non-archived) deployments, unaffected by filters.
  useEffect(() => {
    void listDeployments({ archived: false, limit: 500 })
      .then(setAllActive)
      .catch(() => setAllActive([]));
  }, []);

  const stats = {
    total: allActive.length,
    planning: allActive.filter((d) => d.status === "planning").length,
    in_progress: allActive.filter((d) => d.status === "in_progress").length,
    completed: allActive.filter((d) => d.status === "completed").length,
  };

  return (
    <div className="stack-lg">
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <h2 className="heading-2">Deployments</h2>
        <div className="cluster" style={{ gap: "0.5rem" }}>
          <ExportDropdown
            entityName="deployments"
            onExport={(fmt) =>
              downloadDeploymentsExport(
                {
                  status_q: statusFilter || undefined,
                  q: q || undefined,
                },
                fmt,
              )
            }
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onCreate}
          >
            New deployment
          </button>
        </div>
      </div>

      <StatTileRow>
        <StatTile label="Active deployments" value={stats.total} tone="neutral" />
        <StatTile label="Planning" value={stats.planning} tone="neutral" />
        <StatTile label="In progress" value={stats.in_progress} tone="warning" />
        <StatTile label="Completed" value={stats.completed} tone="success" />
      </StatTileRow>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search name / city"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void reload()}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All states"
          options={[
            { value: "", label: "All states" },
            { value: "planning", label: "Planning" },
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void reload()}
        >
          Search
        </button>
        <label
          className="cluster text-sm text-text-muted cursor-pointer"
          style={{ gap: "0.4rem" }}
        >
          <input
            type="checkbox"
            className="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Target</th>
                <th>Items</th>
                <th>Shipments</th>
                <th>State</th>
                <th>Target date</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr
                  key={d.id}
                  className="row-clickable"
                  onClick={() => onSelect(d.id)}
                >
                  <td>{d.name}</td>
                  <td>{d.type ?? "—"}</td>
                  <td className="text-muted">
                    {d.target_city ?? "—"}
                    {d.target_state ? `, ${d.target_state}` : ""}
                  </td>
                  <td>{d.items.length}</td>
                  <td>{d.shipments.length}</td>
                  <td>
                    <span className={statusBadgeClass(d.status)}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td className="text-muted">
                    {d.target_date
                      ? new Date(d.target_date).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deployments.length === 0 && (
          <p className="text-muted text-sm p-4">No deployments.</p>
        )}
      </div>
    </div>
  );
}
