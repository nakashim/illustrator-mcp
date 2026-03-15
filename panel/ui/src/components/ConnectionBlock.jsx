import { useEffect, useRef } from "preact/hooks";
import { Pane } from "tweakpane";
import { registerCustomPlugins } from "@nakashim/tp-custom";
import { buildConnectionSection } from "./ConnectionSectionBuilder";

export const ConnectionBlock = ({
  bridgeBaseUrl,
  connectionHint,
  connected,
  activeToolId,
  tools,
  onBridgeBaseUrlChange,
  onHealthCheck,
  onToolChange,
}) => {
  const hostRef = useRef(null);
  const sectionRef = useRef(null);
  const handlersRef = useRef({
    onBridgeBaseUrlChange,
    onHealthCheck,
    onToolChange,
  });

  useEffect(() => {
    handlersRef.current = { onBridgeBaseUrlChange, onHealthCheck, onToolChange };
  }, [onBridgeBaseUrlChange, onHealthCheck, onToolChange]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    hostRef.current.innerHTML = "";
    const pane = new Pane({ container: hostRef.current });
    registerCustomPlugins(pane, ["textinput", "text", "row", "plain", "iconbutton"]);
    sectionRef.current = buildConnectionSection(
      pane,
      {
        bridgeBaseUrl,
        connectionHint,
        connected,
        activeToolId,
        tools,
      },
      {
        setBridgeBaseUrl: (value) => handlersRef.current.onBridgeBaseUrlChange?.(value),
        healthCheck: () => handlersRef.current.onHealthCheck?.(),
        setActiveToolId: (value) => handlersRef.current.onToolChange?.(value),
      },
    );

    return () => {
      sectionRef.current = null;
      pane.dispose();
    };
  }, []);

  useEffect(() => {
    sectionRef.current?.sync?.({
      bridgeBaseUrl,
      connectionHint,
      connected,
      activeToolId,
      tools,
    });
  }, [activeToolId, bridgeBaseUrl, connected, connectionHint, tools]);

  return <div ref={hostRef} />;
};
