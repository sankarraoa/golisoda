import type { RendererProps } from "../shared/types";
import { CsatColorScale } from "../csat/shared/CsatColorScale";

export function Csat4ColorScale(props: RendererProps) {
  return <CsatColorScale max={4} onChange={props.onChange} value={props.value} />;
}

