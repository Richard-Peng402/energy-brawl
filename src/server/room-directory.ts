import { randomBytes } from "node:crypto";

import { MAX_PLAYERS } from "../shared/constants";
import type { RoomDirectoryPhase, RoomSummary } from "../shared/protocol";
import { GameRoom } from "./room";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export interface DirectoryRoom {
  code: string;
  hostSocketId: string;
  room: GameRoom;
  createdAt: number;
  lastEmptyAt: number | null;
}

export class RoomDirectory {
  private readonly rooms = new Map<string, DirectoryRoom>();

  constructor(private readonly now: () => number = Date.now) {}

  createRoom(hostSocketId: string): DirectoryRoom {
    const code = this.nextCode();
    return this.registerRoom(code, new GameRoom(), hostSocketId);
  }

  registerRoom(code: string, room: GameRoom, hostSocketId = ""): DirectoryRoom {
    const normalized = normalizeRoomCode(code);
    if (!/^[A-Z2-9]{6}$/.test(normalized) || this.rooms.has(normalized)) {
      throw new Error(`Invalid or duplicate room code: ${code}`);
    }
    const now = this.now();
    const entry: DirectoryRoom = { code: normalized, hostSocketId, room, createdAt: now, lastEmptyAt: now };
    this.rooms.set(normalized, entry);
    return entry;
  }

  get(code: string): DirectoryRoom | undefined {
    return this.rooms.get(normalizeRoomCode(code));
  }

  list(): RoomSummary[] {
    return [...this.rooms.values()].map((entry) => this.summary(entry));
  }

  findJoinable(): DirectoryRoom | undefined {
    return [...this.rooms.values()]
      .filter((entry) => {
        const phase = entry.room.snapshot().lifecyclePhase ?? "lobby";
        return (phase === "lobby" || phase === "roleSelect") && entry.room.playerCount() < MAX_PLAYERS;
      })
      .sort((a, b) => a.createdAt - b.createdAt)[0];
  }

  findByReconnectToken(token: string): DirectoryRoom | undefined {
    return [...this.rooms.values()].find((entry) => entry.room.hasReconnectToken(token));
  }

  markActivity(entry: DirectoryRoom): void {
    entry.lastEmptyAt = entry.room.playerCount() === 0 ? this.now() : null;
  }

  removeIfEmpty(code: string, graceMs = 60_000): boolean {
    const normalized = normalizeRoomCode(code);
    const entry = this.rooms.get(normalized);
    if (!entry || entry.room.playerCount() > 0) return false;
    const emptySince = entry.lastEmptyAt ?? entry.createdAt;
    if (this.now() - emptySince < graceMs) return false;
    this.rooms.delete(normalized);
    return true;
  }

  roomCount(): number {
    return this.rooms.size;
  }

  entries(): DirectoryRoom[] {
    return [...this.rooms.values()];
  }

  private summary(entry: DirectoryRoom): RoomSummary {
    const snapshot = entry.room.snapshot();
    const phase: RoomDirectoryPhase = snapshot.lifecyclePhase === "countdown" || snapshot.lifecyclePhase === "playing" || snapshot.phase === "playing" || snapshot.phase === "overtime"
      ? "playing"
      : snapshot.lifecyclePhase === "results" || snapshot.phase === "finished"
        ? "finished"
        : "lobby";
    return {
      code: entry.code,
      playerCount: entry.room.playerCount(),
      maxPlayers: MAX_PLAYERS,
      phase,
      matchMode: snapshot.matchMode,
      mapSelection: snapshot.mapSelection,
    };
  }

  private nextCode(): string {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      const code = [...bytes].map((byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Unable to allocate a unique room code");
  }
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}
