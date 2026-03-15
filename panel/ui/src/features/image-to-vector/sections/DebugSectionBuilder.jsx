export const buildDebugSection = (containerApi, model, actions) => {
  const state = {
    resultJson: model.lastResultText ?? "",
  };

  const debugSection = containerApi.addFolder({
    title: "Debug",
    expanded: model.expanded ?? true,
  });
  debugSection.on("fold", (ev) => {
    actions.setExpanded?.(Boolean(ev.expanded));
  });

  const resultJsonApi = debugSection.addBinding(state, "resultJson", {
    view: "textinputblade",
    label: "",
    textReadonly: true,
    rows: 4,
    fullWidth: true,
  });
  const copyResultApi = debugSection.addButton({ title: "Copy Result JSON" });
  copyResultApi.on("click", () => actions.copyLastResult?.());
  debugSection.addBlade({ view: "separator" });
  const resetAllStateApi = debugSection.addButton({ title: "Reset All" });
  resetAllStateApi.on("click", () => actions.resetAllState?.());

  return {
    sync(nextModel) {
      const nextResultJson = nextModel.lastResultText ?? "";
      if (state.resultJson !== nextResultJson) {
        state.resultJson = nextResultJson;
        resultJsonApi.refresh?.();
      }
      if (typeof nextModel.expanded === "boolean" && debugSection.expanded !== nextModel.expanded) {
        debugSection.expanded = nextModel.expanded;
      }
    },
  };
};
