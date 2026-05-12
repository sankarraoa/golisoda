import type { RendererProps } from "../shared/types";
import { CsatNumeric } from "../csat/shared/CsatNumeric";

export function Csat5Numeric(props: RendererProps) {
  return <CsatNumeric max={5} onChange={props.onChange} value={props.value} />;
}

