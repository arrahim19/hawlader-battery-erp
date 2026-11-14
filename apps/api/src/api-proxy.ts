import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./auth";

export function apiProxy(secret: string | undefined) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!secret || req.path === "/api/v1/health") return next();
    const supplied = Buffer.from(req.get("X-ERP-Proxy-Secret") ?? "");
    const expected = Buffer.from(secret);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res
        .status(403)
        .json({
          error: { message: "Use the ERP website to access this service." },
        });
      return;
    }
    const ip = req.get("X-ERP-Client-IP");
    if (ip && isIP(ip)) req.trustedClientIp = ip;
    next();
  };
}
