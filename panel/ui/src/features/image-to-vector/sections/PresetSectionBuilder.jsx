const PRESET_NONE_VALUE = "";

const reorderItemsByMove = (items, fromIndex, toIndex) => {
  if (!Array.isArray(items)) return [];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return items;
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  if (toIndex < 0 || toIndex >= items.length) return items;
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const moved = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = moved;
  return next;
};

const toSelectedIndex = (items, selectedName) => {
  if (!selectedName) return -1;
  const index = (items ?? []).findIndex((item) => item === selectedName);
  return index >= 0 ? index : -1;
};

export const buildPresetSection = (containerApi, state, actions) => {
  const initialItems = Array.isArray(state.presetNames) ? state.presetNames : [];
  const sectionState = {
    items: initialItems,
    selectedIndex: toSelectedIndex(initialItems, state.presetSelect ?? PRESET_NONE_VALUE),
    presetName: state.presetName ?? "",
  };
  let suppressNextSelectEvent = false;

  const presetListApi = containerApi.addBlade({
    view: "dynamiclistblade",
    label: "Preset List",
    listStyle: "ul",
    items: sectionState.items,
    emptyText: "No Presets",
    rows: 5,
    allowRemove: true,
    allowReorder: true,
    inlineLabel: false,
    showItemTooltip: true,
    fullWidth: true,
    selectable: true,
    allowDeselect: true,
    selectedIndex: sectionState.selectedIndex,
  });
  const detachActionHandler = presetListApi.onAction((event) => {
    if (event.type === "select") {
      if (suppressNextSelectEvent) {
        suppressNextSelectEvent = false;
        return;
      }
      const selectedIndex = presetListApi.selectedIndex;
      const selectedName = selectedIndex >= 0 ? presetListApi.items?.[selectedIndex] ?? "" : "";
      actions.setPresetSelect?.(selectedName);
      return;
    }
    if (event.type === "remove") {
      const removedName = String(event.item ?? sectionState.items?.[event.index] ?? "");
      if (removedName) {
        actions.deletePresetByName?.(removedName);
      }
      return;
    }
    if (event.type === "move") {
      const nextItems = reorderItemsByMove(
        Array.isArray(sectionState.items) ? sectionState.items : [],
        event.fromIndex,
        event.toIndex
      );
      sectionState.items = nextItems;
      actions.reorderPresets?.(nextItems);
    }
  });

  const saveNameRow = containerApi.addBlade({
    view: "rowblade",
    label: "Save Name",
    columns: 2,
    ratios: [4, 1.2],
  });
  const presetNameApi = saveNameRow.addBinding(0, sectionState, "presetName", {
    view: "textinputblade",
    placeholder: "Preset Name",
    fullWidth: true,
  });
  presetNameApi.on("change", (ev) => {
    actions.setPresetName?.(String(ev.value ?? ""));
  });
  const savePresetApi = saveNameRow.addButton(1, {
    title: "Save",
  });
  savePresetApi.on("click", () => actions.savePreset?.());
  const loadPresetApi = containerApi.addButton({
    title: "Load",
  });
  loadPresetApi.on("click", () => actions.loadPreset?.());

  return {
    sync(next) {
      const nextPresetSelect = next.presetSelect ?? PRESET_NONE_VALUE;
      const nextPresetNames = Array.isArray(next.presetNames) ? next.presetNames : [];
      const nextPresetName = typeof next.presetName === "string" ? next.presetName : "";
      if (sectionState.items !== nextPresetNames) {
        sectionState.items = nextPresetNames;
        presetListApi.items = nextPresetNames;
      }
      if (sectionState.presetName !== nextPresetName) {
        sectionState.presetName = nextPresetName;
        presetNameApi.refresh?.();
      }
      const nextSelectedIndex = toSelectedIndex(nextPresetNames, nextPresetSelect);
      if (sectionState.selectedIndex !== nextSelectedIndex) {
        sectionState.selectedIndex = nextSelectedIndex;
        suppressNextSelectEvent = true;
        presetListApi.selectedIndex = nextSelectedIndex;
      }
      const hasSelection = nextSelectedIndex >= 0;
      loadPresetApi.disabled = !hasSelection;
    },
    dispose() {
      if (typeof detachActionHandler === "function") {
        detachActionHandler();
      }
    },
  };
};
