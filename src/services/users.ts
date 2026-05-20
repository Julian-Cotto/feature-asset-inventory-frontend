import { apiGet, apiPost } from "./apiClient";
import type {
  AssignableDevicesResponse,
  IntuneUser,
  UserDetail,
  UserSyncResult,
} from "../types/user";

export const listUsers = () => apiGet<IntuneUser[]>("/users");

export const getUser = (userId: string) =>
  apiGet<UserDetail>(`/users/${encodeURIComponent(userId)}`);

export const syncAllUsers = () => apiPost<UserSyncResult>("/users/sync");

export const syncOneUser = (userId: string) =>
  apiPost<IntuneUser>(`/users/${encodeURIComponent(userId)}/sync`);

export const listAssignableDevices = (userId: string) =>
  apiGet<AssignableDevicesResponse>(
    `/users/${encodeURIComponent(userId)}/assignable-devices`,
  );

export const assignDevice = (userId: string, deviceId: string) =>
  apiPost<{ ok: boolean; device_id: string }>(
    `/users/${encodeURIComponent(userId)}/devices/assign`,
    { device_id: deviceId },
  );

export const unassignDevice = (userId: string, deviceId: string) =>
  apiPost<{ ok: boolean; device_id: string }>(
    `/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}/unassign`,
  );
