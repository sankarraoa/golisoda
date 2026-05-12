import type { RendererProps } from "../shared/types";
import { CsatStars } from "../csat/shared/CsatStars";

export function Csat5Stars(props: RendererProps) {
  return <CsatStars max={5} onChange={props.onChange} value={props.value} />;
}

