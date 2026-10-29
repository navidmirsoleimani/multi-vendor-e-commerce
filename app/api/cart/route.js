import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Update user cart
export async function POST(request) {
	try {
		const { userId } = getAuth(request);
		if (!userId) {
			return NextResponse.json({ error: "Not Authorized!" }, { status: 401 });
		}

		const { cart } = await request.json();

		await prisma.user.update({
			where: { id: userId },
			data: { cart },
		});

		return NextResponse.json({ message: "Cart updated" });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}

// Get user cart
export async function GET(request) {
	try {
		const { userId } = getAuth(request);
		if (!userId) {
			return NextResponse.json({ error: "Not Authorized!" }, { status: 401 });
		}

		const user = await prisma.user.findUnique({ where: { id: userId } });

		return NextResponse.json({ cart: user?.cart ?? {} });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}
