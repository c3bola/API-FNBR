import { NextFunction, Request, Response } from 'express';
import {
  AnalyticsService,
  AnalyticsValidationError,
} from './analytics.service';

export class AnalyticsController {
  private readonly service = new AnalyticsService();

  getOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.getOverview());
    } catch (error) {
      next(error);
    }
  };

  getHome = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await this.service.getHome(req.query.limit) });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getRankings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.getRankings(req.query.category, req.query.limit));
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getFeed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.getActivity(req.query.limit));
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getScreenHome = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await this.service.getScreenHome(req.query.limit) });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getScreenStatistics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await this.service.getScreenStatistics() });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getScreenPlayers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await this.service.getScreenPlayers(
        req.query.search, req.query.sort, req.query.page, req.query.page_size,
      ) });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  getScreenSearch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (typeof req.query.search !== 'string' || req.query.search.trim().length === 0) {
        throw new AnalyticsValidationError('search is required.');
      }
      res.json({ success: true, data: await this.service.getScreenPlayers(
        req.query.search, req.query.sort, req.query.page, req.query.page_size,
      ) });
    } catch (error) {
      this.handleError(error, res, next);
    }
  };

  private handleError(error: unknown, res: Response, next: NextFunction): void {
    if (error instanceof AnalyticsValidationError) {
      res.status(400).json({ statusCode: 400, message: error.message, error: 'Bad Request' });
    } else {
      next(error);
    }
  }
}
