const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
export async function adminApi(path, options = {}) {
  const response = await fetch(`${API_URL}/api/admin${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.body && typeof options.body !== "string"
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("adminToken");
    window.location.assign("/login");
    throw new Error("Please sign in again.");
  }
  const result = await response.json().catch(() => {
    throw new Error("The server is temporarily unavailable. Please refresh in a moment.");
  });
  if (!response.ok || !result.success)
    throw new Error(result.error || "Unable to complete this operation.");
  return result;
}
export async function downloadAdminCsv(path, filename) {
  const response = await fetch(`${API_URL}/api/admin${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` },
  });
  if (!response.ok) throw new Error("Unable to export this report.");
  downloadFile(await response.blob(), filename);
}
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";
export const buttonClass =
  "admin-primary";
