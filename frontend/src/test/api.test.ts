import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest } from "../api/client";
import { api } from "../api/endpoints";

describe("api client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates ApiClientError with status and detail", () => {
    const error = new ApiClientError(404, "Machine not found");
    expect(error.status).toBe(404);
    expect(error.detail).toBe("Machine not found");
    expect(error.message).toContain("404: Machine not found");
  });

  it("handles successful JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const res = await apiRequest<{ status: string }>("/health");
    expect(res).toEqual({ status: "ok" });
  });

  it("extracts error detail on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Machine not found." }),
    });

    await expect(apiRequest("/api/v1/machines/unknown")).rejects.toThrowError(
      "API Error 404: Machine not found."
    );
  });

  it("handles network failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    await expect(apiRequest("/health")).rejects.toThrowError("Failed to fetch");
  });

  it("calls getHealth endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    const res = await api.getHealth();
    expect(res.status).toBe("ok");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.anything()
    );
  });

  it("serializes query parameters correctly in getMachines", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, limit: 10, offset: 0 }),
    });

    await api.getMachines({ limit: 10, offset: 20, status: "active" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/machines\?limit=10&offset=20&status=active/),
      expect.anything()
    );
  });
});
