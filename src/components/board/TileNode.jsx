import React from "react";
import { MessageSquare, Minus, Plus, Vote as VoteIcon } from "lucide-react";
import { TILE_TYPES, STATUSES, isFlowchartShape } from "../../lib/boardModel.js";
import { ACCENT, BORDER } from "../../lib/theme.js";
import { SIDES, dotPositionStyle, CLIP_PATHS, isClipShape, clipRingInset } from "./tileGeometry.js";
import { tileStyles as styles } from "./tileStyles.js";
import TileContentView from "./TileContentView.jsx";
import TileContentEditor from "./TileContentEditor.jsx";

// Renders one regular (non-frame) tile: badges, status pill, tags, the
// title/content editor-or-view (kind-switched — see TileContentView), the
// resize handle, connector dots, and the dot-voting widget. Pure/
// presentational — all pointer-capture, drag, and selection *logic* stays
// in MuMap.jsx; this component only calls the callbacks it's given.
export default function TileNode({
  tile: t,
  isSelected,
  isConnectTarget,
  isConnectSource,
  showDots,
  isEditing,
  readOnly,
  comments,
  voteSession,
  myTileVotes,
  myTotalVotes,
  tileVoteTotal,
  dispatch,
  onPointerDown,
  onHoverEnter,
  onHoverLeave,
  onClick,
  onDoubleClick,
  onDotPointerDown,
  onResizeStart,
  onToggleComments,
  onEditingDone,
  onCastVote,
  onRetractVote,
}) {
  const isCircle = t.shape === "circle";

  // A free text block skips all card chrome (badges, status pill, tags,
  // vote widget, background/border) — just the text plus the same
  // resize/connect affordances every other tile gets.
  if (t.kind === "text") {
    return (
      <div key={t.id} className="tile text-tile"
        style={{
          ...styles.textTile,
          left: t.x, top: t.y, width: t.w, minHeight: t.h,
          outline: isConnectTarget ? `3px solid ${ACCENT}` : isSelected ? `2px solid ${ACCENT}` : "1px dashed transparent",
          outlineOffset: isSelected && !isConnectTarget ? 2 : 0,
          cursor: "grab",
          zIndex: isSelected || isConnectSource ? 5 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerEnter={onHoverEnter}
        onPointerLeave={onHoverLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {isEditing ? (
          <TileContentEditor tile={t} isCircle={false} dispatch={dispatch} onDone={onEditingDone} />
        ) : (
          <TileContentView tile={t} />
        )}
        <div className="resize-handle" style={styles.resizeHandle} onPointerDown={onResizeStart} />
        {showDots && SIDES.map((side) => (
          <div key={side} className="connector-dot"
            style={{ ...styles.connectorDot, ...dotPositionStyle(side) }}
            onPointerDown={(e) => onDotPointerDown(e, side)}
          />
        ))}
      </div>
    );
  }

  // Flowchart shapes (Terminator, Process, Decision, Input/Output) render
  // lean — no badge/status/tags/vote-widget block, just one centered,
  // clamped label — reusing the same "early return before the chrome"
  // pattern the text-tile branch above uses, rather than threading a second
  // chrome-less code path through the badge/status/tags JSX below.
  if (t.kind === "tile" && isFlowchartShape(t.shape)) {
    const labelStyle = t.shape === "terminator" ? styles.terminatorLabel
      : t.shape === "decision" ? styles.diamondLabel
      : t.shape === "parallelogram" ? styles.ioLabel
      : styles.flowchartLabel;
    const inputWidth = t.shape === "decision" ? "62%" : t.shape === "parallelogram" ? "74%" : "100%";

    const commentBadge = (
      <button className="comment-btn" style={{ ...styles.commentBadge, position: "absolute", top: 8, right: 8, zIndex: 3 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleComments(); }}
        title="Comments">
        <MessageSquare size={11} />
        {comments.length > 0 && <span>{comments.length}</span>}
      </button>
    );

    const label = isEditing ? (
      <input
        autoFocus
        style={{ ...styles.flowchartLabelInput, fontSize: labelStyle.fontSize, width: inputWidth }}
        value={t.title}
        placeholder="Label"
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => dispatch({ type: "UPDATE_TILE", id: t.id, patch: { title: e.target.value }, _silent: true })}
        onBlur={() => { dispatch({ type: "UPDATE_TILE", id: t.id, patch: { title: t.title } }); onEditingDone(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
      />
    ) : (
      <span style={labelStyle}>{t.title || "Label"}</span>
    );

    const resizeHandle = <div className="resize-handle" style={styles.resizeHandle} onPointerDown={onResizeStart} />;
    const dots = showDots && SIDES.map((side) => (
      <div key={side} className="connector-dot"
        style={{ ...styles.connectorDot, ...dotPositionStyle(side) }}
        onPointerDown={(e) => onDotPointerDown(e, side)}
      />
    ));

    if (isClipShape(t.shape)) {
      const clipPath = CLIP_PATHS[t.shape];
      const ringInset = clipRingInset(isSelected, isConnectTarget);
      const ringColor = (isConnectTarget || isSelected) ? ACCENT : BORDER;
      return (
        <div key={t.id} className="tile clip-wrap"
          style={{
            ...styles.clipWrap,
            left: t.x, top: t.y, width: t.w, height: t.h,
            filter: isSelected
              ? "drop-shadow(0 5px 12px rgba(31,41,55,0.24))"
              : "drop-shadow(0 2px 4px rgba(31,41,55,0.14))",
            zIndex: isSelected || isConnectSource ? 5 : 1,
          }}
          onPointerDown={onPointerDown}
          onPointerEnter={onHoverEnter}
          onPointerLeave={onHoverLeave}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          <div style={{ ...styles.clipRing, clipPath, inset: ringInset, background: ringColor }} />
          <div style={{ ...styles.clipFill, clipPath, background: t.color }}>{label}</div>
          {commentBadge}
          {resizeHandle}
          {dots}
        </div>
      );
    }

    return (
      <div key={t.id} className="tile"
        style={{
          ...styles.flowchartTile,
          left: t.x, top: t.y, width: t.w, height: t.h,
          background: t.color,
          borderRadius: t.shape === "terminator" ? 999 : 14,
          outline: isConnectTarget ? `3px solid ${ACCENT}` : isSelected ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
          outlineOffset: isSelected && !isConnectTarget ? 2 : 0,
          cursor: "grab",
          boxShadow: isSelected ? "0 6px 18px rgba(31,41,55,0.18)" : "0 2px 6px rgba(31,41,55,0.08)",
          zIndex: isSelected || isConnectSource ? 5 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerEnter={onHoverEnter}
        onPointerLeave={onHoverLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {commentBadge}
        {label}
        {resizeHandle}
        {dots}
      </div>
    );
  }

  return (
    <div key={t.id} className="tile"
      style={{
        ...styles.tile,
        left: t.x, top: t.y, width: t.w, minHeight: t.h,
        background: t.color,
        borderRadius: isCircle ? "50%" : 14,
        display: isCircle ? "flex" : "block",
        flexDirection: isCircle ? "column" : undefined,
        alignItems: isCircle ? "center" : undefined,
        justifyContent: isCircle ? "center" : undefined,
        textAlign: isCircle ? "center" : "left",
        outline: isConnectTarget ? `3px solid ${ACCENT}` : isSelected ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
        outlineOffset: isSelected && !isConnectTarget ? 2 : 0,
        cursor: "grab",
        boxShadow: isSelected ? "0 6px 18px rgba(31,41,55,0.18)" : "0 2px 6px rgba(31,41,55,0.08)",
        zIndex: isSelected || isConnectSource ? 5 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onHoverEnter}
      onPointerLeave={onHoverLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div style={styles.cornerBadges} onPointerDown={(e) => e.stopPropagation()}>
        {t.points != null && <div style={styles.pointsBadge}>{t.points}</div>}
        <button className="comment-btn" style={styles.commentBadge}
          onClick={(e) => { e.stopPropagation(); onToggleComments(); }}
          title="Comments">
          <MessageSquare size={11} />
          {comments.length > 0 && <span>{comments.length}</span>}
        </button>
      </div>

      <div style={styles.tileHeaderRow}>
        <div style={styles.tileBadge}>{TILE_TYPES[t.type]?.short || "•"}</div>
        {t.status && t.status !== "none" && STATUSES[t.status] && (
          <div style={styles.statusPill}>
            <span style={{ ...styles.statusDot, background: STATUSES[t.status].color }} />
            {STATUSES[t.status].label}
          </div>
        )}
      </div>

      {t.tags.length > 0 && (
        <div style={styles.tagsRow}>
          {t.tags.map((tag) => <span key={tag} style={styles.tagPill}>{tag}</span>)}
        </div>
      )}

      {isEditing ? (
        <TileContentEditor tile={t} isCircle={isCircle} dispatch={dispatch} onDone={onEditingDone} />
      ) : (
        <TileContentView tile={t} />
      )}

      {/* Resize handle */}
      <div className="resize-handle" style={styles.resizeHandle} onPointerDown={onResizeStart} />

      {/* Connector dots — Mural-style link handles */}
      {showDots && SIDES.map((side) => (
        <div key={side} className="connector-dot"
          style={{ ...styles.connectorDot, ...dotPositionStyle(side) }}
          onPointerDown={(e) => onDotPointerDown(e, side)}
        />
      ))}

      {/* Dot-voting widget — only while a session exists for this map */}
      {voteSession && (voteSession.active || voteSession.revealed) && (
        <div style={styles.voteWidget} onPointerDown={(e) => e.stopPropagation()}>
          {voteSession.revealed ? (
            <span style={styles.voteCount}><VoteIcon size={11} /> {tileVoteTotal}</span>
          ) : (
            <>
              <button style={styles.voteBtn} disabled={readOnly || myTileVotes.length === 0}
                onClick={() => onRetractVote(myTileVotes[myTileVotes.length - 1].id)}>
                <Minus size={11} />
              </button>
              <span style={styles.voteCount}>{myTileVotes.length}</span>
              <button style={styles.voteBtn} disabled={readOnly || myTotalVotes >= voteSession.votes_per_person}
                onClick={onCastVote}>
                <Plus size={11} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
