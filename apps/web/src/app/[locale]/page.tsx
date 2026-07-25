import { getEmceePrices } from "@/lib/pricing";
import { HomeTemplate } from "@/modules/home";

export default async function Home() {
  const prices = await getEmceePrices();
  return <HomeTemplate prices={prices} />;
}
