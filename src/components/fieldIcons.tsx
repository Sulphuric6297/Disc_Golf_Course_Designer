// Each field, court and play area's small picture, the same on the tool bar's chips, in a field's
// panel and on a phone's strip.
import { Castle, Columns2, Columns3, Diamond, Dog, Dribbble, Droplets, Flower2, Goal, Grid2x2, RectangleHorizontal, Timer, Volleyball, Waves, Activity, type LucideIcon } from "lucide-react";
import type { FieldKind } from "../types";

const ICONS: Record<FieldKind, LucideIcon> = {
  baseball: Diamond, softball: Diamond, soccer: Goal, football: Columns3, multi: RectangleHorizontal,
  tennis: Grid2x2, pickleball: Columns2, basketball: Dribbble, volleyball: Volleyball,
  playground: Castle, pool: Waves, splash: Droplets, dog: Dog, skate: Activity, track: Timer, garden: Flower2
};

export const fieldIcon = (k: FieldKind, size = 14) => {
  const Icon = ICONS[k];
  return <Icon size={size} className="shrink-0" />;
};
