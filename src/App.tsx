import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClockAlert,
  CreditCard,
  Globe,
  IdCard,
  Laptop,
  LayoutDashboard,
  MapPin,
  MonitorPlay,
  Network as NetworkIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Pin,
  PinOff,
  Radio,
  Rocket,
  Table2,
  Tags,
  Trash2,
  Truck,
  Users as UsersIcon,
  UsersRound,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Handshake } from "lucide-react";

import { useFeatureAuth } from "./platform/authProvider";
import { getShellRuntimeContext } from "./platform/shellContext";
import AssetDetail from "./views/AssetDetail";
import AssetsList from "./views/AssetsList";
import BadgeDetail from "./views/BadgeDetail";
import Badges from "./views/Badges";
import Controllers from "./views/Controllers";
import DeploymentCreate from "./views/DeploymentCreate";
import DeploymentDetail from "./views/DeploymentDetail";
import Deployments from "./views/Deployments";
import LocationDetail from "./views/LocationDetail";
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
import Sims from "./views/Sims";
import SimDetail from "./views/SimDetail";
import Repairs from "./views/Repairs";
import RepairDetail from "./views/RepairDetail";
import Transfers from "./views/Transfers";
import TransferDetail from "./views/TransferDetail";
import Disposals from "./views/Disposals";
import DisposalDetail from "./views/DisposalDetail";
import Loaners from "./views/Loaners";
import LoanDetail from "./views/LoanDetail";
import Replenishment from "./views/Replenishment";
import Receiving from "./views/Receiving";
import CheckinExceptions from "./views/CheckinExceptions";
import OffsiteDevices from "./views/OffsiteDevices";
import NamingMismatches from "./views/NamingMismatches";
import Software from "./views/Software";
import SoftwareByCompany from "./views/SoftwareByCompany";
import SoftwareDetail from "./views/SoftwareDetail";
import Statuses from "./views/Statuses";
import EnrollEmployee from "./views/EnrollEmployee";
import OffboardEmployee from "./views/OffboardEmployee";
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
  | { kind: "location"; id: number }
  | { kind: "statuses" }
  | { kind: "users" }
  | { kind: "user"; id: string }
  | { kind: "enroll"; upn?: string }
  | { kind: "offboard"; upn?: string }
  | { kind: "software" }
  | { kind: "software-item"; id: number }
  | { kind: "software-matrix" }
  | { kind: "groups" }
  | { kind: "group"; id: string }
  | { kind: "checkins" }
  | { kind: "offsite" }
  | { kind: "naming" }
  | { kind: "networks" }
  | { kind: "network"; id: number }
  | { kind: "sims" }
  | { kind: "sim"; id: number }
  | { kind: "repairs" }
  | { kind: "repair"; id: number }
  | { kind: "transfers" }
  | { kind: "transfer"; id: number }
  | { kind: "disposals" }
  | { kind: "disposal"; id: number }
  | { kind: "loaners" }
  | { kind: "loan"; id: number }
  | { kind: "replenishment" }
  | { kind: "receiving" }
  | { kind: "badges" }
  | { kind: "badge"; token: string }
  | { kind: "controllers" }
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
  | "software-matrix"
  | "groups"
  | "checkins"
  | "offsite"
  | "naming"
  | "networks"
  | "sims"
  | "repairs"
  | "transfers"
  | "disposals"
  | "loaners"
  | "replenishment"
  | "receiving"
  | "badges"
  | "controllers"
  | "locations"
  | "statuses"
  | "wallboard";

// ── Domain-first sidebar taxonomy ──────────────────────────────────────
// Each section groups related tabs; a section may carry labelled subgroups
// (used by Inventory to split physical vs virtual). Deep-link paths and the
// underlying views are unchanged — this is purely a navigation shell.
interface NavItem {
  kind: TabKind;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
}
interface NavSubgroup {
  label?: string;
  items: NavItem[];
}
interface NavSection {
  label: string;
  groups: NavSubgroup[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    groups: [
      {
        items: [
          { kind: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { kind: "wallboard", label: "Wallboard", icon: MonitorPlay },
        ],
      },
    ],
  },
  {
    label: "Inventory",
    groups: [
      {
        label: "Physical",
        items: [
          { kind: "assets", label: "Assets", icon: Laptop },
          { kind: "sims", label: "SIM cards", icon: Radio },
        ],
      },
      {
        label: "Virtual",
        items: [
          { kind: "software", label: "Software", icon: Boxes },
          { kind: "software-matrix", label: "By company", icon: Table2 },
        ],
      },
    ],
  },
  {
    label: "People",
    groups: [
      {
        items: [
          { kind: "users", label: "Users", icon: UsersIcon },
          { kind: "groups", label: "Groups", icon: UsersRound },
        ],
      },
    ],
  },
  {
    label: "Compliance",
    groups: [
      {
        items: [
          { kind: "checkins", label: "Check-ins", icon: ClockAlert },
          { kind: "offsite", label: "Offsite", icon: Globe },
          { kind: "naming", label: "Naming", icon: UserX },
        ],
      },
    ],
  },
  {
    label: "Logistics",
    groups: [
      {
        label: "Intake",
        items: [
          { kind: "onboard", label: "Onboard", icon: PackagePlus },
          { kind: "receiving", label: "Receiving", icon: PackageCheck },
        ],
      },
      {
        label: "Fulfilment",
        items: [
          { kind: "reservations", label: "Reservations", icon: CalendarClock },
          { kind: "deployments", label: "Deployments", icon: Rocket },
          { kind: "transfers", label: "Transfers", icon: ArrowLeftRight },
          { kind: "shipments", label: "Shipments", icon: Truck },
        ],
      },
      {
        label: "Lifecycle",
        items: [
          { kind: "repairs", label: "Repairs", icon: Wrench },
          { kind: "loaners", label: "Loaners", icon: Handshake },
          { kind: "disposals", label: "Disposals", icon: Trash2 },
        ],
      },
      {
        label: "Planning",
        items: [{ kind: "replenishment", label: "Replenishment", icon: PackageSearch }],
      },
    ],
  },
  {
    label: "Infrastructure",
    groups: [
      {
        items: [
          { kind: "networks", label: "Networks (Meraki)", icon: NetworkIcon },
          { kind: "controllers", label: "Access Control (Axis)", icon: IdCard },
          { kind: "badges", label: "Badges", icon: CreditCard },
        ],
      },
    ],
  },
  {
    label: "Admin",
    groups: [
      {
        items: [
          { kind: "locations", label: "Locations", icon: MapPin, admin: true },
          { kind: "statuses", label: "Statuses", icon: Tags, admin: true },
        ],
      },
    ],
  },
];

const NAV_COLLAPSE_KEY = "feature-asset-inventory:nav-collapsed";

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
    "software-matrix",
    "groups",
    "checkins",
    "offsite",
    "naming",
    "networks",
    "sims",
    "repairs",
    "transfers",
    "disposals",
    "loaners",
    "replenishment",
    "receiving",
    "badges",
    "controllers",
    "locations",
    "statuses",
    "wallboard",
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
  if (view.kind === "offboard") return "users";
  if (view.kind === "software-item") return "software";
  if (view.kind === "group") return "groups";
  if (view.kind === "network") return "networks";
  if (view.kind === "sim") return "sims";
  if (view.kind === "repair") return "repairs";
  if (view.kind === "transfer") return "transfers";
  if (view.kind === "disposal") return "disposals";
  if (view.kind === "loan") return "loaners";
  if (view.kind === "badge") return "badges";
  if (view.kind === "location") return "locations";
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
    case "location":
      return `/locations/${view.id}`;
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
    case "offboard":
      return view.upn
        ? `/offboard/${encodeURIComponent(view.upn)}`
        : "/offboard";
    case "software":
      return "/software";
    case "software-item":
      return `/software/${view.id}`;
    case "software-matrix":
      return "/software-by-company";
    case "groups":
      return "/groups";
    case "group":
      return `/groups/${encodeURIComponent(view.id)}`;
    case "checkins":
      return "/checkins";
    case "offsite":
      return "/offsite";
    case "naming":
      return "/naming";
    case "networks":
      return "/networks";
    case "network":
      return `/networks/${view.id}`;
    case "sims":
      return "/sims";
    case "sim":
      return `/sims/${view.id}`;
    case "repairs":
      return "/repairs";
    case "repair":
      return `/repairs/${view.id}`;
    case "transfers":
      return "/transfers";
    case "transfer":
      return `/transfers/${view.id}`;
    case "disposals":
      return "/disposals";
    case "disposal":
      return `/disposals/${view.id}`;
    case "loaners":
      return "/loaners";
    case "loan":
      return `/loaners/${view.id}`;
    case "replenishment":
      return "/replenishment";
    case "receiving":
      return "/receiving";
    case "badges":
      return "/badges";
    case "badge":
      return `/badges/${encodeURIComponent(view.token)}`;
    case "controllers":
      return "/controllers";
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
    case "locations": {
      if (!second) return { kind: "locations" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "location", id }
        : { kind: "locations" };
    }
    case "statuses":
      return { kind: "statuses" };
    case "users":
      if (!second) return { kind: "users" };
      return { kind: "user", id: decodeURIComponent(second) };
    case "enroll":
      return second
        ? { kind: "enroll", upn: decodeURIComponent(second) }
        : { kind: "enroll" };
    case "offboard":
      return second
        ? { kind: "offboard", upn: decodeURIComponent(second) }
        : { kind: "offboard" };
    case "software": {
      if (!second) return { kind: "software" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "software-item", id }
        : { kind: "software" };
    }
    case "software-by-company":
      return { kind: "software-matrix" };
    case "groups":
      if (!second) return { kind: "groups" };
      return { kind: "group", id: decodeURIComponent(second) };
    case "checkins":
      return { kind: "checkins" };
    case "offsite":
      return { kind: "offsite" };
    case "naming":
      return { kind: "naming" };
    case "networks": {
      if (!second) return { kind: "networks" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "network", id }
        : { kind: "networks" };
    }
    case "sims": {
      if (!second) return { kind: "sims" };
      const id = Number(second);
      return Number.isFinite(id) && id > 0
        ? { kind: "sim", id }
        : { kind: "sims" };
    }
    case "repairs": {
      const id = Number(second);
      return second && Number.isFinite(id) && id > 0
        ? { kind: "repair", id }
        : { kind: "repairs" };
    }
    case "transfers": {
      const id = Number(second);
      return second && Number.isFinite(id) && id > 0
        ? { kind: "transfer", id }
        : { kind: "transfers" };
    }
    case "disposals": {
      const id = Number(second);
      return second && Number.isFinite(id) && id > 0
        ? { kind: "disposal", id }
        : { kind: "disposals" };
    }
    case "loaners": {
      const id = Number(second);
      return second && Number.isFinite(id) && id > 0
        ? { kind: "loan", id }
        : { kind: "loaners" };
    }
    case "replenishment":
      return { kind: "replenishment" };
    case "receiving":
      return { kind: "receiving" };
    case "badges":
      if (!second) return { kind: "badges" };
      return { kind: "badge", token: decodeURIComponent(second) };
    case "controllers":
      return { kind: "controllers" };
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

  // Wallboard takes over the viewport — render bare, no header/tabs/feature
  // chrome. The wallboard component handles its own escape navigation.
  if (view.kind === "wallboard") {
    return <Wallboard onExit={() => navigate({ kind: "dashboard" })} />;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        alignItems: "flex-start",
      }}
    >
      <SideNav
        currentKind={currentTabKind}
        defaultKind={defaultKind}
        isAdmin={isAdmin}
        userName={auth.userName ?? auth.email ?? "unknown"}
        isPinned={isPinned}
        onTogglePin={togglePin}
        onNavigate={(kind) => navigate({ kind } as View)}
      />

      <main className="stack-lg" style={{ flex: 1, minWidth: 0 }}>
      {view.kind === "dashboard" && (
        <Reports
          onStatusClick={(statusCode) => navigate({ kind: "assets", statusCode })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSoftwareClick={(id) => navigate({ kind: "software-item", id })}
          onGroupClick={(id) => navigate({ kind: "group", id })}
          onUserClick={(id) => navigate({ kind: "user", id })}
          onLaunchWallboard={() => navigate({ kind: "wallboard" })}
          onBadgesClick={() => navigate({ kind: "badges" })}
          onOpenSection={(kind) => navigate({ kind } as View)}
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
          onBadgeClick={(token) => navigate({ kind: "badge", token })}
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
      {view.kind === "locations" && (
        <Locations onSelect={(id) => navigate({ kind: "location", id })} />
      )}
      {view.kind === "location" && (
        <LocationDetail
          locationId={view.id}
          onBack={() => navigate({ kind: "locations" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onDeploymentClick={(id) => navigate({ kind: "deployment", id })}
          onShipmentClick={(id) => navigate({ kind: "shipment", id })}
        />
      )}
      {view.kind === "statuses" && <Statuses />}
      {view.kind === "users" && (
        <Users
          onSelect={(id) => navigate({ kind: "user", id })}
          onEnroll={() => navigate({ kind: "enroll" })}
          onOffboard={() => navigate({ kind: "offboard" })}
        />
      )}
      {view.kind === "user" && (
        <UserDetail
          userId={view.id}
          onBack={() => navigate({ kind: "users" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onDeploymentClick={(id) => navigate({ kind: "deployment", id })}
          onShipmentClick={(id) => navigate({ kind: "shipment", id })}
          onEnroll={(upn) => navigate({ kind: "enroll", upn })}
          onOffboard={(upn) => navigate({ kind: "offboard", upn })}
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
      {view.kind === "offboard" && (
        <OffboardEmployee
          initialUpn={view.upn}
          onBack={() => navigate({ kind: "users" })}
          onOpenUser={(id) => navigate({ kind: "user", id })}
          onOpenSoftware={(id) => navigate({ kind: "software-item", id })}
          onOpenAsset={(id) => navigate({ kind: "asset", id })}
          onUpnChanged={(upn) =>
            navigate({ kind: "offboard", upn }, { replace: true })
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
          onGroupClick={(id) => navigate({ kind: "group", id })}
          onUserClick={(id) => navigate({ kind: "user", id })}
        />
      )}
      {view.kind === "software-matrix" && (
        <SoftwareByCompany
          onSoftwareClick={(id) => navigate({ kind: "software-item", id })}
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
          onMemberClick={(id) => navigate({ kind: "user", id })}
        />
      )}
      {view.kind === "checkins" && (
        <CheckinExceptions onAssetClick={(id) => navigate({ kind: "asset", id })} />
      )}
      {view.kind === "offsite" && (
        <OffsiteDevices onAssetClick={(id) => navigate({ kind: "asset", id })} />
      )}
      {view.kind === "naming" && (
        <NamingMismatches onAssetClick={(id) => navigate({ kind: "asset", id })} />
      )}
      {view.kind === "networks" && (
        <Networks onSelect={(id) => navigate({ kind: "network", id })} />
      )}
      {view.kind === "network" && (
        <NetworkDetail
          networkId={view.id}
          onBack={() => navigate({ kind: "networks" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onControllersClick={() => navigate({ kind: "controllers" })}
          onSimClick={(id) => navigate({ kind: "sim", id })}
        />
      )}
      {view.kind === "sims" && (
        <Sims onSelect={(id) => navigate({ kind: "sim", id })} />
      )}
      {view.kind === "sim" && (
        <SimDetail
          simId={view.id}
          onBack={() => navigate({ kind: "sims" })}
          onNetworkClick={(id) => navigate({ kind: "network", id })}
        />
      )}
      {view.kind === "repairs" && (
        <Repairs
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSelect={(id) => navigate({ kind: "repair", id })}
        />
      )}
      {view.kind === "repair" && (
        <RepairDetail
          repairId={view.id}
          onBack={() => navigate({ kind: "repairs" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "transfers" && (
        <Transfers
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSelect={(id) => navigate({ kind: "transfer", id })}
        />
      )}
      {view.kind === "transfer" && (
        <TransferDetail
          transferId={view.id}
          onBack={() => navigate({ kind: "transfers" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "disposals" && (
        <Disposals
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSelect={(id) => navigate({ kind: "disposal", id })}
        />
      )}
      {view.kind === "disposal" && (
        <DisposalDetail
          disposalId={view.id}
          onBack={() => navigate({ kind: "disposals" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "loaners" && (
        <Loaners
          onAssetClick={(id) => navigate({ kind: "asset", id })}
          onSelect={(id) => navigate({ kind: "loan", id })}
        />
      )}
      {view.kind === "loan" && (
        <LoanDetail
          loanId={view.id}
          onBack={() => navigate({ kind: "loaners" })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "replenishment" && <Replenishment />}
      {view.kind === "receiving" && (
        <Receiving onShipmentClick={(id) => navigate({ kind: "shipment", id })} />
      )}
      {view.kind === "badges" && (
        <Badges onSelect={(token) => navigate({ kind: "badge", token })} />
      )}
      {view.kind === "badge" && (
        <BadgeDetail
          token={view.token}
          onBack={() => navigate({ kind: "badges" })}
          onUserClick={(upn) => navigate({ kind: "user", id: upn })}
          onAssetClick={(id) => navigate({ kind: "asset", id })}
        />
      )}
      {view.kind === "controllers" && (
        <Controllers
          onNetworkClick={(id) => navigate({ kind: "network", id })}
        />
      )}
      </main>
    </div>
  );
}

// ── Sidebar navigation ─────────────────────────────────────────────────

const SIDEBAR_ICONONLY_KEY = "feature-asset-inventory:sidebar-icononly";

function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(NAV_COLLAPSE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function readIconOnly(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIDEBAR_ICONONLY_KEY) === "1";
}

function SideNav({
  currentKind,
  defaultKind,
  isAdmin,
  userName,
  isPinned,
  onTogglePin,
  onNavigate,
}: {
  currentKind: TabKind;
  defaultKind: TabKind;
  isAdmin: boolean;
  userName: string;
  isPinned: boolean;
  onTogglePin: () => void;
  onNavigate: (kind: TabKind) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [iconOnly, setIconOnly] = useState<boolean>(readIconOnly);

  // Persist the collapsed/full preference so the sidebar reopens the way the
  // user last left it (read on mount via readIconOnly, written on change).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_ICONONLY_KEY, iconOnly ? "1" : "0");
  }, [iconOnly]);

  const toggleIconOnly = () => setIconOnly((prev) => !prev);

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          NAV_COLLAPSE_KEY,
          JSON.stringify(Array.from(next)),
        );
      }
      return next;
    });
  };

  // Filter admin-gated items; drop sections that end up empty.
  const sections = NAV_SECTIONS.map((s) => ({
    label: s.label,
    groups: s.groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter((it) => !it.admin || isAdmin),
      }))
      .filter((g) => g.items.length > 0),
  })).filter((s) => s.groups.length > 0);

  return (
    <aside
      style={{
        width: iconOnly ? 60 : 216,
        flexShrink: 0,
        transition: "width 0.15s ease-out",
        // Flush full-height rail. The shell mounts us inside a `page-body`
        // (48px topbar + 1.5rem vertical padding); bleed past that padding so
        // the rail meets the topbar and reaches the viewport bottom instead of
        // floating as a short card. A right border is the divider.
        position: "sticky",
        top: "3rem",
        height: "calc(100vh - 3rem)",
        // Bleed past the page-body padding on all three outer edges so the
        // rail sits flush to the viewport's top-left and bottom. In the flex
        // row the freed left space is absorbed by the content column, so the
        // rail→content gutter and the content's right padding are preserved.
        marginTop: "-1.5rem",
        marginBottom: "-1.5rem",
        marginLeft: "-1.5rem",
        // The aside itself does not scroll — only the <nav> does — so the
        // header (title + collapse toggle) and footer stay pinned.
        overflowY: "hidden",
        background: "rgb(var(--color-surface))",
        borderRight: "1px solid rgb(var(--color-border) / 0.6)",
        padding: iconOnly ? "1.25rem 0.4rem 1rem" : "1.25rem 0.75rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <header
        className="cluster"
        style={{
          flexShrink: 0,
          gap: "0.35rem",
          padding: iconOnly ? 0 : "0 0.15rem 0 0.35rem",
          justifyContent: iconOnly ? "center" : "space-between",
          alignItems: "flex-start",
        }}
      >
        {!iconOnly && (
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <h1 className="heading-3" style={{ margin: 0 }}>
              {FEATURE_NAME}
            </h1>
            <span className="text-xs text-muted truncate" title={userName}>
              {userName}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleIconOnly}
          title={iconOnly ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={iconOnly ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            color: "rgb(var(--color-text-muted))",
          }}
        >
          {iconOnly ? (
            <PanelLeftOpen size={15} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose size={15} strokeWidth={1.75} />
          )}
        </button>
      </header>

      <nav
        className="stack"
        style={{ gap: "0.15rem", flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {sections.map((section, si) => {
          const isCollapsed = collapsed.has(section.label);
          return (
            <div
              key={section.label}
              className="stack"
              style={{
                gap: 2,
                marginTop: si === 0 ? 0 : "0.5rem",
                paddingTop: si === 0 ? 0 : "0.5rem",
                borderTop:
                  si === 0
                    ? "none"
                    : "1px solid rgb(var(--color-border) / 0.5)",
              }}
            >
              {/* Section header — hidden in icon-only mode; the divider
                  above still separates sections. */}
              {!iconOnly && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    width: "100%",
                    padding: "0.15rem 0.4rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "rgb(var(--color-text-muted))",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} style={{ opacity: 0.7 }} />
                  ) : (
                    <ChevronDown size={12} style={{ opacity: 0.7 }} />
                  )}
                  <span>{section.label}</span>
                </button>
              )}
              {(iconOnly || !isCollapsed) &&
                section.groups.map((group, gi) => (
                  <div key={gi} className="stack" style={{ gap: 1 }}>
                    {group.label && !iconOnly && (
                      <span
                        className="text-muted"
                        style={{
                          fontSize: "0.5625rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.6rem 0.05rem 1.85rem",
                          opacity: 0.65,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {group.label}
                      </span>
                    )}
                    {group.items.map((item) => (
                      <NavButton
                        key={item.kind}
                        label={item.label}
                        icon={item.icon}
                        active={currentKind === item.kind}
                        pinned={defaultKind === item.kind}
                        iconOnly={iconOnly}
                        onClick={() => onNavigate(item.kind)}
                      />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </nav>

      <div style={{ flexShrink: 0, padding: iconOnly ? "0.25rem 0 0" : "0.25rem 0.35rem 0" }}>
        <button
          type="button"
          onClick={onTogglePin}
          className="btn btn-ghost btn-sm"
          style={{
            width: "100%",
            justifyContent: iconOnly ? "center" : "flex-start",
          }}
          title={
            isPinned
              ? "This is your default view (click to reset to Dashboard)"
              : "Make the current view your default"
          }
        >
          {isPinned ? (
            <>
              <Pin size={13} className="fill-current" /> {!iconOnly && "Default view"}
            </>
          ) : (
            <>
              <PinOff size={13} /> {!iconOnly && "Set as default"}
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavButton({
  label,
  icon: Icon,
  active,
  pinned,
  iconOnly,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  pinned: boolean;
  iconOnly?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: iconOnly ? "center" : "space-between",
        gap: "0.55rem",
        width: "100%",
        textAlign: "left",
        padding: iconOnly ? "0.5rem 0" : "0.4rem 0.6rem",
        borderRadius: 8,
        border: "none",
        borderLeft:
          active && !iconOnly
            ? "2px solid rgb(var(--color-primary))"
            : "2px solid transparent",
        cursor: "pointer",
        fontSize: "0.875rem",
        fontWeight: active ? 600 : 500,
        position: "relative",
        color: active
          ? "rgb(var(--color-primary))"
          : "rgb(var(--color-text))",
        background: active
          ? "rgb(from rgb(var(--color-primary)) r g b / 0.14)"
          : hover
            ? "rgb(var(--color-bg) / 0.6)"
            : "transparent",
      }}
    >
      <span
        className="cluster"
        style={{ gap: "0.55rem", minWidth: 0, alignItems: "center" }}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          style={{
            flexShrink: 0,
            color: active
              ? "rgb(var(--color-primary))"
              : "rgb(var(--color-text-muted))",
          }}
        />
        {!iconOnly && <span className="truncate">{label}</span>}
      </span>
      {pinned &&
        (iconOnly ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "rgb(var(--color-primary))",
            }}
          />
        ) : (
          <Pin size={11} className="fill-current" aria-hidden />
        ))}
    </button>
  );
}
