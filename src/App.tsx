import { useEffect, useState } from "react";
import { Pin, PinOff } from "lucide-react";

import { useFeatureAuth } from "./platform/authProvider";
import AssetDetail from "./views/AssetDetail";
import AssetsList from "./views/AssetsList";
import Dashboard from "./views/Dashboard";
import DeploymentCreate from "./views/DeploymentCreate";
import DeploymentDetail from "./views/DeploymentDetail";
import Deployments from "./views/Deployments";
import Locations from "./views/Locations";
import OnboardAsset from "./views/OnboardAsset";
import ShipmentCreate from "./views/ShipmentCreate";
import ShipmentDetail from "./views/ShipmentDetail";
import Shipments from "./views/Shipments";
import Statuses from "./views/Statuses";

const FEATURE_NAME = "IT Asset Inventory";

type View =
  | { kind: "dashboard" }
  | { kind: "assets"; statusCode?: string }
  | { kind: "asset"; id: number }
  | { kind: "onboard" }
  | { kind: "shipments" }
  | { kind: "shipment"; id: number }
  | { kind: "shipment-create" }
  | { kind: "deployments" }
  | { kind: "deployment"; id: number }
  | { kind: "deployment-create" }
  | { kind: "locations" }
  | { kind: "statuses" };

type TabKind =
  | "dashboard"
  | "assets"
  | "onboard"
  | "deployments"
  | "shipments"
  | "locations"
  | "statuses";

const TABS: { kind: TabKind; label: string; admin?: boolean }[] = [
  { kind: "dashboard", label: "Dashboard" },
  { kind: "assets", label: "Assets" },
  { kind: "onboard", label: "Onboard" },
  { kind: "deployments", label: "Deployments" },
  { kind: "shipments", label: "Shipments" },
  { kind: "locations", label: "Locations", admin: true },
  { kind: "statuses", label: "Statuses", admin: true },
];

const DEFAULT_VIEW_KEY = "feature-asset-inventory:default-view";

function readDefaultViewKind(): TabKind {
  if (typeof window === "undefined") return "dashboard";
  const raw = window.localStorage.getItem(DEFAULT_VIEW_KEY);
  const valid: TabKind[] = [
    "dashboard",
    "assets",
    "onboard",
    "deployments",
    "shipments",
    "locations",
    "statuses",
  ];
  return valid.includes(raw as TabKind) ? (raw as TabKind) : "dashboard";
}

/** Map a (possibly nested) view back to its parent tab. Used so pinning
 *  while on AssetDetail pins "assets", not the unreachable "asset" kind. */
function viewToTabKind(view: View): TabKind {
  if (view.kind === "asset") return "assets";
  if (view.kind === "shipment" || view.kind === "shipment-create") return "shipments";
  if (view.kind === "deployment" || view.kind === "deployment-create")
    return "deployments";
  return view.kind as TabKind;
}

export default function App() {
  const auth = useFeatureAuth();
  const [defaultKind, setDefaultKind] = useState<TabKind>(readDefaultViewKind);
  const [view, setView] = useState<View>(() => ({
    kind: readDefaultViewKind(),
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DEFAULT_VIEW_KEY, defaultKind);
  }, [defaultKind]);

  const currentTabKind = viewToTabKind(view);
  const isPinned = currentTabKind === defaultKind;
  const togglePin = () => {
    setDefaultKind(isPinned ? "dashboard" : currentTabKind);
  };

  if (!auth.isAuthenticated && auth.authMode === "entra") {
    return (
      <div>
        <h1>{FEATURE_NAME}</h1>
        <p>This feature requires shell authentication.</p>
      </div>
    );
  }

  const isAdmin =
    auth.roles?.includes("admin") ||
    auth.permissions?.includes("asset-inventory.manage") ||
    auth.permissions?.includes("*");

  const tabs = TABS.filter((t) => !t.admin || isAdmin);

  return (
    <div className="stack-lg">
      <header className="stack">
        <h1 className="heading-1">{FEATURE_NAME}</h1>
        <p className="text-muted text-sm">
          Signed in as {auth.userName ?? auth.email ?? "unknown"}
        </p>
      </header>

      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <nav className="tabs">
          {tabs.map((t) => {
            const active = currentTabKind === t.kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => setView({ kind: t.kind } as View)}
                className={active ? "tab tab-active" : "tab"}
              >
                {t.label}
                {defaultKind === t.kind && (
                  <Pin
                    size={11}
                    className="ml-1 inline-block fill-current"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={togglePin}
          className="btn btn-ghost btn-sm"
          title={
            isPinned
              ? "Currently your default view (click to unpin)"
              : "Set this view as default"
          }
        >
          {isPinned ? (
            <>
              <Pin size={14} className="fill-current" />
              Default
            </>
          ) : (
            <>
              <PinOff size={14} />
              Set default
            </>
          )}
        </button>
      </div>

      {view.kind === "dashboard" && (
        <Dashboard
          onStatusClick={(statusCode) => setView({ kind: "assets", statusCode })}
          onAssetClick={(id) => setView({ kind: "asset", id })}
        />
      )}
      {view.kind === "assets" && (
        <AssetsList
          onSelect={(id) => setView({ kind: "asset", id })}
          initialStatusCode={view.statusCode}
        />
      )}
      {view.kind === "asset" && (
        <AssetDetail
          assetId={view.id}
          onBack={() => setView({ kind: "assets" })}
        />
      )}
      {view.kind === "onboard" && (
        <OnboardAsset
          onCreated={(id) => setView({ kind: "asset", id })}
        />
      )}
      {view.kind === "shipments" && (
        <Shipments
          onSelect={(id) => setView({ kind: "shipment", id })}
          onCreate={() => setView({ kind: "shipment-create" })}
        />
      )}
      {view.kind === "shipment" && (
        <ShipmentDetail
          shipmentId={view.id}
          onBack={() => setView({ kind: "shipments" })}
        />
      )}
      {view.kind === "shipment-create" && (
        <ShipmentCreate
          onCreated={(id) => setView({ kind: "shipment", id })}
          onCancel={() => setView({ kind: "shipments" })}
        />
      )}
      {view.kind === "deployments" && (
        <Deployments
          onSelect={(id) => setView({ kind: "deployment", id })}
          onCreate={() => setView({ kind: "deployment-create" })}
        />
      )}
      {view.kind === "deployment" && (
        <DeploymentDetail
          deploymentId={view.id}
          onBack={() => setView({ kind: "deployments" })}
          onShipmentClick={(id) => setView({ kind: "shipment", id })}
        />
      )}
      {view.kind === "deployment-create" && (
        <DeploymentCreate
          onCreated={(id) => setView({ kind: "deployment", id })}
          onCancel={() => setView({ kind: "deployments" })}
        />
      )}
      {view.kind === "locations" && <Locations />}
      {view.kind === "statuses" && <Statuses />}
    </div>
  );
}
