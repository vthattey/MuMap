import React from "react";
import { MessageSquare, Minus, Plus, Vote as VoteIcon } from "lucide-react";
import { TILE_TYPES, STATUSES } from "../../lib/boardModel.js";
import { ACCENT, BORDER } from "../../lib/theme.js";
import { SIDES, dotPositionStyle } from "./tileGeometry.js";
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
