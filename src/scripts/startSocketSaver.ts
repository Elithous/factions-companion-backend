import { startWorldSocket } from "../controllers/factionsWebsocket.controller";
import factionsConfig from "../config/factions.config";
import { initDB } from "../controllers/database.controller";

initDB().then(() => {
    startWorldSocket(factionsConfig.GAME_ID);
});