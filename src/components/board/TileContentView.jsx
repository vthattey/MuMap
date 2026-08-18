import React from "react";
import { tileStyles as styles } from "./tileStyles.js";
import { renderRichText } from "../../lib/richText.jsx";

// Non-editing display for a tile's body. Switches on `tile.kind` — this is
// the extension point for new tile kinds (image tiles land here; any future
// kind, e.g. a table widget, follows the same pattern) without touching
// TileNode's drag/select/resize/connector-dot chrome around it.
export default function TileContentView({ tile }) {
  if (tile.kind === "text") {
    return tile.content
      ? <div style={styles.textBody}>{renderRichText(tile.content)}</div>
      : <div style={styles.textBodyPlaceholder}>Type something…</div>;
  }

  if (tile.kind === "image") {
    return (
      <div style={styles.imageBody}>
        <img src={tile.content} alt={tile.title || ""} style={styles.imageBodyImg} />
        {tile.title && <div style={{ ...styles.tileTitle, marginTop: 6 }}>{tile.title}</div>}
      </div>
    );
  }

  return (
    <>
      <div style={styles.tileTitle}>{tile.title || "Untitled"}</div>
      {tile.content && <div style={styles.tileContent}>{renderRichText(tile.content)}</div>}
    </>
  );
}
