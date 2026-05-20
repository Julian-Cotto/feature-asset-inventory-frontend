import { useEffect, useRef, useState } from "react";
import { Pin, PinOff } from "lucide-react";

import { useFeatureAuth } from "./platform/authProvider";
import { getShellRuntimeContext } from "./platform/shellContext";
import AssetDetail from "./views/AssetDetail";
import AssetsList from "./views/AssetsList";
import DeploymentCreate from "./views/DeploymentCreate";
import DeploymentDetail from "./views/DeploymentDetail";
import Deployments from "./views/Deployments";
import Locations from "./views/Locations";
import OnboardAsset from "./views/OnboardAsset";
import Reports from "./views/Reports";
import ReservationDetail from "./views/ReservationDetail";
import Reservations from "./views/Reservations";
import ShipmentCreate from "./views/ShipmentCreate";
import ShipmentDetail from "./views/ShipmentDetail";
import Shipments from "./views/Shipments";
import GroupDetailView from "./views/GroupDetail";
import Groups from "./views/Groups";
import NetworkDetail from "./views/NetworkDetail";
import Networks from "./views/Networks";
import Software from "./views/Software";
import SoftwareDetail from "./views/SoftwareDetail";
import Statuses from "./views/Statuses";
import EnrollEmployee from "./views/EnrollEmployee";
import UserDetail from "./views/UserDetail";
import Users from "./views/Users";
import Wallboard from "./views/Wallboard";

const FEATURE_NAME = "IT Asset Inventory";

type View =
  | { kind: "dashboard" }
  | { kind: "assets"; statusCode?: string }
  | { kind: "asset"; id: number }
  | { kind: "onboard" }
  | { kind: "reservations" }
  | { kind: "reservation"; row: import("./types/inventory").ReservationRow }
  | { kind: "shipments" }
  | { kind: "shipment"; id: number }
  | { kind: "shipment-create" }
  | { kind: "deployments" }
  | { kind: "deployment"; id: number }
  | { kind: "deployment-create" }
  | { kind: "locations" }
  | { kind: "statuses" }
  | { kind: "users" }
  | { kind: "user"; id: string }
  | { kind: "enroll"; upn?: string }
  | { kind: "software" }
  | { kind: "software-item"; id: number }
  | { kind: "groups" }
  | { kind: "group"; id: string }
  | { kind: "networks" }
  | { kind: "network"; id: number }
  | { kind: "wallboard" };

type TabKind =
  | "dashboard"
  | "assets"
  | "onboard"
  | "reservations"
  | "deployments"
  | "shipments"
  | "users"
  | "software"
  | "groups"
  | "networks"
  | "locations"
  | "statuses";

const TABS: { kind: TabKind; label: string; admin?: boolean }[] = [
  { kind: "dashboard", label: "Dashboard" },
  { kind: "assets", label: "Assets" },
  { kind: "onboard", label: "Onboard" },
  { kind: "reservations", label: "Reservations" },
  { kind: "deployments", label: "Deployments" },
  { kind: "shipments", label: "Shipments" },
  { kind: "users", label: "Users" },
  { kind: "software", label: "Software" },
  { kind: "groups", label: "Groups" },
  { kind: "networks", label: "Networks" },
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
    "reservations",
    "deployments",
    "shipments",
    "users",
    "software",
    "groups",
    "networks",
    "locations",
    "statuses",
  ];
  return valid.includes(raw as TabKind) ? (raw as TabKind) : "dashboard";
}

/** Map a (possibly nested) view back to its parent tab. Used so pinning
 *  while on AssetDetail pins "assets", not the unreachable "asset" kind. */
function viewToTabKind(view: View): TabKind {
  if (view.kind === "asset") return "assets";
  if (view.kind === "reservation") return "reservations";
  if (view.kind === "shipment" || view.kind === "shipment-create") return "shipments";
  if (view.kind === "deployment" || view.kind === "deployment-create")
    return "deployments";
  if (view.kind === "user") return "users";
  if (view.kind === "enroll") return "users";
  if (view.kind === "software-item") return "software";
  if (view.kind === "group") return "groups";
  if (view.kind === "network") return "networks";
  return view.kind as TabKind;
}

function viewToPath(view: View): string {
  switch (view.kind) {
    case "dashboard":
      return "/";
    case "assets":
      return view.statusCode
        ? `/assets?status=${encodeURIComponent(view.statusCode)}`
        : "/assets";
    case "asset":
      return `/assets/${view.id}`;
    case "onboard":
      return "/onboard";
    case "reservations":
      return "/reservations";
    // Reservation detail carries a non-serializable row object — not
    // directly deeplinkable. URL stays at the list.
    case "reservation":
      return "/reservations";
    case "shipments":
      return "/shipments";
    case "shipment":
      return `/shipments/${view.id}`;
    case "shipment-create":
      return "/shipments/new";
    case "deployments":
      return "/deployments";
    case "deployment":
      return `/deployments/${view.id}`;
    case "deployment-create":
      return "/deployments/new";
    case "locations":
      return "/locations";
    case "statuses":
      return "/statuses";
    case "users":
      return "/users";
    case "user":
      return `/users/${encodeURIComponent(view.id)}`;
    case "enroll":
      return view.upn
        ? `/enroll/${encodeURIComponent(view.upn)}`
        : "/enroll";
    case "software":
      return "/software";
    case "software-item":
      return `/software/${view.id}`;
    case "groups":
      return "/groups";
    case "group":
      return `/groups/${encodeURIComponent(view.id)}`;
    case "networks":
      return "/networks";
    case "network":
      return `/networks/${view.id}`;
    case "wallboard":
      return "/wallboard";
  }
}

function pathToView(subPath: string, fallbackTab: TabKind): View {
  if (!subPath || subPath === "/") {
    return { kind: fallbackTab } as View;
  }

  const [pathOnly, search] = subPath.split("?");
  const segments = pathOnly.split("/").filter(Boolean);
  const [first, second] = segments;

  switch (first) {
    case undefined:
      return { kind: fallbackTab } as View;
    case "dashboard":
      return { kind: "dashboard" };
    case "assets": {
      if (!second) {
        const params = new URLSearchParams(search ?? "");
        const status = params.get("status") ?? undefined;
        return status
          ? { kind: "assets", statusCode: status }
          : { kind: "assets" };
      }
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "asset", id }
        : { kind: "assets" };
    }
    case "onboard":
      return { kind: "onboard" };
    case "reservations":
      return { kind: "reservations" };
    case "shipments": {
      if (!second) return { kind: "shipments" };
      if (second === "new") return { kind: "shipment-create" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "shipment", id }
        : { kind: "shipments" };
    }
    case "deployments": {
      if (!second) return { kind: "deployments" };
      if (second === "new") return { kind: "deployment-create" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "deployment", id }
        : { kind: "deployments" };
    }
    case "locations":
      return { kind: "locations" };
    case "statuses":
      return { kind: "statuses" };
    case "users":
      if (!second) return { kind: "users" };
      return { kind: "user", id: decodeURIComponent(second) };
    case "enroll":
      return second
        ? { kind: "enroll", upn: decodeURIComponent(second) }
        : { kind: "enroll" };
    case "software": {
      if (!second) return { kind: "software" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "software-item", id }
        : { kind: "software" };
    }
    case "groups":
      if (!second) return { kind: "groups" };
      return { kind: "group", id: decodeURIComponent(second) };
    case "networks": {
      if (!second) return { kind: "networks" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "network", id }
        : { kind: "networks" };
    }
    case "wallboard":
      return { kind: "wallboard" };
    default:
      return { kind: fallbackTab } as View;
  }
}

export default function App() {
  const auth = useFeatureAuth();
  const [defaultKind, setDefaultKind] = useState<TabKind>(readDefaultViewKind);

  const runtimeRef = useRef(getShellRuntimeContext());
  const initialSubPath = runtimeRef.current?.subPath ?? "";

  const [view, setView] = useState<View>(() =>
    pathToView(initialSubPath, readDefaultViewKind()),
  );
  // Track what URL the shell currently has so we don't push duplicate
  // history entries when the view changes without a path change.
  const currentPathRef = useRef<string>(initialSubPath || "/");

  function navigate(next: View, options?: { replace?: boolean }): void {
    const nextPath = viewToPath(next);
    const runtime = runtimeRef.current;
    if (runtime?.navigate && nextPath !== currentPathRef.current) {
      runtime.navigate(nextPath, options);
    }
    currentPathRef.current = nextPath;
    setView(next);
  }

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.onSubPathChange) return;

    const unsubscribe = runtime.onSubPathChange((subPath) => {
      const nextView = pathToView(subPath, readDefaultViewKind());
      currentPathRef.current = subPath || "/";
      setView(nextView);
    });

    return unsubscribe;
  }, []);

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

  // Wallboard takes over the viewport — render bare, no header/tabs/feature
  // chrome. The wallboard component handles its own escape navigation.
  if (view.kind === "wallboard") {
    return <Wallboard onExit={() => navigate({ kind: "dashboard" })} />;
  }

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
                onClick={() => navigate({ kind: t.kind } as View)}
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
        <Reports
          onStatusClick={(statusCode) => navigate({ kind: "assets", statusCode })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSoftwareClick={(id) => navigate({ kind: "software-item", id })}
          onGroupClick={(id) => navigate({ kind: "group", id })}
          onUserClick={(id) => navigate({ kind: "user", id })}
          onLaunchWallboard={() => navigate({ kind: "wallboard" })}
        />
      )}
      {view.kind === "assets" && (
        <AssetsList
          onSelect={(id) => navigate({ kind: "asset", id })}
          initialStatusCode={view.statusCode}
          onNetworkClick={(id) => navigate({ kind: "network", id })}
        />
      )}
      {view.kind === "asset" && (
        <AssetDetail
          assetId={view.id}
          onBack={() => navigate({ kind: "assets" })}
          onNetworkClick={(id) => navigate({ kind: "network", id })}
        />
      )}
      {view.kind === "onboard" && (
        <OnboardAsset
          onCreated={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "reservations" && (
        <Reservations
          onSelect={(row) => navigate({ kind: "reservation", row })}
          onDeploymentClick={(id) => navigate({ kind: "deployment", id })}
          onShipmentClick={(id) => navigate({ kind: "shipment", id })}
        />
      )}
      {view.kind === "reservation" && (
        <ReservationDetail
          row={view.row}
          onBack={() => navigate({ kind: "reservations" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onDeploymentClick={(id) => navigate({ kind: "deployment", id })}
          onShipmentClick={(id) => navigate({ kind: "shipment", id })}
        />
      )}
      {view.kind === "shipments" && (
        <Shipments
          onSelect={(id) => navigate({ kind: "shipment", id })}
          onCreate={() => navigate({ kind: "shipment-create" })}
        />
      )}
      {view.kind === "shipment" && (
        <ShipmentDetail
          shipmentId={view.id}
          onBack={() => navigate({ kind: "shipments" })}
        />
      )}
      {view.kind === "shipment-create" && (
        <ShipmentCreate
          onCreated={(id) => navigate({ kind: "shipment", id })}
          onCancel={() => navigate({ kind: "shipments" })}
        />
      )}
      {view.kind === "deployments" && (
        <Deployments
          onSelect={(id) => navigate({ kind: "deployment", id })}
          onCreate={() => navigate({ kind: "deployment-create" })}
        />
      )}
      {view.kind === "deployment" && (
        <DeploymentDetail
          deploymentId={view.id}
          onBack={() => navigate({ kind: "deployments" })}
          onShipmentClick={(id) => navigate({ kind: "shipment", id })}
        />
      )}
      {view.kind === "deployment-create" && (
        <DeploymentCreate
          onCreated={(id) => navigate({ kind: "deployment", id })}
          onCancel={() => navigate({ kind: "deployments" })}
        />
      )}
      {view.kind === "locations" && <Locations />}
      {view.kind === "statuses" && <Statuses />}
      {view.kind === "users" && (
        <Users
          onSelect={(id) => navigate({ kind: "user", id })}
          onEnroll={() => navigate({ kind: "enroll" })}
        />
      )}
      {view.kind === "user" && (
        <UserDetail
          userId={view.id}
          onBack={() => navigate({ kind: "users" })}
        />
      )}
      {view.kind === "enroll" && (
        <EnrollEmployee
          initialUpn={view.upn}
          onBack={() => navigate({ kind: "users" })}
          onOpenUser={(id) => navigate({ kind: "user", id })}
          onOpenSoftware={(id) => navigate({ kind: "software-item", id })}
          onOpenAsset={(id) => navigate({ kind: "asset", id })}
          onUpnChanged={(upn) =>
            navigate({ kind: "enroll", upn }, { replace: true })
          }
        />
      )}
      {view.kind === "software" && (
        <Software onSelect={(id) => navigate({ kind: "software-item", id })} />
      )}
      {view.kind === "software-item" && (
        <SoftwareDetail
          softwareId={view.id}
          onBack={() => navigate({ kind: "software" })}
        />
      )}
      {view.kind === "groups" && (
        <Groups onSelect={(id) => navigate({ kind: "group", id })} />
      )}
      {view.kind === "group" && (
        <GroupDetailView
          groupId={view.id}
          onBack={() => navigate({ kind: "groups" })}
          onOpenSoftware={(id) => navigate({ kind: "software-item", id })}
        />
      )}
      {view.kind === "networks" && (
        <Networks onSelect={(id) => navigate({ kind: "network", id })} />
      )}
      {view.kind === "network" && (
        <NetworkDetail
          networkId={view.id}
          onBack={() => navigate({ kind: "networks" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
    </div>
  );
}
