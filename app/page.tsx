import { FinalCta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";
import { PhoneMockup } from "@/components/landing/phone-mockup";
import { StatsStrip } from "@/components/landing/stats-strip";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero phone={<PhoneMockup />} />
        <StatsStrip />
        <HowItWorks />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
