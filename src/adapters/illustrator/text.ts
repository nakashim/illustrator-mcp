import {
  executeExtendScript,
  toExtendScriptStringLiteral,
} from "../../extend-utils/utils";

export type TextFrameChangeInput = {
  uuid: string;
  text?: string;
  fontName?: string;
  fontSize?: string;
  justification?: "left" | "center" | "right" | "justify";
  colorCmyk?: number[];
  position?: string[];
  size?: string[];
};

export type CharacterRangeChangeInput = {
  range: { from: number; to: number };
  fontName?: string;
  fontSize?: string;
  lineHeight?: string;
  baselineShift?: string;
  horizontalScale?: number;
  verticalScale?: number;
  colorCmyk?: number[];
};

export const createTextFrames = (count: number) => {
  const script = `
var doc = getDocument();
var result = [];
for (var i = 0; i < ${count}; i++) {
  var textFrame = doc.textFrames.add();
  textFrame.note = createUUID();
  result.push({ uuid: textFrame.note });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};

export const listTextFrames = () => {
  const script = `
var doc = getDocument();
var results = [];
var result = {};
var item = null;
var charAttr = null;
var paragraphAttr = null;

for (var i = 0; i < doc.textFrames.length; i++) {
  item = doc.textFrames[i];
  if (!item.note) {
    item.note = createUUID();
  }
  result = {
    uuid: item.note,
    name: item.name,
    text: item.contents,
    x: ptToMm(item.left),
    y: ptToMm(-item.top),
    width: ptToMm(item.width),
    height: ptToMm(item.height),
    selected: item.selected,
    locked: item.locked,
  };
  if (item.characters.length > 0) {
    charAttr = item.characters[0].characterAttributes;
    paragraphAttr = item.paragraphs[0].paragraphAttributes;
    try {
      result.fontName = charAttr.textFont.name;
    } catch (e) {
      result.fontName = "";
    }
    try {
      result.lineHeight = charAttr.leading;
    } catch (e) {
      result.lineHeight = 0;
    }
    try {
      result.fontSize = charAttr.size;
    } catch (e) {
      result.fontSize = 0;
    }
    try {
      result.justification = paragraphAttr.justification;
    } catch (e) {
      result.justification = "";
    }
  }
  results.push(result);
}
JSON.stringify(results);
`;
  return executeExtendScript(script);
};

export const changeTextFrames = (changes: TextFrameChangeInput[]) => {
  const script = `
function run() {
  var inputs = ${JSON.stringify(changes)};
  var item = null;
  
  for (var i = 0; i < inputs.length; i++) {
    item = getPageItem(inputs[i].uuid);
    if (inputs[i].text) {
      item.contents = inputs[i].text.replace(/\\n/g, "\\n");
    }
    if (inputs[i].fontName) {
      item.textRange.characterAttributes.textFont = app.textFonts.getByName(inputs[i].fontName);
    }
    if (inputs[i].fontSize) {
      item.textRange.characterAttributes.size = toPt(inputs[i].fontSize);
    }
    /*if (inputs[i].justification) {
      var str = inputs[i].justification;
      var justification = Justification.FULLJUSTIFY;
      if (str === "left") {
        justification = Justification.LEFT;
      }
      if (str === "center") {
        justification = Justification.CENTER;
      }
      if (str === "right") {
        justification = Justification.RIGHT;
      }
      item.paragraphs[0].paragraphAttributes.justification = justification;
    }*/
    if (inputs[i].colorCmyk) {
      var cmyk = new CMYKColor();
      cmyk.cyan = inputs[i].colorCmyk[0];
      cmyk.magenta = inputs[i].colorCmyk[1];
      cmyk.yellow = inputs[i].colorCmyk[2];
      cmyk.black = inputs[i].colorCmyk[3];
      item.textRange.characterAttributes.fillColor = cmyk;
    }
    if (inputs[i].position) {
      var x = toPt(inputs[i].position[0]);
      var y = -toPt(inputs[i].position[1]);
      item.position = [x, y];
    }
    if (inputs[i].size) {
      var width = toPt(inputs[i].size[0]);
      var height = toPt(inputs[i].size[1]);
      item.size = [width, height];
    }
    $.gc();
  }
}
run();
`;
  executeExtendScript(script);
};

export const changeCharacters = (
  uuid: string,
  changes: CharacterRangeChangeInput[]
) => {
  const uuidLiteral = toExtendScriptStringLiteral(uuid);
  const script = `
var inputs = ${JSON.stringify(changes)};
var item = getPageItem(${uuidLiteral});

for (var i = 0; i < inputs.length; i++) {
  var from = Math.min(inputs[i].range.from, item.characters.length);
  var to = Math.min(inputs[i].range.to, item.characters.length);
  for (var j = from; j < to; j++) {
    var character = item.characters[j];
    var charAttr = character.characterAttributes;

    if (inputs[i].fontName) {
      charAttr.textFont = app.textFonts.getByName(inputs[i].fontName);
    }
    if (inputs[i].fontSize) {
      charAttr.size = toPt(inputs[i].fontSize);
    }
    if (inputs[i].lineHeight) {
      charAttr.leading = toPt(inputs[i].lineHeight);
      charAttr.autoLeading = false;
    }
    if (inputs[i].baselineShift) {
      charAttr.baselineShift = toPt(inputs[i].baselineShift);
    }
    if (inputs[i].horizontalScale) {
      charAttr.horizontalScale = inputs[i].horizontalScale;
    }
    if (inputs[i].verticalScale) {
      charAttr.verticalScale = inputs[i].verticalScale;
    }
    if (inputs[i].colorCmyk) {
      var cmyk = new CMYKColor();
      cmyk.cyan = inputs[i].colorCmyk[0];
      cmyk.magenta = inputs[i].colorCmyk[1];
      cmyk.yellow = inputs[i].colorCmyk[2];
      cmyk.black = inputs[i].colorCmyk[3];
      charAttr.fillColor = cmyk;
    }
  }
}
`;
  executeExtendScript(script);
};

export const listFonts = () => {
  const script = `
var fonts = app.textFonts;
var result = [];
for (var i = 0; i < fonts.length; i++) {
  result.push({ name: fonts[i].name, family: fonts[i].family, style: fonts[i].style });
}
JSON.stringify(result);
`;
  return executeExtendScript(script);
};
