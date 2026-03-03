import {
  executeExtendScript,
  toExtendScriptStringLiteral,
} from "../../extend-utils/utils";

export const openDocument = (path: string) => {
  const pathLiteral = toExtendScriptStringLiteral(path);
  const script = `
const file = new File(${pathLiteral});
var doc = app.open(file);
`;
  executeExtendScript(script);
};

export const createDocument = (width: string, height: string) => {
  const widthLiteral = toExtendScriptStringLiteral(width);
  const heightLiteral = toExtendScriptStringLiteral(height);
  const script = `
var doc = app.documents.add();
doc.artboards[0].artboardRect = [0, 0, toPt(${widthLiteral}), -toPt(${heightLiteral})];
`;
  executeExtendScript(script);
};

export const saveDocument = (path?: string) => {
  const pathLiteral = toExtendScriptStringLiteral(path ?? "");
  const script = `
var doc = getDocument();
var filePath = ${pathLiteral};
var newFile = new File(filePath);
var pdfOptions = new PDFSaveOptions();

if (filePath !== "") {
  if (filePath.indexOf(".pdf") !== -1) {
    doc.saveAs(newFile, pdfOptions);
  } else {
    doc.saveAs(newFile);
  }
} else {
  doc.save();
}
`;
  executeExtendScript(script);
};

export const duplicateArtboard = (count: number) => {
  const script = `
var doc = getDocument();
var sourceArtboard = doc.artboards[0];

var artboardRect = sourceArtboard.artboardRect;
var left = artboardRect[0];
var top = artboardRect[1];
var width = artboardRect[2] - artboardRect[0];
var height = artboardRect[1] - artboardRect[3];

doc.artboards.setActiveArtboardIndex(0);
app.executeMenuCommand("selectall");
app.executeMenuCommand("copy");

for (var i = 0; i < ${count}; i++) {
  var newLeft = left + width + width * i + 5 * (i + 1);
  doc.artboards.add([newLeft, top, newLeft + width, top - height]);

  var newIndex = doc.artboards.length - 1;
  doc.artboards.setActiveArtboardIndex(newIndex);
  app.executeMenuCommand("pasteInPlace");
}`;
  executeExtendScript(script);
};
