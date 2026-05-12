import type { RendererProps } from "../shared/types";
import { CsatNumeric } from "../csat/shared/CsatNumeric";

export function Csat4Numeric(props: RendererProps) {
  return <CsatNumeric max={4} onChange={props.onChange} value={props.value} />;
}

