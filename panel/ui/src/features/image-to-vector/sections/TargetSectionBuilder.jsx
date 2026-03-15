import { registerIconButtonIcon, unregisterIconButtonIcon } from "@nakashim/tp-custom";

const EFFECT_OPTIONS = {
  Dither: "dither",
  Halftone: "halftone",
  Mosaic: "mosaic",
};
const UNIT_OPTIONS = {
  px: "px",
  mm: "mm",
  Q: "Q",
  pt: "pt",
};
const SUPERSCRIPT_DIGITS = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};
const UNIT_ORDER = Object.keys(UNIT_OPTIONS);
const toSuperscript = (value) =>
  String(value)
    .split("")
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? "")
    .join("");
const toUnitMarker = (unit) => {
  const index = UNIT_ORDER.indexOf(String(unit ?? ""));
  return index >= 0 ? toSuperscript(index + 1) : "";
};
const toUnitLabel = (unit) => `Unit${toUnitMarker(unit)}`;
const toLockTooltip = (autoSync) =>
  autoSync ? "Unlocked (Target Auto Sync On)" : "Locked (Target Auto Sync Off)";

export const buildTargetSection = (containerApi, model, actions) => {
  const state = {
    targetUuid: model.targetUuid ?? "",
    autoSync: model.autoSync ?? true,
    effect: model.effect ?? "dither",
    unit: model.unit ?? "px",
  };

  registerIconButtonIcon(
    "lock",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z"></path></svg>`,
  );
  registerIconButtonIcon(
    "unlock",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M5.5 4v2h7A1.5 1.5 0 0 1 14 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.499 6H4V4a4 4 0 0 1 7.371-2.154.75.75 0 0 1-1.264.808A2.5 2.5 0 0 0 5.5 4Zm-2 3.5v6h9v-6h-9Z"></path></svg>`,
  );

  const targetFolder = containerApi.addFolder({
    title: "Target",
    expanded: model.expanded ?? true,
  });
  targetFolder.on("fold", (ev) => {
    actions.setExpanded?.(Boolean(ev.expanded));
  });

  const targetRow = targetFolder.addBlade({
    view: "rowblade",
    label: "UUID",
    columns: 2,
    ratios: [100, 1],
  });
  const targetUuidApi = targetRow.addBinding(0, state, "targetUuid", {
    view: "textinputblade",
    placeholder: "UUID",
    fullWidth: true,
    readonly: true,
  });

  const targetActionsRow = targetRow.addBlade(1, {
    view: "rowblade",
    columns: 3,
    ratios: [1, 1, 1],
    minGap: true,
  });

  const useSelectedApi = targetActionsRow.addBlade(0, {
    view: "iconbuttonblade",
    title: "",
    tooltip: "Use Selected",
    icon: "crosshairs",
    variant: "ghost",
    disabled: !model.connected,
  });
  useSelectedApi.onClick(() => {
    actions.useSelected?.();
  });

  const pinTargetApi = targetActionsRow.addBlade(1, {
    view: "iconbuttonblade",
    title: "",
    tooltip: toLockTooltip(state.autoSync),
    iconOn: "lock",
    iconOff: "unlock",
    toggled: !state.autoSync,
    variant: "ghost",
    disabled: !model.connected,
  });
  pinTargetApi.onClick(() => {
    actions.setAutoSync?.(!pinTargetApi.toggled);
  });

  const clearTargetApi = targetActionsRow.addBlade(2, {
    view: "iconbuttonblade",
    title: "",
    tooltip: "Clear UUID",
    icon: "trash",
    variant: "ghost",
    disabled: !state.targetUuid,
  });
  clearTargetApi.onClick(() => {
    actions.clearTargetUuid?.();
  });

  const effectApi = targetFolder.addBinding(state, "effect", {
    label: "Effect",
    options: EFFECT_OPTIONS,
  });
  effectApi.on("change", (ev) => {
    actions.changeEffect?.(ev.value);
  });

  const unitApi = targetFolder.addBinding(state, "unit", {
    label: toUnitLabel(state.unit),
    options: UNIT_OPTIONS,
  });
  unitApi.on("change", (ev) => {
    actions.setUnit?.(ev.value);
  });

  return {
    sync(nextModel) {
      const nextTargetUuid = nextModel.targetUuid ?? "";
      const nextAutoSync = nextModel.autoSync ?? true;
      const nextEffect = nextModel.effect ?? "dither";
      const nextUnit = nextModel.unit ?? "px";

      if (state.targetUuid !== nextTargetUuid) {
        state.targetUuid = nextTargetUuid;
        targetUuidApi.refresh?.();
      }
      if (state.autoSync !== nextAutoSync) {
        state.autoSync = nextAutoSync;
        pinTargetApi.toggled = !nextAutoSync;
      }
      pinTargetApi.tooltip = toLockTooltip(nextAutoSync);
      if (state.effect !== nextEffect) {
        state.effect = nextEffect;
        effectApi.refresh?.();
      }
      if (state.unit !== nextUnit) {
        state.unit = nextUnit;
        unitApi.refresh?.();
      }
      unitApi.label = toUnitLabel(nextUnit);
      useSelectedApi.disabled = !nextModel.connected;
      pinTargetApi.disabled = !nextModel.connected;
      clearTargetApi.disabled = !state.targetUuid;
      if (typeof nextModel.expanded === "boolean" && targetFolder.expanded !== nextModel.expanded) {
        targetFolder.expanded = nextModel.expanded;
      }
    },
    dispose() {
      unregisterIconButtonIcon("lock");
      unregisterIconButtonIcon("unlock");
    },
  };
};
