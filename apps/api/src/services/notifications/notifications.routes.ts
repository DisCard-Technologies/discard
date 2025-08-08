import { Router } from 'express';
import NotificationsController from './notifications.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
const notificationsController = new NotificationsController();

// Apply authentication middleware to all notification routes
router.use(authMiddleware);

// Notification Preferences Routes
router.get('/preferences', notificationsController.getPreferences.bind(notificationsController));
router.put('/preferences', notificationsController.updatePreferences.bind(notificationsController));
router.put('/preferences/card/:cardId', notificationsController.updateCardPreferences.bind(notificationsController));

// Test Notification Route
router.post('/test', 
  notificationsController.rateLimitNotifications,
  notificationsController.testNotification.bind(notificationsController)
);

// Notification History Routes
router.get('/history', notificationsController.getNotificationHistory.bind(notificationsController));
router.delete('/history/:notificationId', notificationsController.deleteNotificationHistory.bind(notificationsController));

// Analytics Route (optional, for monitoring)
router.get('/metrics', notificationsController.getNotificationMetrics.bind(notificationsController));

export default router;