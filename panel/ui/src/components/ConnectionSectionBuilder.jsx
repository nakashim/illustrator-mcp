const toToolOptions = (tools) => Object.fromEntries((tools ?? []).map((tool) => [tool.label, tool.id]));
const toToolsKey = (tools) =>
  JSON.stringify((tools ?? []).map((tool) => ({ id: tool?.id ?? "", label: tool?.label ?? "" })));

export const buildConnectionSection = (containerApi, model, actions) => {
  const state = {
    bridgeBaseUrl: model.bridgeBaseUrl ?? "",
    activeToolId: model.activeToolId ?? "",
  };
  let toolsKey = toToolsKey(model.tools);

  const bridgeSection = containerApi.addBlade({
    view: "plainblade",
  });

  bridgeSection.addBlade({
    view: "textblade",
    tag: "h1",
    text: "Illustrator MCP",
  });

  const hintApi = bridgeSection.addBlade({
    view: "textblade",
    tag: "p",
    text: model.connectionHint ?? "",
    muted: !model.connected,
  });

  const row = bridgeSection.addBlade({
    view: "rowblade",
    label: "Bridge",
    columns: 2,
    ratios: [100, 1],
  });
  const bridgeApi = row.addBinding(0, state, "bridgeBaseUrl", {
    view: "textinputblade",
    fullWidth: true,
    placeholder: "http://127.0.0.1:43123",
  });
  bridgeApi.on("change", (ev) => {
    actions.setBridgeBaseUrl?.(ev.value);
  });

  const healthApi = row.addBlade(1, {
    view: "iconbuttonblade",
    title: "",
    tooltip: "Reconnect",
    icon: "sync",
    variant: "ghost",
    disabled: !model.connected,
  });
  healthApi.onClick(() => {
    actions.healthCheck?.();
  });

  const toolsApi = bridgeSection.addBinding(state, "activeToolId", {
    label: "Tools",
    options: toToolOptions(model.tools),
  });
  toolsApi.on("change", (ev) => {
    actions.setActiveToolId?.(ev.value);
  });

  return {
    sync(nextModel) {
      const nextHint = nextModel.connectionHint ?? "";
      const nextBridge = nextModel.bridgeBaseUrl ?? "";
      const nextToolId = nextModel.activeToolId ?? "";
      const nextTools = nextModel.tools;
      const nextToolsKey = toToolsKey(nextTools);

      if (hintApi.text !== nextHint) {
        hintApi.text = nextHint;
      }
      if (state.bridgeBaseUrl !== nextBridge) {
        state.bridgeBaseUrl = nextBridge;
        bridgeApi.refresh?.();
      }
      if (state.activeToolId !== nextToolId) {
        state.activeToolId = nextToolId;
        toolsApi.refresh?.();
      }
      if (hintApi.muted !== !nextModel.connected) {
        hintApi.muted = !nextModel.connected;
      }
      healthApi.disabled = !nextModel.connected;

      if (toolsKey !== nextToolsKey) {
        toolsKey = nextToolsKey;
        toolsApi.options = toToolOptions(nextTools);
        toolsApi.refresh?.();
      }
    },
  };
};
