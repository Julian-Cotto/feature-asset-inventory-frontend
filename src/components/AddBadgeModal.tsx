/** Add-badge modal — creates an Axis user + credential pair on the chosen
 *  controller and mirrors the new badge locally. Token is allocated by
 *  the backend (`max(existing integer tokens) + 1`). */

import { useEffect, useMemo, useState } from "react";
import { IdCard, Plus, X } from "lucide-react";

import { useToast } from "./ToastProvider";
import {
  createBadge,
  listAccessProfiles,
  type AccessProfile,
  type AxisController,
  type Badge,
} from "../services/badges";

interface Props {
  open: boolean;
  controllers: AxisController[];
  onClose: () => void;
  onCreated: (badge: Badge) => void;
}

export default function AddBadgeModal({
  open,
  controllers,
  onClose,
  onCreated,
}: Props) {
  const toast = useToast();
  const configured = useMemo(
    () => controllers.filter((c) => c.configured),
    [controllers],
  );

  const [controllerId, setControllerId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cardNr, setCardNr] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [pin, setPin] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [profilesCache, setProfilesCache] = useState<AccessProfile[]>([]);
  const [pickedProfiles, setPickedProfiles] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the first configured controller when the modal opens.
  useEffect(() => {
    if (!open) return;
    if (configured.length > 0 && !controllerId) {
      setControllerId(configured[0].id);
    }
  }, [open, configured, controllerId]);

  // Lazy-load access profiles when modal opens.
  useEffect(() => {
    if (!open) return;
    void listAccessProfiles()
      .then((rows) => {
        setProfilesCache(rows);
        // Default-pick "24x7x365" (token "1") if present and nothing else
        // picked — most credentials use it.
        if (pickedProfiles.size === 0 && rows.some((p) => p.token === "1")) {
          setPickedProfiles(new Set(["1"]));
        }
      })
      .catch(() => setProfilesCache([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setFirstName("");
    setLastName("");
    setCardNr("");
    setFacilityCode("");
    setPin("");
    setDescription("");
    setEnabled(true);
    setPickedProfiles(new Set());
    setError(null);
  }

  function toggleProfile(token: string) {
    setPickedProfiles((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!controllerId) {
      const msg = "Pick a controller.";
      setError(msg);
      toast.notify({ kind: "warning", title: "Missing field", detail: msg });
      return;
    }
    if (
      !firstName.trim() &&
      !lastName.trim() &&
      !cardNr.trim() &&
      !pin.trim()
    ) {
      const msg = "Enter a name and/or a card number / PIN.";
      setError(msg);
      toast.notify({ kind: "warning", title: "Missing field", detail: msg });
      return;
    }
    setSaving(true);
    try {
      const created = await createBadge({
        controller_id: controllerId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        card_nr: cardNr.trim() || null,
        facility_code: facilityCode.trim() || null,
        pin: pin.trim() || null,
        description: description.trim() || null,
        enabled,
        access_profile_tokens: Array.from(pickedProfiles),
      });
      toast.notify({
        kind: "success",
        title: "Badge created",
        detail: `Token ${created.axis_token} on ${created.controller_label ?? created.controller_id}`,
      });
      reset();
      onCreated(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.notify({
        kind: "danger",
        title: "Create failed",
        detail: msg,
      });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        className="card stack"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(40rem, 100%)",
          maxHeight: "calc(100vh - 4rem)",
          overflow: "auto",
          padding: "1.5rem",
          gap: "1rem",
        }}
      >
        <div
          className="cluster"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <div className="cluster" style={{ gap: "0.5rem", alignItems: "center" }}>
            <IdCard size={18} />
            <h3 className="heading-3" style={{ margin: 0 }}>
              Add badge
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Creates a new user record and credential on the chosen Axis
          controller. The token is auto-allocated.
        </p>

        {/* Controller picker */}
        <div className="stack" style={{ gap: 4 }}>
          <label className="label text-xs">Controller</label>
          {configured.length === 0 ? (
            <p className="text-muted text-sm">
              No controllers configured. Set FRONT_AXIS_URL/USER/PASSWORD or
              BACK_AXIS_URL/USER/PASSWORD on the backend.
            </p>
          ) : (
            <div className="cluster" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
              {configured.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={
                    controllerId === c.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"
                  }
                  onClick={() => setControllerId(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Identity */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">First name</label>
            <input
              className="input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Steve"
              autoFocus
            />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Last name</label>
            <input
              className="input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Barker"
            />
          </div>
        </div>

        {/* Card / PIN */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Card number</label>
            <input
              className="input font-mono"
              value={cardNr}
              onChange={(e) => setCardNr(e.target.value.replace(/\D+/g, ""))}
              placeholder="47486"
              inputMode="numeric"
            />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">Facility code</label>
            <input
              className="input font-mono"
              value={facilityCode}
              onChange={(e) =>
                setFacilityCode(e.target.value.replace(/\D+/g, ""))
              }
              placeholder="2182"
              inputMode="numeric"
            />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="label text-xs">PIN (optional)</label>
            <input
              className="input font-mono"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D+/g, ""))}
              placeholder="1234"
              inputMode="numeric"
            />
          </div>
        </div>

        {/* Description */}
        <div className="stack" style={{ gap: 4 }}>
          <label className="label text-xs">Description (optional)</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Visitor — expires Fri"
          />
        </div>

        {/* Access profiles */}
        <div className="stack" style={{ gap: 4 }}>
          <label className="label text-xs">
            Access profiles{" "}
            <span className="text-muted">
              · controls when this badge can open which door
            </span>
          </label>
          {profilesCache.length === 0 ? (
            <p className="text-muted text-sm">
              Sync hasn't populated profiles yet — leaving empty grants no
              access until you assign one.
            </p>
          ) : (
            <div className="cluster" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
              {profilesCache.map((p) => {
                const picked = pickedProfiles.has(p.token);
                return (
                  <button
                    key={p.token}
                    type="button"
                    onClick={() => toggleProfile(p.token)}
                    title={p.description ?? undefined}
                    className="badge"
                    style={{
                      cursor: "pointer",
                      padding: "4px 10px",
                      fontSize: "0.75rem",
                      background: picked
                        ? "rgb(from rgb(var(--color-primary)) r g b / 0.2)"
                        : "transparent",
                      color: picked
                        ? "rgb(var(--color-primary))"
                        : "rgb(var(--color-text))",
                      border: `1px solid ${picked ? "rgb(var(--color-primary))" : "rgb(var(--color-border) / 0.6)"}`,
                    }}
                  >
                    {p.name ?? p.token}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label
          className="cluster text-sm"
          style={{ gap: 6, alignItems: "center" }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled (badge can be used immediately)
        </label>

        {error && <div className="alert alert-error">{error}</div>}

        <div
          className="cluster"
          style={{ justifyContent: "flex-end", gap: "0.5rem" }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void submit()}
            disabled={saving || configured.length === 0}
          >
            <Plus size={14} />
            {saving ? "Creating…" : "Create badge"}
          </button>
        </div>
      </div>
    </div>
  );
}
