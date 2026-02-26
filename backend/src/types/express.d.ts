import "express";

declare global {
  namespace Express {
    interface UserPayload {
      userId: string;
      email: string;
      name: string;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
