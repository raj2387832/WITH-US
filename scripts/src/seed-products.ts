import { stripe } from "./stripeClient";

interface CreditPack {
  name: string;
  description: string;
  credits: number;
  amountUSD: number;
}

const PACKS: CreditPack[] = [
  { name: "Starter Pack", description: "Perfect for occasional use", credits: 10, amountUSD: 199 },
  { name: "Pro Pack", description: "Best value for regular users", credits: 50, amountUSD: 799 },
  { name: "Power Pack", description: "For heavy usage and teams", credits: 200, amountUSD: 2499 },
];

async function seedProducts() {
  console.log("Seeding Stripe products and prices...\n");

  for (const pack of PACKS) {
    const product = await stripe.products.create({
      name: pack.name,
      description: pack.description,
      metadata: { credits: String(pack.credits) },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.amountUSD,
      currency: "usd",
    });

    console.log(`Created: ${pack.name}`);
    console.log(`  Product ID: ${product.id}`);
    console.log(`  Price ID:   ${price.id}`);
    console.log(`  Credits:    ${pack.credits}`);
    console.log(`  Amount:     $${(pack.amountUSD / 100).toFixed(2)}\n`);
  }

  console.log("Done! Copy the Price IDs above into your Stripe configuration or environment.");
}

seedProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
