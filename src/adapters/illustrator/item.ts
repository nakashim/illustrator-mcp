import { executeExtendScript } from "../../extend-utils/utils";

export type MaskInput = {
  maskUuid: string;
  maskedUuids: string[];
};

export const selectItems = (uuids: string[]) => {
  const script = `
var doc = getDocument();
var result = [];
var uuids = ${JSON.stringify(uuids)};
for (var i = 0; i < doc.pageItems.length; i++) {
  var item = doc.pageItems[i];
  for (var j = 0; j < uuids.length; j++) {
    if (uuids[j] === item.note) {
      item.selected = true;
      break;
    }
  }
}
`;
  executeExtendScript(script);
};

export const groupItems = (uuids: string[]) => {
  const script = `
var doc = getDocument();
var uuids = ${JSON.stringify(uuids)};
var group = doc.groupItems.add();
for (var i = uuids.length - 1; i >= 0; i--) {
  var item = getPageItem(uuids[i]);
  item.moveToBeginning(group);
}
`;
  executeExtendScript(script);
};

export const removeItems = (uuids: string[]) => {
  const script = `
var doc = getDocument();
var uuids = ${JSON.stringify(uuids)};
for (var i = 0; i < doc.pageItems.length; i++) {
  var item = doc.pageItems[i];
  for (var j = 0; j < uuids.length; j++) {
    if (uuids[j] === item.note) {
      item.remove();
      break;
    }
  }
}
`;
  executeExtendScript(script);
};

export const maskItems = (masks: MaskInput[]) => {
  const script = `
var doc = getDocument();
var masks = ${JSON.stringify(masks)};
for (var i = 0; i < masks.length; i++) {
  var maskInfo = masks[i];
  var group = doc.groupItems.add();

  // Add objects to be masked
  for (var j = 0; j < maskInfo.maskedUuids.length; j++) {
    var maskedItem = getPageItem(maskInfo.maskedUuids[j]);
    maskedItem.moveToBeginning(group);
  }

  // Add mask path
  var maskItem = getPageItem(maskInfo.maskUuid);
  maskItem.moveToBeginning(group);

  maskItem.clipping = true;
  group.clipped = true;
}
`;
  executeExtendScript(script);
};
