// Import env first so DATABASE_URL aliases are normalized before Prisma starts.
import "../config/env.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
