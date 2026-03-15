const EXPORT_FORMAT_OPTIONS = {
  ".svg": "svg",
  ".pdf": "pdf",
  ".png": "png",
};

export const buildExportSection = (containerApi, model, actions) => {
  const state = {
    exportPath: model.exportPath ?? "",
    exportFileName: model.exportFileName ?? "",
    exportFormat: model.exportFormat ?? "svg",
  };

  const exportFolder = containerApi.addFolder({
    title: "Export",
    expanded: model.expanded ?? true,
  });
  exportFolder.on("fold", (ev) => {
    actions.setExpanded?.(Boolean(ev.expanded));
  });

  const pathRow = exportFolder.addBlade({
    view: "rowblade",
    label: "Path",
    columns: 2,
    ratios: [100, 1],
  });
  const exportPathApi = pathRow.addBinding(0, state, "exportPath", {
    view: "textinputblade",
    placeholder: "Export Path",
    fullWidth: true,
  });
  exportPathApi.on("change", (ev) => {
    actions.setExportPath?.(ev.value);
  });

  const pickDirectoryApi = pathRow.addBlade(1, {
    view: "iconbuttonblade",
    title: "",
    tooltip: "Select Directory",
    icon: "file-directory",
    variant: "ghost",
  });
  pickDirectoryApi.onClick(() => {
    actions.pickExportDirectory?.();
  });

  const fileNameRow = exportFolder.addBlade({
    view: "rowblade",
    label: "File Name",
    columns: 2,
    ratios: [4, 1.5],
  });
  const exportFileNameApi = fileNameRow.addBinding(0, state, "exportFileName", {
    view: "textinputblade",
    placeholder: "Group Name",
    fullWidth: true,
  });
  exportFileNameApi.on("change", (ev) => {
    actions.setExportFileName?.(ev.value);
  });

  const exportFormatApi = fileNameRow.addBinding(1, state, "exportFormat", {
    options: EXPORT_FORMAT_OPTIONS,
  });
  exportFormatApi.on("change", (ev) => {
    actions.setExportFormat?.(ev.value);
  });

  const exportSelectedApi = exportFolder.addButton({
    title: "Export",
    disabled: !model.connected,
  });
  exportSelectedApi.on("click", () => {
    actions.exportSelected?.();
  });

  return {
    sync(nextModel) {
      const nextExportPath = nextModel.exportPath ?? "";
      const nextExportFileName = nextModel.exportFileName ?? "";
      const nextExportFormat = nextModel.exportFormat ?? "svg";

      if (state.exportPath !== nextExportPath) {
        state.exportPath = nextExportPath;
        exportPathApi.refresh?.();
      }
      if (state.exportFileName !== nextExportFileName) {
        state.exportFileName = nextExportFileName;
        exportFileNameApi.refresh?.();
      }
      if (state.exportFormat !== nextExportFormat) {
        state.exportFormat = nextExportFormat;
        exportFormatApi.refresh?.();
      }
      exportSelectedApi.disabled = !nextModel.connected;
      if (typeof nextModel.expanded === "boolean" && exportFolder.expanded !== nextModel.expanded) {
        exportFolder.expanded = nextModel.expanded;
      }
    },
  };
};
