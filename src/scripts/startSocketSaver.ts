import { startWorldSocket } from "../controllers/factionsWebsocket.controller";
import { initDB } from "../controllers/database.controller";

const gameId = process.argv.find((value) => value.includes('GAME_ID=')).substring(8);

initDB().then(() => {
    startWorldSocket(gameId);
});