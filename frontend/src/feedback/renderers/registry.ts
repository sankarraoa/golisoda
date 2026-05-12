import type { ComponentType } from "react";

import { Csat2Emoji } from "./csat2/Csat2Emoji";
import { Csat2Numeric } from "./csat2/Csat2Numeric";
import { Csat2Thumbs } from "./csat2/Csat2Thumbs";
import { Csat2YesNo } from "./csat2/Csat2YesNo";
import { Csat4ColorScale } from "./csat4/Csat4ColorScale";
import { Csat4Emoji } from "./csat4/Csat4Emoji";
import { Csat4Numeric } from "./csat4/Csat4Numeric";
import { Csat4Stars } from "./csat4/Csat4Stars";
import { Csat5ColorScale } from "./csat5/Csat5ColorScale";
import { Csat5Emoji } from "./csat5/Csat5Emoji";
import { Csat5Numeric } from "./csat5/Csat5Numeric";
import { Csat5Stars } from "./csat5/Csat5Stars";
import { DropdownDefault } from "./dropdown/DropdownDefault";
import { EmailDefault } from "./email/EmailDefault";
import { MultiSelectionDefault } from "./multiSelection/MultiSelectionDefault";
import { NpsNumeric } from "./nps/NpsNumeric";
import { NpsSegmented } from "./nps/NpsSegmented";
import { PlainTextDefault } from "./plainText/PlainTextDefault";
import { PhoneDefault } from "./phone/PhoneDefault";
import { ShortTextDefault } from "./shortText/ShortTextDefault";
import { SingleSelectionDefault } from "./singleSelection/SingleSelectionDefault";
import type { RendererProps } from "./shared/types";

export const rendererRegistry: Record<string, ComponentType<RendererProps>> = {
  "nps:numeric": NpsNumeric,
  "nps:segmented": NpsSegmented,
  "nps:default": NpsNumeric,

  "csat_5:numeric": Csat5Numeric,
  "csat_5:stars": Csat5Stars,
  "csat_5:emoji_5": Csat5Emoji,
  "csat_5:color_scale": Csat5ColorScale,
  "csat_5:default": Csat5Numeric,

  "csat_4:numeric": Csat4Numeric,
  "csat_4:stars": Csat4Stars,
  "csat_4:emoji_4": Csat4Emoji,
  "csat_4:color_scale": Csat4ColorScale,
  "csat_4:default": Csat4Numeric,

  "csat_2:numeric": Csat2Numeric,
  "csat_2:thumbs": Csat2Thumbs,
  "csat_2:emoji_2": Csat2Emoji,
  "csat_2:yes_no": Csat2YesNo,
  "csat_2:default": Csat2Numeric,

  "dropdown:default": DropdownDefault,
  "single_selection:default": SingleSelectionDefault,
  "multi_selection:default": MultiSelectionDefault,

  "short_text:default": ShortTextDefault,
  "phone:default": PhoneDefault,
  "email:default": EmailDefault,
  "plain_text:default": PlainTextDefault,
};

