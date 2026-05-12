import type { RendererProps } from "../shared/types";
import { CsatNumeric } from "../csat/shared/CsatNumeric";

export function Csat2Numeric(props: RendererProps) {
  return <CsatNumeric max={2} onChange={props.onChange} value={props.value} />;
}

