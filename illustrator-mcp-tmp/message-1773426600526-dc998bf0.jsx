

function createUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    if (c === "x") {
      return r.toString(16);
    } else {
      return (r & 0x3 | 0x8).toString(16);
    }
  });
}

function getDocument() {
  if (app.documents.length > 0) {
    return app.activeDocument;
  }
  return app.documents.add();
}

function getPageItem(uuid) {
  var doc = getDocument();
  for (var i = 0; i < doc.pageItems.length; i++) {
    if (doc.pageItems[i].note === uuid) {
      return doc.pageItems[i];
    }
  }
  return null;
}

if (typeof JSON !== "object") {
    JSON = {};
}
    
function stringify(data) {
  if (data === undefined) {
    return undefined;
  }
  if (data === null) {
    return 'null';
  }
  if (data.toString() === "NaN") {
    return 'null';
  }
  if (data === Infinity) {
    return 'null';
  }
  if (data.constructor === String) {
    return '"' + data.replace(/"/g, '\"') + '"';
  }
  if (data.constructor === Number) {
    return String(data);
  }
  if (data.constructor === Boolean) {
    return data ? 'true' : 'false';
  }
  if (data.constructor === Array) {
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var v = data[i];
      if (v === undefined || v === NaN || v === Infinity) {
        result.push('null');
      } else {
        result.push(stringify(v));
      }
    }
    return '[' + result.join(',') + ']';
  }
  if (data.constructor === Object) {
    var result = [];
    for (var k in data) {
      if (data[k] !== undefined) {
        result.push(stringify(k) + ':' + stringify(data[k]));
      }
    }
    return '{' + result.join(',') + '}';
  }
  return '{}'
}

JSON.stringify = stringify;


function ptToMm(pt) {
  return pt * (25.4 / 72) + "mm";
}

function mmToPt(mm) {
  return mm * (72 / 25.4);
}

function toPt(value) {
  if (value.indexOf("mm") !== -1) {
    var mm = parseFloat(value.replace("mm", ""));
    return mmToPt(mm);
  }
  if (value.indexOf("Q") !== -1) {
    var mm = parseFloat(value.replace("Q", "")) / 4;
    return mmToPt(mm);
  }
  return parseFloat(value);
}

var docCount = app.documents.length;
var activeDocName = "";
if (docCount > 0) {
  activeDocName = app.activeDocument.name;
}
JSON.stringify({
  appName: app.name,
  appVersion: app.version,
  locale: app.locale,
  documents: docCount,
  activeDocument: activeDocName
});
