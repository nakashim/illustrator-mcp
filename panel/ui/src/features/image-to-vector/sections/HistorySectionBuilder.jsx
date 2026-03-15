export const buildHistorySection = (containerApi, model, actions) => {
  const state = {
    items: Array.isArray(model.items) ? model.items : [],
    selectedIndex: Number.isInteger(model.selectedIndex) ? model.selectedIndex : -1,
    saveName: typeof model.saveName === "string" ? model.saveName : "",
  };
  let suppressNextSelectEvent = false;

  const listApi = containerApi.addBlade({
    view: "dynamiclistblade",
    label: "Save Points",
    listStyle: "ol",
    items: state.items,
    emptyText: model.emptyText ?? "No Save Points",
    rows: 5,
    allowRemove: true,
    allowReorder: false,
    inlineLabel: false,
    showItemTooltip: true,
    fullWidth: true,
    selectable: true,
    allowDeselect: true,
    selectedIndex: state.selectedIndex,
  });
  const detachActionHandler = listApi.onAction((event) => {
    if (event.type === "select") {
      if (suppressNextSelectEvent) {
        suppressNextSelectEvent = false;
        return;
      }
      actions.selectIndex?.(listApi.selectedIndex);
      return;
    }
    if (event.type === "remove") {
      actions.removeIndex?.(event.index);
    }
  });

  const saveNameRow = containerApi.addBlade({
    view: "rowblade",
    label: "Save Name",
    columns: 2,
    ratios: [4, 1.2],
  });
  const saveNameApi = saveNameRow.addBinding(0, state, "saveName", {
    view: "textinputblade",
    placeholder: "Save Point Name",
    fullWidth: true,
  });
  saveNameApi.on("change", (ev) => {
    actions.setSaveName?.(String(ev.value ?? ""));
  });
  const savePointApi = saveNameRow.addButton(1, {
    title: "Save",
  });
  savePointApi.on("click", () => {
    actions.savePoint?.();
  });
  const loadSavePointApi = containerApi.addButton({
    title: "Load",
    disabled: state.selectedIndex < 0,
  });
  loadSavePointApi.on("click", () => {
    actions.loadSavePoint?.();
  });

  return {
    sync(nextModel) {
      const nextItems = Array.isArray(nextModel.items) ? nextModel.items : [];
      const nextSelectedIndex = Number.isInteger(nextModel.selectedIndex) ? nextModel.selectedIndex : -1;
      const nextSaveName = typeof nextModel.saveName === "string" ? nextModel.saveName : "";

      if (state.items !== nextItems) {
        state.items = nextItems;
        listApi.items = nextItems;
      }
      if (state.saveName !== nextSaveName) {
        state.saveName = nextSaveName;
        saveNameApi.refresh?.();
      }
      listApi.emptyText = nextModel.emptyText ?? "No Save Points";
      if (state.selectedIndex !== nextSelectedIndex) {
        state.selectedIndex = nextSelectedIndex;
        suppressNextSelectEvent = true;
        listApi.selectedIndex = nextSelectedIndex;
      }
      loadSavePointApi.disabled = nextSelectedIndex < 0;
    },
    dispose() {
      if (typeof detachActionHandler === "function") {
        detachActionHandler();
      }
    },
  };
};
