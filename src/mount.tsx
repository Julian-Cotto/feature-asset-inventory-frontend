import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { ToastProvider } from "./components/ToastProvider";
import { FeatureAuthProvider } from "./platform/authProvider";
import {
  setFeatureMountContext,
  setShellRuntimeContext,
  type ShellMountContext,
} from "./platform/shellContext";

export function mountFeature(
  container: HTMLElement,
  context?: ShellMountContext,
) {
  setFeatureMountContext(context);
  setShellRuntimeContext(context?.runtime);

  const root = ReactDOM.createRoot(container);

  root.render(
    <React.StrictMode>
      <FeatureAuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </FeatureAuthProvider>
    </React.StrictMode>,
  );

  return () => {
    setFeatureMountContext(undefined);
    setShellRuntimeContext(undefined);
    root.unmount();
  };
}