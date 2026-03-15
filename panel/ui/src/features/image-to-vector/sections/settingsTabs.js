import { buildParametersSection } from "./ParametersSectionBuilder";
import { buildPresetSection } from "./PresetSectionBuilder";
import { buildHistorySection } from "./HistorySectionBuilder";

const resolveTabEnabled = (flags, key, fallback = true) => {
  if (!key) return fallback;
  if (typeof flags === "function") {
    const result = flags(key);
    return typeof result === "boolean" ? result : fallback;
  }
  if (flags && typeof flags === "object" && key in flags) {
    return Boolean(flags[key]);
  }
  return fallback;
};

const BASE_SETTINGS_TABS = [
  {
    id: "parameters",
    title: "Parameters",
    flagKey: "parameters",
    build(pageApi, model, actions) {
      return buildParametersSection(
        pageApi,
        {
          schema: model.schema,
          params: model.params,
          unit: model.unit,
          expanded: model.parametersExpanded,
        },
        {
          changeParam: (key, value) => actions.changeParam?.(key, value),
          setExpanded: (next) => actions.setParametersExpanded?.(next),
        },
      );
    },
    sync(section, model) {
      section.sync?.({
        schema: model.schema,
        params: model.params,
        unit: model.unit,
        expanded: model.parametersExpanded,
      });
    },
  },
  {
    id: "preset",
    title: "Preset",
    flagKey: "preset",
    build(pageApi, model, actions) {
      return buildPresetSection(
        pageApi,
        {
          presetName: model.presetName,
          presetSelect: model.presetSelect,
          presetNames: model.presetNames,
          expanded: model.presetExpanded,
        },
        {
          setPresetName: (next) => actions.setPresetName?.(next),
          setPresetSelect: (next) => actions.setPresetSelect?.(next),
          setExpanded: (next) => actions.setPresetExpanded?.(next),
          savePreset: () => actions.savePreset?.(),
          loadPreset: () => actions.loadPreset?.(),
          deletePresetByName: (name) => actions.deletePresetByName?.(name),
          reorderPresets: (names) => actions.reorderPresets?.(names),
        },
      );
    },
    sync(section, model) {
      section.sync?.({
        presetName: model.presetName,
        presetSelect: model.presetSelect,
        presetNames: model.presetNames,
        expanded: model.presetExpanded,
      });
    },
  },
  {
    id: "history",
    title: "History",
    flagKey: "history",
    build(pageApi, model, actions) {
      return buildHistorySection(
        pageApi,
        {
          items: model.historyItems,
          selectedIndex: model.historySelectedIndex,
          canLoad: model.historyCanLoad,
          saveName: model.historySaveName,
          emptyText: model.historyEmptyText,
        },
        {
          savePoint: () => actions.savePoint?.(),
          loadSavePoint: () => actions.loadSavePoint?.(),
          setSaveName: (next) => actions.setHistorySaveName?.(next),
          selectIndex: (index) => actions.selectHistoryIndex?.(index),
          removeIndex: (index) => actions.removeHistoryIndex?.(index),
        },
      );
    },
    sync(section, model) {
      section.sync?.({
        items: model.historyItems,
        selectedIndex: model.historySelectedIndex,
        canLoad: model.historyCanLoad,
        saveName: model.historySaveName,
        emptyText: model.historyEmptyText,
      });
    },
  },
];

export const createSettingsTabDefinitions = ({ flags } = {}) =>
  BASE_SETTINGS_TABS.filter((tab) => resolveTabEnabled(flags, tab.flagKey, true));
