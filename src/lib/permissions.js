// Central definition of what each access level can do. Introduced with the
// comment-only tier so the view/edit binary scattered through MuMap.jsx
// (`readOnly`, `permission === "edit"`) has one place to grow from instead
// of a third string comparison copy-pasted at every call site — the next
// tier that needs its own level (if any) only touches this file.
export const PERMISSION_LEVELS = { view: 0, comment: 1, edit: 2, owner: 3 };

export const canView = (permission) => (PERMISSION_LEVELS[permission] ?? -1) >= PERMISSION_LEVELS.view;
export const canComment = (permission) => (PERMISSION_LEVELS[permission] ?? -1) >= PERMISSION_LEVELS.comment;
export const canEdit = (permission) => (PERMISSION_LEVELS[permission] ?? -1) >= PERMISSION_LEVELS.edit;
