import React, { useRef } from "react";
import { Bold, Italic, List } from "lucide-react";
import { tileStyles as styles } from "./tileStyles.js";

// Wraps the current textarea selection in `before`/`after` (bold/italic) —
// manual selectionStart/selectionEnd splicing rather than execCommand or
// contentEditable, which avoids the cross-browser inconsistency both bring.
function wrapSelection(textarea, before, after, setContent) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  setContent(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

// Toggles a "- " bullet prefix on the line the cursor is currently on.
function toggleBulletLine(textarea, setContent) {
  const { value, selectionStart: start } = textarea;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const already = value.slice(lineStart, lineStart + 2) === "- ";
  const next = already
    ? value.slice(0, lineStart) + value.slice(lineStart + 2)
    : value.slice(0, lineStart) + "- " + value.slice(lineStart);
  setContent(next);
  const delta = already ? -2 : 2;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + delta, start + delta);
  });
}

// Editing UI for a tile's body — the counterpart to TileContentView, kind-
// switched the same way. `onDone` fires on blur-away (not on every
// keystroke) so the caller can clear its "armed for edit" bookkeeping.
export default function TileContentEditor({ tile, isCircle, dispatch, onDone }) {
  const textareaRef = useRef(null);
  const patch = (p, opts) => dispatch({ type: "UPDATE_TILE", id: tile.id, patch: p, ...opts });
  const setContentSilent = (content) => patch({ content }, { _silent: true });

  if (tile.kind === "image") {
    return (
      <div
        style={{ width: "100%" }}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onDone(); }}
      >
        <img src={tile.content} alt="" style={styles.imageBodyImg} />
        <input
          autoFocus
          style={{ ...styles.tileTitleInput, marginTop: 6, textAlign: isCircle ? "center" : "left" }}
          value={tile.title}
          placeholder="Caption"
          onChange={(e) => patch({ title: e.target.value }, { _silent: true })}
          onBlur={() => patch({ title: tile.title })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ width: "100%" }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onDone(); }}
    >
      <input
        autoFocus
        style={{ ...styles.tileTitleInput, textAlign: isCircle ? "center" : "left" }}
        value={tile.title}
        placeholder="Title"
        onChange={(e) => patch({ title: e.target.value }, { _silent: true })}
        onBlur={() => patch({ title: tile.title })}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
      />

      <div style={styles.richTextToolbar}>
        {[
          { Icon: Bold, title: "Bold", action: () => wrapSelection(textareaRef.current, "**", "**", setContentSilent) },
          { Icon: Italic, title: "Italic", action: () => wrapSelection(textareaRef.current, "*", "*", setContentSilent) },
          { Icon: List, title: "Bullet", action: () => toggleBulletLine(textareaRef.current, setContentSilent) },
        ].map(({ Icon, title, action }) => (
          <button key={title} type="button" title={title} style={styles.richTextBtn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}>
            <Icon size={11} />
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        style={{ ...styles.tileContentInput, textAlign: isCircle ? "center" : "left" }}
        value={tile.content}
        placeholder="Details, acceptance criteria, notes…"
        onChange={(e) => patch({ content: e.target.value }, { _silent: true })}
        onBlur={() => patch({ content: tile.content })}
        onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
      />
    </div>
  );
}
