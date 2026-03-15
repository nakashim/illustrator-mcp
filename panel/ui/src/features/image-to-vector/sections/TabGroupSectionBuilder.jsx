import { createControlledTab } from "@nakashim/tp-custom";

const createTabGroupMeta = (definitions, fallbackId = "default") => {
  const tabIds = definitions.map((definition) => definition.id);
  const defaultTabId = tabIds[0] ?? fallbackId;
  const tabIdByIndex = Object.fromEntries(definitions.map((definition, index) => [index, definition.id]));
  const indexByTabId = Object.fromEntries(definitions.map((definition, index) => [definition.id, index]));
  const toTabId = (value) => (tabIds.includes(value) ? value : defaultTabId);
  return {
    tabIdByIndex,
    indexByTabId,
    defaultTabId,
    toTabId,
  };
};

const createTabBlade = (containerApi, pages) => {
  if (typeof containerApi?.addTab === "function") {
    return containerApi.addTab({ pages });
  }
  if (typeof containerApi?.addBlade === "function") {
    return containerApi.addBlade({
      view: "tab",
      pages,
    });
  }
  throw new TypeError("This container does not support tab blades");
};

export const buildTabGroupSection = (
  containerApi,
  {
    definitions,
    model,
    actions,
    initialTab,
    getActiveTabFromModel = (nextModel) => nextModel?.tab,
    onTabChange,
  },
) => {
  const safeDefinitions = Array.isArray(definitions) ? definitions : [];
  if (safeDefinitions.length === 0) {
    return {
      sync() {},
    };
  }

  const { tabIdByIndex, indexByTabId, defaultTabId, toTabId } = createTabGroupMeta(safeDefinitions, initialTab);
  const tab = createTabBlade(
    containerApi,
    safeDefinitions.map((definition) => ({ title: definition.title })),
  );
  const controlledTab = createControlledTab(tab);
  const sections = safeDefinitions.map((definition, index) =>
    definition.build(tab.pages[index], model, actions),
  );

  const selectTab = (rawTabId) => {
    const nextTabId = toTabId(rawTabId);
    const nextIndex = indexByTabId[nextTabId] ?? 0;
    controlledTab.select(nextIndex, { silent: true });
  };

  selectTab(getActiveTabFromModel(model) ?? initialTab ?? defaultTabId);
  controlledTab.onSelect((ev) => {
    if (ev.source !== "user") {
      return;
    }
    const next = tabIdByIndex[ev.index] ?? defaultTabId;
    onTabChange?.(next);
  });

  return {
    sync(nextModel) {
      safeDefinitions.forEach((definition, index) => {
        definition.sync?.(sections[index], nextModel);
      });
      selectTab(getActiveTabFromModel(nextModel) ?? initialTab ?? defaultTabId);
    },
  };
};
