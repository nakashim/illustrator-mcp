import { useEffect, useRef, useState } from "preact/hooks";
import { ConnectionBlock } from "./components/ConnectionBlock";
import { connectionMessages } from "./hosts/illustrator/messages";
import { illustratorClient } from "./hosts/illustrator/client";
import { FEATURE_REGISTRY, FEATURE_TOOL_OPTIONS } from "./features/registry";


export const App = () => {
  const firstFeatureId = FEATURE_REGISTRY.find((item) => !item.disabled)?.id ?? FEATURE_REGISTRY[0]?.id ?? "image-to-vector";
  const [bridgeBaseUrl, setBridgeBaseUrl] = useState(
    import.meta.env.DEV ? "/bridge" : "http://127.0.0.1:43123"
  );
  const [connectionHint, setConnectionHint] = useState(connectionMessages.checking);
  const [connected, setConnected] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState(firstFeatureId);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [panelVisible, setPanelVisible] = useState(
    () => document.visibilityState !== "hidden" && document.hasFocus()
  );
  const healthAbortRef = useRef(null);

  const healthCheck = async (silent = false) => {
    if (document.visibilityState === "hidden") return;
    const controller = new AbortController();
    healthAbortRef.current = controller;
    try {
      const payload = await illustratorClient.health(bridgeBaseUrl, { signal: controller.signal });
      const ok = Boolean(payload.illustrator?.connected);
      setConnected(ok);
      setConnectionHint(
        ok
          ? connectionMessages.bridgeAndIllustratorConnected
          : connectionMessages.bridgeReachableIllustratorNotConnected
      );
    } catch (error) {
      if (error?.name === "AbortError") return;
      setConnected(false);
      setConnectionHint(connectionMessages.bridgeNotReachable);
    } finally {
      if (healthAbortRef.current === controller) {
        healthAbortRef.current = null;
      }
    }
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden" && document.hasFocus();
      setPanelVisible(visible);
      if (!visible && healthAbortRef.current) {
        healthAbortRef.current.abort();
        healthAbortRef.current = null;
      }
    };
    const onFocus = () => setPanelVisible(document.visibilityState !== "hidden" && document.hasFocus());
    const onBlur = () => {
      setPanelVisible(false);
      if (healthAbortRef.current) {
        healthAbortRef.current.abort();
        healthAbortRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      if (healthAbortRef.current) {
        healthAbortRef.current.abort();
        healthAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!panelVisible) return undefined;
    healthCheck(true);
    const timer = setInterval(() => healthCheck(true), 5000);
    return () => {
      clearInterval(timer);
      if (healthAbortRef.current) {
        healthAbortRef.current.abort();
        healthAbortRef.current = null;
      }
    };
  }, [bridgeBaseUrl, panelVisible]);

  useEffect(() => {
    let active = true;
    const hydrateUiState = async () => {
      try {
        const payload = await illustratorClient.getUiState(bridgeBaseUrl);
        if (!active) return;
        const featureState =
          payload && typeof payload.feature === "object" && payload.feature
            ? payload.feature
            : {};
        const nextFeatureId =
          typeof featureState.activeFeatureId === "string" ? featureState.activeFeatureId : "";
        if (nextFeatureId && FEATURE_REGISTRY.some((item) => item.id === nextFeatureId)) {
          setActiveFeatureId(nextFeatureId);
        }
      } catch {
        // UI state restore is best-effort.
      } finally {
        if (active) setUiStateHydrated(true);
      }
    };
    void hydrateUiState();
    return () => {
      active = false;
    };
  }, [bridgeBaseUrl]);

  useEffect(() => {
    if (!uiStateHydrated) return undefined;
    const timer = setTimeout(() => {
      void illustratorClient.patchUiState(bridgeBaseUrl, {
        feature: { activeFeatureId },
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [activeFeatureId, bridgeBaseUrl, uiStateHydrated]);

  const activeFeature = FEATURE_REGISTRY.find((item) => item.id === activeFeatureId) ?? FEATURE_REGISTRY[0];
  const ActiveFeatureComponent = activeFeature?.component ?? null;

  return (
    <main className="tp-custom">
      <ConnectionBlock
        bridgeBaseUrl={bridgeBaseUrl}
        connectionHint={connectionHint}
        connected={connected}
        activeToolId={activeFeatureId}
        tools={FEATURE_TOOL_OPTIONS}
        onBridgeBaseUrlChange={setBridgeBaseUrl}
        onHealthCheck={() => healthCheck(false)}
        onToolChange={setActiveFeatureId}
      />
      {ActiveFeatureComponent ? (
        <ActiveFeatureComponent bridgeBaseUrl={bridgeBaseUrl} connected={connected} />
      ) : (
        <section>
          <h2>Coming soon</h2>
          <p className="tp-custom__hint">New tools will be added here.</p>
        </section>
      )}
    </main>
  );
};
