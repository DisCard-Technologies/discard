import { Router } from 'express';
import NotificationsController from '../notifications/notifications.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
const notificationsController = new NotificationsController();

// Apply authentication middleware
router.use(authMiddleware);

// Transaction Categories Route - delegated to notifications controller
// as it manages the transaction categorization system
router.get('/categories', notificationsController.getTransactionCategories.bind(notificationsController));

export default router;