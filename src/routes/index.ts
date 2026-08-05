import express from 'express';

import reportRoutes from './reports.routes';
import websocketRoutes from './websocket.routes';

const router = express.Router();

router.use('/websocket', websocketRoutes);
router.use('/report', reportRoutes);

export default router;
