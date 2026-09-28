import type { Board, BoardMembership, Specialty } from "@shared/schema";
import { col, COLLECTIONS, queryAll, queryIn } from "./firestore";

export async function getActiveMemberships(userId: number) {
  return queryAll<BoardMembership>(col(COLLECTIONS.boardMemberships).where("userId", "==", userId).where("isActive", "==", true));
}
export async function getBoardRoles(userId: number, boardId: number) {
  return (await getActiveMemberships(userId)).filter(item => item.boardId === boardId).map(item => ({ role: item.role }));
}
export async function canAccessBoard(userId: number, role: "admin" | "user", boardId: number) { if (role === "admin") return true; return (await getBoardRoles(userId, boardId)).length > 0; }
// Board ids the user may see, or null when every board is visible (admins).
// General secretariat heads oversee every board, like administrators.
export async function accessibleBoardIds(userId: number, role: "admin" | "user", generalHead = false) { if (role === "admin" || generalHead) return null; return Array.from(new Set((await getActiveMemberships(userId)).map(item => item.boardId))); }
export async function listReferenceData(userId: number, role: "admin" | "user", generalHead = false) {
  const boardIds = await accessibleBoardIds(userId, role, generalHead);
  const boardRows = boardIds === null ? await queryAll<Board>(col(COLLECTIONS.boards).where("isActive", "==", true)) : (await queryIn<Board>(COLLECTIONS.boards, "id", boardIds)).filter(board => board.isActive);
  boardRows.sort((a, b) => a.id - b.id);
  const specialtyRows = (await queryIn<Specialty>(COLLECTIONS.specialties, "boardId", boardRows.map(board => board.id))).sort((a, b) => a.id - b.id);
  return { boards: boardRows, specialties: specialtyRows };
}
