import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';

const analyticsRoutes = Router();
const controller = new AnalyticsController();

analyticsRoutes.get('/overview', controller.getOverview);
analyticsRoutes.get('/home', controller.getHome);
analyticsRoutes.get('/rankings', controller.getRankings);
analyticsRoutes.get('/feed', controller.getFeed);
analyticsRoutes.get('/screens/home', controller.getScreenHome);
analyticsRoutes.get('/screens/statistics', controller.getScreenStatistics);
analyticsRoutes.get('/screens/ranking', controller.getScreenPlayers);
analyticsRoutes.get('/screens/players', controller.getScreenPlayers);
analyticsRoutes.get('/screens/search', controller.getScreenSearch);

export { analyticsRoutes };
