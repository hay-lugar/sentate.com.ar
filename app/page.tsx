import { Footer } from "@/components/landing/footer";
import { ForBusiness } from "@/components/landing/for-business";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import { Pricing } from "@/components/landing/pricing";
import { Product } from "@/components/landing/product";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ForBusiness />
        <Product />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
