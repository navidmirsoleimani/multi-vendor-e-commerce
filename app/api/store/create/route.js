import client from "@/configs/imageKit";
import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { connect } from "react-redux";

export async function POST(request) {
	try {
		const { userId } = getAuth(request);

		if (!userId) {
			return NextResponse.json({ error: "unauthorized" }, { status: 401 });
		}

		const formData = await request.formData();

		const name = formData.get("name");
		const username = formData.get("username");
		const description = formData.get("description");
		const email = formData.get("email");
		const contact = formData.get("contact");
		const address = formData.get("address");
		const image = formData.get("image");

		if (
			!name ||
			!username ||
			!description ||
			!email ||
			!contact ||
			!address ||
			!image
		) {
			return NextResponse.json(
				{ error: "missing store info" },
				{ status: 400 }
			);
		}

		// check if user has already registered a store
		const store = await prisma.store.findFirst({
			where: { userId },
		});
		if (store) {
			return NextResponse.json({ status: store.status });
		}

		// check if username is already taken
		const isUsernameTaken = await prisma.store.findFirst({
			where: { username: username.toLowerCase() },
		});
		if (isUsernameTaken) {
			return NextResponse.json(
				{ error: "username already taken" },
				{ status: 400 }
			);
		}

		// upload image
		const buffer = Buffer.from(await image.arrayBuffer());
		const uploadResponse = await client.files.upload({
			file: buffer,
			fileName: image.name,
			folder: "logos",
		});

		// build optimized url
		const optimizedImage = client.helper.buildSrc({
			urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
			src: uploadResponse.filePath,
			transformation: [
				{ quality: "auto" },
				{ format: "webp" },
				{ width: "512" },
			],
		});

		// create store
		const newStore = await prisma.store.create({
			data: {
				userId,
				name,
				description,
				username: username.toLowerCase(),
				email,
				contact,
				address,
				logo: optimizedImage,
			},
		});

		// link store to user
		await prisma.user.update({
			where: {
				id: userId,
			},
			data: { store: { connect: { id: newStore.id } } },
		});

		return NextResponse.json({ message: "applied, waiting for approval" });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}

// check if user have already registered a store

export async function GET(params) {
	try {
		const { userId } = getAuth(request);

		// check if user has already registered a store
		const store = await prisma.store.findFirst({
			where: { userId },
		});
		if (store) {
			return NextResponse.json({ status: store.status });
		}
		return NextResponse.json({ status: "not registered" });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}
