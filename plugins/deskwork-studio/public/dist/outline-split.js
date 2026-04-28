// ../../plugins/deskwork-studio/public/src/outline-split.ts
function splitOutline(md) {
  const lines = md.split("\n");
  const startIdx = lines.findIndex((line) => /^##[ \t]+Outline\b/.test(line));
  if (startIdx < 0) {
    return { outline: "", body: md, present: false, startLine: -1, endLine: -1 };
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##[ \t]+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const outline = lines.slice(startIdx, endIdx).join("\n");
  const body = [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join("\n");
  return { outline, body, present: true, startLine: startIdx, endLine: endIdx };
}
function joinOutline(outline, body) {
  if (!outline) return body;
  const outlineTrimmed = outline.replace(/\n+$/, "");
  const bodyLines = body.split("\n");
  const firstH2 = bodyLines.findIndex((line) => /^##[ \t]+/.test(line));
  if (firstH2 < 0) {
    const trailingNewline = body.endsWith("\n") ? "" : "\n";
    return `${body}${trailingNewline}
${outlineTrimmed}
`;
  }
  const before = bodyLines.slice(0, firstH2);
  const after = bodyLines.slice(firstH2);
  while (before.length > 0 && before[before.length - 1] === "") {
    before.pop();
  }
  return [...before, "", outlineTrimmed, "", ...after].join("\n");
}
export {
  joinOutline,
  splitOutline
};
//# sourceMappingURL=outline-split.js.map
