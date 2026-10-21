import { Footer } from "@/components/landing/footer";
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
        <Product />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
