import { createSettingsTabDefinitions } from "./settingsTabs";
import { buildTabGroupSection } from "./TabGroupSectionBuilder";

export const buildSettingsConfigSection = (containerApi, model, actions) => {
  const definitions = createSettingsTabDefinitions({
    flags: model?.tabFlags,
  });
  const settingsContainer = containerApi.addBlade({
    view: "plainblade",
  });
  return buildTabGroupSection(settingsContainer, {
    definitions,
    model,
    actions,
    initialTab: "parameters",
    getActiveTabFromModel: (nextModel) => nextModel?.tab,
    onTabChange: (nextTab) => actions.setTab?.(nextTab),
  });
};
