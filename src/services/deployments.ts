import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient";
import type {
  Deployment,
  DeploymentCreatePayload,
  DeploymentItemAddPayload,
  DeploymentItemAddResult,
} from "../types/deployment";
import type { Shipment, ShipmentCreatePayload } from "../types/shipment";

export interface DeploymentsQuery {
  status?: string;
  type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

function toQuery(q: DeploymentsQuery): string {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const listDeployments = (q: DeploymentsQuery = {}) =>
  apiGet<Deployment[]>(`/deployments${toQuery(q)}`);

export const getDeployment = (id: number) =>
  apiGet<Deployment>(`/deployments/${id}`);

export const createDeployment = (payload: DeploymentCreatePayload) =>
  apiPost<Deployment>("/deployments", payload);

export const updateDeployment = (
  id: number,
  payload: Partial<DeploymentCreatePayload>,
) => apiPatch<Deployment>(`/deployments/${id}`, payload);

export const addDeploymentItem = (
  id: number,
  payload: DeploymentItemAddPayload,
) => apiPost<DeploymentItemAddResult>(`/deployments/${id}/items`, payload);

export const removeDeploymentItem = (id: number, itemId: number) =>
  apiDelete<void>(`/deployments/${id}/items/${itemId}`);

export const startDeployment = (id: number) =>
  apiPost<Deployment>(`/deployments/${id}/start`);

export const completeDeployment = (id: number) =>
  apiPost<Deployment>(`/deployments/${id}/complete`);

export const cancelDeployment = (id: number) =>
  apiPost<Deployment>(`/deployments/${id}/cancel`);

export const createDeploymentShipment = (
  id: number,
  payload: ShipmentCreatePayload,
) => apiPost<Shipment>(`/deployments/${id}/shipments`, payload);

export const linkExistingShipment = (id: number, shipmentId: number) =>
  apiPost<Shipment>(`/deployments/${id}/shipments/${shipmentId}/link`);

export const unlinkShipment = (id: number, shipmentId: number) =>
  apiDelete<void>(`/deployments/${id}/shipments/${shipmentId}`);
