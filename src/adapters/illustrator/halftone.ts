import { executeExtendScript } from "../../extend-utils/utils";
import type { Dot } from "../../core/halftone";

const buildDrawHalftoneScript = (
  dots: Dot[],
  cmyk: [number, number, number, number],
  groupName: string
) => `
var doc = getDocument();
var dots = ${JSON.stringify(dots)};
var group = doc.groupItems.add();
group.note = createUUID();
group.name = ${JSON.stringify(groupName)};

var color = new CMYKColor();
color.cyan = ${cmyk[0]};
color.magenta = ${cmyk[1]};
color.yellow = ${cmyk[2]};
color.black = ${cmyk[3]};

for (var i = 0; i < dots.length; i++) {
  var d = dots[i];
  var circle = doc.pathItems.ellipse(d.y + d.r, d.x - d.r, d.r * 2, d.r * 2);
  circle.stroked = false;
  circle.filled = true;
  circle.fillColor = color;
  circle.note = createUUID();
  circle.moveToBeginning(group);
}

JSON.stringify({
  groupUuid: group.note,
  groupName: group.name,
  dotCount: dots.length
});
`;

export const drawHalftoneDots = (
  dots: Dot[],
  cmyk: [number, number, number, number],
  groupName: string
) =>
  executeExtendScript(buildDrawHalftoneScript(dots, cmyk, groupName), {
    timeoutMs: 180_000,
    retries: 1,
  });
