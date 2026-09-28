// check whether the user is seller or not and get the store info

import prisma from "@/lib/prisma";
import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(request) {
	try {
		const { userId } = getAuth();

		const isSeller = await authSeller(userId);

		if (!isSeller) {
			return NextResponse.json({ error: "not authorize" }, { status: 401 });
		}

		const storeInfo = await prisma.store.findUnique({
			where: {
				userId,
			},
		});

		return NextResponse.json({ isSeller, storeInfo });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}
