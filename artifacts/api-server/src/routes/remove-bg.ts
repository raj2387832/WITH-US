import { Router, type IRouter, type Request, type Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { storage } from "../storage";

const router: IRouter = Router();

const PYTHON_PORT = process.env.PYTHON_PORT || "5001";
const pythonTarget = `http://localhost:${PYTHON_PORT}`;

const proxy = createProxyMiddleware({
  target: pythonTarget,
  changeOrigin: true,
  pathRewrite: { "^/remove-bg": "/process" },
  on: {
    error: (err: Error, _req: Request, res: Response) => {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Background removal service unavailable",
          details: err.message,
        });
      }
    },
  },
});

router.post("/remove-bg", async (req: Request, res: Response, next) => {
  try {
    if (!(req as any).isAuthenticated || !(req as any).isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.creditsBalance < 1) {
      return res.status(402).json({
        error: "Insufficient credits",
        balance: 0,
        message: "You need at least 1 credit to process an image.",
      });
    }

    await storage.deductCredits(userId, 1, "Used 1 credit: Background Removal (server)");

    (proxy as any)(req, res, next);
  } catch (err: any) {
    console.error("remove-bg auth/credit error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
