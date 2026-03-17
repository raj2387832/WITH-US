import { Router, type IRouter } from "express";
import healthRouter from "./health";
import removeBgRouter from "./remove-bg";
import authRouter from "./auth";
import creditsRouter from "./credits";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(removeBgRouter);
router.use(authRouter);
router.use(creditsRouter);
router.use(adminRouter);

export default router;
