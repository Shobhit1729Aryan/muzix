import { PrismaClient } from "../generated/prisma";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

declare global {
	// eslint-disable-next-line no-var
	var __prismaClient: PrismaClient | undefined;
}

const dbUrl = process.env.DATABASE_URL ?? "file:C:/Users/shobh/AppData/Local/muzix-data/dev.db";
const sqliteAdapterFactory = new PrismaBetterSQLite3({ url: dbUrl }, {});

const client = global.__prismaClient ?? new PrismaClient({ adapter: sqliteAdapterFactory });
if (process.env.NODE_ENV !== "production") global.__prismaClient = client;

export const prismaClient = client;
