import express from 'express';
import websocketRoutes from './websocket.routes';
import reportRoutes from './reports.routes';

const router = express.Router();

router.use('/websocket', websocketRoutes);
router.use('/report/', reportRoutes);

export default router;