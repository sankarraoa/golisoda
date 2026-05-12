import type { RendererProps } from "../shared/types";
import { DEFAULT_EMOJI_5_LABELS, EMOJI_FACE_5 } from "../shared/constants";
import { EmojiRating } from "../csat/shared/EmojiRating";

export function Csat5Emoji(props: RendererProps) {
  return (
    <EmojiRating
      appearance="csat"
      defaults={DEFAULT_EMOJI_5_LABELS}
      emojis={EMOJI_FACE_5}
      onChange={props.onChange}
      question={props.question}
      value={props.value}
    />
  );
}

