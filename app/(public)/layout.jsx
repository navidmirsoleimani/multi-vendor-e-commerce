"use client";
import Banner from "@/components/Banner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchProducts } from "@/lib/features/product/productSlice";
import { fetchCart, uploadCart } from "@/lib/features/cart/cartSlice";
import { useAuth, useUser } from "@clerk/nextjs";
import { fetchAdress } from "@/lib/features/address/addressSlice";

export default function PublicLayout({ children }) {
	const dispatch = useDispatch();
	const { user } = useUser();
	const { getToken } = useAuth();

	const { cartItems } = useSelector((state) => state.cart);

	useEffect(() => {
		// empty object
		dispatch(fetchProducts({}));
	}, []);

	useEffect(() => {
		if (user) {
			dispatch(fetchCart({ getToken }));
			dispatch(fetchAdress({ getToken }));
		}
	}, [user]);

	// whenever cartItems changes it will store it in database after 1 sec
	useEffect(() => {
		if (user) {
			dispatch(uploadCart({ getToken }));
		}
	}, [cartItems]);

	return (
		<>
			<Banner />
			<Navbar />
			{children}
			<Footer />
		</>
	);
}
