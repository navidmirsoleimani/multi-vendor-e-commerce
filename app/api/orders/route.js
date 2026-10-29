import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

// Place an order (one order per store)
export async function POST(request) {
	try {
		const { userId, has } = getAuth(request);
		if (!userId) {
			return NextResponse.json({ error: "Not Authorized!" }, { status: 401 });
		}

		const { addressId, items, couponCode, paymentMethod } =
			await request.json();

		if (
			!addressId ||
			!Array.isArray(items) ||
			items.length === 0 ||
			!paymentMethod
		) {
			return NextResponse.json(
				{ error: "Missing order details!" },
				{ status: 400 }
			);
		}

		if (!Object.values(PaymentMethod).includes(paymentMethod)) {
			return NextResponse.json(
				{ error: "Invalid payment method!" },
				{ status: 400 }
			);
		}

		const isPlusMember = has({ plan: "plus" });

		// ---------- Coupon validation ----------
		// Totals are calculated here on the server: the client's price and
		// coupon data are never trusted.
		let coupon = null;

		if (couponCode) {
			coupon = await prisma.coupon.findUnique({
				where: { code: couponCode.toUpperCase() },
			});

			if (!coupon) {
				return NextResponse.json(
					{ error: "Coupon not found" },
					{ status: 404 }
				);
			}

			// TODO: add an expiry check here if your Coupon model has one

			if (coupon.forNewUser) {
				const orderCount = await prisma.order.count({ where: { userId } });
				if (orderCount > 0) {
					return NextResponse.json(
						{ error: "Coupon is valid for new users only!" },
						{ status: 400 }
					);
				}
			}

			if (coupon.forMember && !isPlusMember) {
				return NextResponse.json(
					{ error: "Coupon is valid for plus members only!" },
					{ status: 400 }
				);
			}
		}

		// ---------- Load products (single query) ----------
		const productIds = [...new Set(items.map((item) => item.id))];
		const products = await prisma.product.findMany({
			where: { id: { in: productIds } },
		});
		const productMap = new Map(products.map((p) => [p.id, p]));

		// ---------- Group items by store ----------
		// A user can have products from different sellers, so each store
		// gets its own order.
		const ordersByStore = new Map();

		for (const item of items) {
			const product = productMap.get(item.id);

			if (!product) {
				return NextResponse.json(
					{ error: `Product not found: ${item.id}` },
					{ status: 404 }
				);
			}

			if (!Number.isInteger(item.quantity) || item.quantity < 1) {
				return NextResponse.json(
					{ error: "Invalid quantity!" },
					{ status: 400 }
				);
			}

			if (!ordersByStore.has(product.storeId)) {
				ordersByStore.set(product.storeId, []);
			}

			// price always comes from the DB, never from the client
			ordersByStore.get(product.storeId).push({
				id: product.id,
				quantity: item.quantity,
				price: product.price,
			});
		}

		// ---------- Create one order per store, atomically ----------
		const orderIds = [];
		let fullAmount = 0;
		let isShippingFeeAdded = false;

		await prisma.$transaction(async (tx) => {
			for (const [storeId, sellerItems] of ordersByStore.entries()) {
				let total = sellerItems.reduce(
					(acc, item) => acc + item.price * item.quantity,
					0
				);

				if (coupon) {
					total -= (total * coupon.discount) / 100;
				}

				// Flat $5 shipping, charged once for the whole checkout
				if (!isPlusMember && !isShippingFeeAdded) {
					total += 5;
					isShippingFeeAdded = true;
				}

				total = parseFloat(total.toFixed(2));
				fullAmount += total;

				const order = await tx.order.create({
					data: {
						userId,
						storeId,
						addressId,
						total,
						paymentMethod,
						isCouponUsed: !!coupon,
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

			// For COD the order is final, so clear the cart now.
			// For Stripe, clear it after payment is confirmed (webhook).
			if (paymentMethod === PaymentMethod.COD) {
				await tx.user.update({
					where: { id: userId },
					data: { cart: {} },
				});
			}
		});

		if (paymentMethod === PaymentMethod.STRIPE) {
			// TODO: create the Stripe Checkout session here, using
			// orderIds in metadata and fullAmount for the total, then:
			// return NextResponse.json({ session });
			return NextResponse.json(
				{ error: "Stripe checkout is not implemented yet" },
				{ status: 501 }
			);
		}

		return NextResponse.json({
			message: "Order placed successfully!",
			orderIds,
			fullAmount: parseFloat(fullAmount.toFixed(2)),
		});
	} catch (error) {
		console.error(error);
		return NextResponse.json(
			{ error: error.message || "something went wrong" },
			{ status: 400 }
		);
	}
}

// Get all orders for a user
export async function GET(request) {
	try {
		const { userId } = getAuth(request);
		if (!userId) {
			return NextResponse.json({ error: "Not Authorized!" }, { status: 401 });
		}

		const orders = await prisma.order.findMany({
			where: {
				userId,
				OR: [
					{ paymentMethod: PaymentMethod.COD },
					{ AND: [{ paymentMethod: PaymentMethod.STRIPE }, { isPaid: true }] },
				],
			},
			include: {
				orderItems: { include: { product: true } },
				address: true,
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
