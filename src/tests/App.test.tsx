import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import App from "../App";
import { FeatureAuthProvider } from "../platform/authProvider";
import type { ShellFeatureAuthContractV1 } from "../platform/authTypes";

// App composes many views that fetch on mount. Stub the whole transport so
// no view hits the network — we only care about the shell chrome (title +
// tabs), which renders synchronously regardless of in-flight requests.
vi.mock("../services/apiClient", () => ({
  apiGet: vi.fn(async () => ({})),
  apiPost: vi.fn(async () => ({})),
  apiPut: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({})),
  apiFetch: vi.fn(async () => ({})),
  apiFetchBlob: vi.fn(async () => ({ blob: new Blob(), filename: "x.csv" })),
}));

const AUTHED_SESSION: ShellFeatureAuthContractV1 = {
  version: "v1",
  isAuthenticated: true,
  authMode: "entra",
  userId: "u1",
  userName: "Test User",
  email: "test@example.com",
  roles: ["admin"],
  accessToken: "token-123",
};

afterEach(() => {
  delete window.__FEATURE_SHELL_AUTH__;
  vi.clearAllMocks();
});

describe("App shell", () => {
  it("renders the feature title and the primary navigation tabs", () => {
    window.__FEATURE_SHELL_AUTH__ = AUTHED_SESSION;

    render(
      <FeatureAuthProvider>
        <App />
      </FeatureAuthProvider>,
    );

    // Feature chrome.
    expect(
      screen.getByRole("heading", { level: 1, name: "IT Asset Inventory" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();

    // A representative set of tabs, including the SIM-cards tab.
    expect(screen.getByRole("button", { name: /^Assets$/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Networks \(Meraki\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SIM cards/ })).toBeInTheDocument();
  });

  it("throws from the auth provider when the shell session is missing", () => {
    // The provider hard-fails without a valid shell session (entra contract),
    // so the feature never mounts unauthenticated. Assert that contract.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <FeatureAuthProvider>
          <App />
        </FeatureAuthProvider>,
      ),
    ).toThrow(/shell authentication is required/i);
    spy.mockRestore();
  });
});
