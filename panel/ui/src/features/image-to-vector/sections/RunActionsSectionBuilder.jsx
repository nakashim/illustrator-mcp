export const buildRunActionsSection = (containerApi, model, actions) => {
  const actionsSection = containerApi.addBlade({
    view: "plainblade",
  });
  const row = actionsSection.addBlade({
    view: "rowblade",
    columns: 1,
    ratios: [1],
  });
  const runApi = row.addButton(0, {
    title: "Run",
    disabled: !model.connected,
  });
  runApi.on("click", () => {
    actions.runFinal?.();
  });
  return {
    sync(nextModel) {
      runApi.disabled = !Boolean(nextModel.connected);
    },
  };
};
