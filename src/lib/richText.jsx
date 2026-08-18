// A tiny markdown-*lite* renderer for tile content — **bold**, *italic*,
// and "- " bullet lines. No dependency, no schema change: `content` stays a
// plain string, and text with no markup renders exactly as it always has.
import React from "react";

function parseInline(text, keyPrefix) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 1) {
      return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function renderRichText(content) {
  if (!content) return null;
  const lines = content.split("\n");
  const nodes = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    nodes.push(<ul key={`ul-${nodes.length}`} style={{ margin: "2px 0", paddingLeft: 18 }}>{listBuffer}</ul>);
    listBuffer = [];
  };

  lines.forEach((line, i) => {
    const bulletMatch = /^\s*-\s+(.*)$/.exec(line);
    if (bulletMatch) {
      listBuffer.push(<li key={`li-${i}`}>{parseInline(bulletMatch[1], `li-${i}`)}</li>);
      return;
    }
    flushList();
    nodes.push(<div key={`ln-${i}`}>{line ? parseInline(line, `ln-${i}`) : " "}</div>);
  });
  flushList();

  return nodes;
}
