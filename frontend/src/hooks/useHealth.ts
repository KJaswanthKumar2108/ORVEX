import { useCallback, useEffect, useState } from "react";
import { api } from "../api/endpoints";

export function useHealth(pollIntervalMs: number = 30000) {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [healthChecking, setHealthChecking] = useState<boolean>(true);

  const checkHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      const res = await api.getHealth();
      setIsHealthy(res.status === "ok");
    } catch {
      setIsHealthy(false);
    } finally {
      setHealthChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    if (pollIntervalMs > 0) {
      const interval = setInterval(checkHealth, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [checkHealth, pollIntervalMs]);

  return { isHealthy, healthChecking, checkHealth };
}
