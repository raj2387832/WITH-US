import { Router, type IRouter, type Request, type Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const router: IRouter = Router();

const PYTHON_PORT = process.env.PYTHON_PORT || "5001";
const pythonTarget = `http://localhost:${PYTHON_PORT}`;

const proxy = createProxyMiddleware({
  target: pythonTarget,
  changeOrigin: true,
  pathRewrite: { "^/api/remove-bg": "/process" },
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

router.post("/remove-bg", proxy as any);

export default router;
