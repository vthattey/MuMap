// Starter board presets. Each blueprint tile/link references the others by
// a local `id` string (not a real board id) — materializeTemplate() swaps
// those for fresh ids via the same makeTile/makeFrame/makeLink helpers used
// everywhere else, and remaps link endpoints accordingly. This reuses the
// exact {tiles, links} shape importBoard()/exportBoard() already round-trip
// through LOAD, rather than inventing a second board format.
import { makeTile, makeFrame, makeLink } from "./boardModel.js";

export const TEMPLATES = [
  {
    id: "story-map",
    name: "Story Map",
    description: "A backbone of user journeys with supporting stories underneath each step.",
    tiles: [
      { id: "step1", kind: "frame", x: 0, y: 0, w: 320, h: 420, title: "Step 1: Discover" },
      { id: "step2", kind: "frame", x: 360, y: 0, w: 320, h: 420, title: "Step 2: Evaluate" },
      { id: "step3", kind: "frame", x: 720, y: 0, w: 320, h: 420, title: "Step 3: Purchase" },
      { id: "s1a", type: "user-story", shape: "rectangle", x: 30, y: 50, title: "Browse catalog" },
      { id: "s1b", type: "user-story", shape: "rectangle", x: 30, y: 210, title: "Search by category" },
      { id: "s2a", type: "user-story", shape: "rectangle", x: 390, y: 50, title: "Compare products" },
      { id: "s2b", type: "user-story", shape: "rectangle", x: 390, y: 210, title: "Read reviews" },
      { id: "s3a", type: "user-story", shape: "rectangle", x: 750, y: 50, title: "Add to cart" },
      { id: "s3b", type: "user-story", shape: "rectangle", x: 750, y: 210, title: "Checkout" },
    ],
    links: [],
  },
  {
    id: "retro",
    name: "Retro",
    description: "Start / Stop / Continue — a classic team retrospective layout.",
    tiles: [
      { id: "start", kind: "frame", x: 0, y: 0, w: 300, h: 420, title: "Start" },
      { id: "stop", kind: "frame", x: 340, y: 0, w: 300, h: 420, title: "Stop" },
      { id: "continue", kind: "frame", x: 680, y: 0, w: 300, h: 420, title: "Continue" },
      { id: "e1", type: "question", shape: "rectangle", x: 30, y: 50, title: "Add your idea…", color: "#93d9a8" },
      { id: "e2", type: "question", shape: "rectangle", x: 370, y: 50, title: "Add your idea…", color: "#93d9a8" },
      { id: "e3", type: "question", shape: "rectangle", x: 710, y: 50, title: "Add your idea…", color: "#93d9a8" },
    ],
    links: [],
  },
  {
    id: "dependency-map",
    name: "Dependency Map",
    description: "A chain of work items with directed dependency arrows already drawn.",
    tiles: [
      { id: "d1", type: "tech-story", shape: "rectangle", x: 0, y: 40, title: "Set up auth" },
      { id: "d2", type: "tech-story", shape: "rectangle", x: 280, y: 40, title: "User profile API" },
      { id: "d3", type: "user-story", shape: "rectangle", x: 560, y: 40, title: "Profile settings page" },
      { id: "d4", type: "question", shape: "rectangle", x: 280, y: 240, title: "Which fields are required?" },
    ],
    links: [
      { from: "d1", to: "d2", label: "blocks", directed: true },
      { from: "d2", to: "d3", label: "blocks", directed: true },
      { from: "d4", to: "d3", directed: true },
    ],
  },
  {
    id: "flowchart",
    name: "Flowchart",
    description: "Start → process → decision → yes/no branches → end, ready to customize.",
    // Coordinates mirror the approved mock's example flowchart exactly.
    // Input/Output isn't used here per the plan — it's still available
    // individually from the sidebar's shape row.
    tiles: [
      { id: "start", type: "user-story", shape: "terminator", x: 415, y: 40, title: "Start", color: "#93d9a8" },
      { id: "fill", type: "user-story", shape: "process", x: 400, y: 132, title: "Fill out request form", color: "#7ec8e3" },
      { id: "valid", type: "user-story", shape: "decision", x: 405, y: 240, title: "All fields valid?", color: "#f3c98b" },
      { id: "submit", type: "user-story", shape: "process", x: 680, y: 269, title: "Submit to review queue", color: "#7ec8e3" },
      { id: "errors", type: "user-story", shape: "process", x: 120, y: 269, title: "Show validation errors", color: "#7ec8e3" },
      { id: "end-yes", type: "user-story", shape: "terminator", x: 695, y: 410, title: "End", color: "#93d9a8" },
      { id: "end-no", type: "user-story", shape: "terminator", x: 135, y: 410, title: "End", color: "#93d9a8" },
    ],
    links: [
      { from: "start", to: "fill", directed: true },
      { from: "fill", to: "valid", directed: true },
      { from: "valid", to: "submit", label: "Yes", directed: true },
      { from: "valid", to: "errors", label: "No", directed: true },
      { from: "submit", to: "end-yes", directed: true },
      { from: "errors", to: "end-no", directed: true },
    ],
  },
];

export function materializeTemplate(template, originX = 0, originY = 0) {
  const idMap = new Map();
  const tiles = template.tiles.map((bp) => {
    const overrides = { title: bp.title };
    if (bp.content) overrides.content = bp.content;
    if (bp.color) overrides.color = bp.color;
    if (bp.w) overrides.w = bp.w;
    if (bp.h) overrides.h = bp.h;
    const t = bp.kind === "frame"
      ? makeFrame(originX + bp.x, originY + bp.y, overrides)
      : makeTile(bp.type, bp.shape, originX + bp.x, originY + bp.y, overrides);
    idMap.set(bp.id, t.id);
    return t;
  });
  const links = template.links.map((bp) => makeLink(idMap.get(bp.from), idMap.get(bp.to), {
    label: bp.label || "", directed: bp.directed !== false,
  }));
  return { tiles, links };
}
