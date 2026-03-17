import { Router, type IRouter } from "express";
import healthRouter from "./health";
import removeBgRouter from "./remove-bg";

const router: IRouter = Router();

router.use(healthRouter);
router.use(removeBgRouter);

export default router;
