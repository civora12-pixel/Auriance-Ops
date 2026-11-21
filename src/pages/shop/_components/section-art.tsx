import { babiesOf } from "@shared/little-ones.ts";
import type { ShopSection } from "@shared/constants.ts";
import { useLittleOnes } from "../_lib/little-ones.ts";
import { GrowingBaby } from "./growing-baby.tsx";
import { Mom } from "./mom.tsx";
import { BIRTHDAYS_ON, useShoppingFor } from "../_lib/shopping-for.ts";

/**
 * The picture beside a section's title: in the kids sections mum runs after
 * the crawling baby (both twins when there are two, dressed for boy or girl);
 * in the women's section she has a well-earned cup of tea.
 */
export function SectionArt({ section }: { section: ShopSection }) {
  const { active } = useLittleOnes();
  const shopping = useShoppingFor();
  if (section === "women") return <Mom pose="tea" className="h-24 w-14 shrink-0" />;
  const babies = BIRTHDAYS_ON ? babiesOf(active ?? { gender: null, twins: null }) : shopping.babies;
  // Too young to crawl yet: shown crawling anyway, so there's something to chase
  const tier = active && active.tier >= 2 ? active.tier : 2;
  return (
    <span aria-hidden className="chase-scene flex shrink-0 items-end">
      <span className="chase-mom">
        <Mom pose="run" moving className="h-24 w-14" />
      </span>
      <span className="chase-baby -ms-1 flex items-end -space-x-4 rtl:space-x-reverse">
        {babies.map((g, i) => (
          <GrowingBaby key={i} tier={tier} gender={g} action="moving" className="h-14 w-14" />
        ))}
      </span>
    </span>
  );
}
