import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
	connectionString: process.env.DIRECT_URL,
	connectionTimeoutMillis: 20000,
	idleTimeoutMillis: 10000,
	max: 5,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

export default prisma;
