import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { endOfDay } from "date-fns";
import { NextResponse } from "next/server";

// Update user cart
export async function POST(request) {
	try {
		const { userId, has } = getAuth(request);
		if (!userId) {
			return NextResponse.json({ error: "Not Authorized!" }, { status: 401 });
		}

		const { addressID, items, couponCode, paymentMethod } =
			await request.json();

		if (
			!addressID ||
			!items ||
			Array.isArray(items) ||
			!items.length === 0 ||
			!paymentMethod
		) {
			return NextResponse.json(
				{ error: "Missing order details!" },
				{ status: 400 }
			);
		}

		let coupon = null;

		// we have to check and calculate here,
		// becuase we can neither send the total price from front-end
		// nor send the coupon after checking in front-end

		if (couponCode) {
			// copied from /api/coupon route
			coupon = await prisma.coupon.findUnique({
				where: {
					code: couponCode.toUpperCase(),
				},
			});
			if (!coupon) {
				return NextResponse.json(
					{ error: "Coupon not found" },
					{ status: 404 }
				);
			}
		}

		if (couponCode && coupon?.forNewUser) {
			// new : it should be their first order
			const userorders = await prisma.order.findMany({
				where: { userId },
			});
			if (userorders > 0) {
				return NextResponse.json(
					{ error: "Coupon is valid for new users only!" },
					{ status: 400 }
				);
			}
		}
		const isPlusMember = has({ plan: "plus" });

		if (couponCode && coupon?.forMember) {
			if (!isPlusMember) {
				return NextResponse.json(
					{ error: "Coupon is valid for plus members only!" },
					{ status: 400 }
				);
			}
		}

		// Group orders by storeId using a Map
		// because user may have products with different sellers
		const ordersByStore = new Map();
		for (const item of items) {
			const product = await prisma.product.findUnique({
				where: {
					id: item.id,
				},
			});
			const storeId = product.storeId;
			if (!ordersByStore.has(storeId)) {
				ordersByStore.set(storeId, []);
			}
			ordersByStore.get(storeId).push({ ...item, price: product.price });

			let orderIds = [];
			let fullAmount = 0;

			let isShippingFeeAdded = false;

			// create order for each seller
			for (const [storeId, sellerItems] of ordersByStore.entries()) {
				let total = sellerItems.reduce(
					(acc, item) => acc + item.price * item.quantity,
					0
				);

				if (couponCode) {
					total -= (total * coupon.discount) / 100;
				}

				if (!isPlusMember && !isShippingFeeAdded) {
					// static 5$ shipping fee
					total += 5;
					isShippingFeeAdded = true;
				}

				fullAmount += parseFloat(total.toFixed(2));

				const order = await prisma.order.create({
					data: {
						userId,
						storeId,
						addressID,
						total: parseFloat(total.toFixed(2)),
						paymentMethod,
						isCouponUsed: coupon ? true : false,
						coupon: coupon ?? {},
						orderItems: {
							create: sellerItems.map((item) => ({
								productId: item.id,
								quantity: item.quantity,
								price: item.price,
							})),
						},
					},
				});
				orderIds.push(order.id);
			}
		}

		// clear the cart
		await prisma.user.update({
			where: {
				id: userId,
			},
			data: {
				cart: {},
			},
		});

		return NextResponse.json({ message: "Order placed successfully!" });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}

// get all orders for a user
export async function GET(request) {
	try {
		const { userId } = getAuth(request);

		const orders = await prisma.order.findMany({
			where: {
				userId,
				OR: [
					{ paymentMethod: paymentMethod.COD },
					{ AND: [{ paymentMethod: paymentMethod.stripe }, { isPaid: true }] },
				],
			},
			include: {
				orderItems: { include: { product: true } },
				addres: true,
			},
			orderBy: { createdAt: "desc" },
		});

		return NextResponse.json({ orders });
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}
