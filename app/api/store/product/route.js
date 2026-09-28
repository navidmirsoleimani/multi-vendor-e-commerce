import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import client from "@/configs/imageKit";
import prisma from "@/lib/prisma";

// add a new product
export async function POST(request) {
	try {
		const { userId } = getAuth(request);

		// middleware that gets a userId and returns their store
		const storeId = await authSeller(userId);

		if (!storeId) {
			return NextResponse.json({ error: "not authorized" }, { status: 401 });
		}

		// get the data from the form
		const formData = await request.formData();
		const name = formData.get("name");
		const description = formData.get("description");
		const mrp = Number(formData.get("mrp"));
		const price = Number(formData.get("price"));
		const category = formData.get("category");
		const images = formData.getAll("images");

		if (
			!name ||
			!description ||
			!mrp ||
			!price ||
			!category ||
			images.length < 1
		) {
			return NextResponse.json(
				{ error: "missing product details" },
				{ status: 400 }
			);
		}

		// upload image
		const imagesUrl = await Promise.all(
			images.map(async (image) => {
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
				return optimizedImage;
			})
		);

		// store in database
		await prisma.product.create({
			data: {
				name,
				description,
				mrp,
				category,
				images: imagesUrl,
				storeId,
			},
		});

		return NextResponse.json({ message: "Product added successfully" });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}

// Get all products for a seller
export async function GET(request) {
	try {
		const { userId } = getAuth(request);

		// middleware that gets a userId and returns their store
		const storeId = await authSeller(userId);

		if (!storeId) {
			return NextResponse.json({ error: "not authorized" }, { status: 401 });
		}

		const products = await prisma.product.findMany({
			where: {
				storeId,
			},
		});

		return NextResponse.json({ products });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}
