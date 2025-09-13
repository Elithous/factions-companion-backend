import { FactionColor } from "../faction.type";

export type FactionsGame = {
    id: number;
    status: 'LOBBY' | 'COMPLETED' | 'IN_PROGRESS' | 'PLAYING';
    type: string | 'STANDARD' | 'SHORT';
    winner: FactionColor | null;
    winning: FactionColor | null;
    winningDate: string | null;
    victoryDate: string | null;
    map: string | null;
    public: "ALL" | "PREMIUM" | "AUTHENTICATED";
    points: Record<FactionColor, number>;
    numberOfPlayers: number;
    remainingSlots: number;
    canJoinAfterStart: boolean;
    isOpen: boolean;
    participating: boolean;
    maxPlayers: number;
    maxGroupSize: number;
}; 