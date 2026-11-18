import express from 'express';

import { adminRateLimit, reportRateLimit, shortPublicCache } from '../http/rateLimit';
import reportRoutes from './reports.routes';
import websocketRoutes from './websocket.routes';

const router = express.Router();

router.use('/websocket', adminRateLimit, websocketRoutes);
// The limiter runs first so a 429 isn't marked as cacheable.
router.use('/report', reportRateLimit, shortPublicCache, reportRoutes);

export default router;
