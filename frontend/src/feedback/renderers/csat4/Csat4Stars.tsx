import type { RendererProps } from "../shared/types";
import { CsatStars } from "../csat/shared/CsatStars";

export function Csat4Stars(props: RendererProps) {
  return <CsatStars max={4} onChange={props.onChange} value={props.value} />;
}

