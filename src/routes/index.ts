import express from 'express';
import websocketRoutes from './websocket.routes';

const router = express.Router();

router.use('/websockets', websocketRoutes);

export default router;