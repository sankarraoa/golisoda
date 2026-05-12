import type { RendererProps } from "../shared/types";
import { CsatColorScale } from "../csat/shared/CsatColorScale";

export function Csat5ColorScale(props: RendererProps) {
  return <CsatColorScale max={5} onChange={props.onChange} value={props.value} />;
}

