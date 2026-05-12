import type { RendererProps } from "../shared/types";
import { DEFAULT_EMOJI_4_LABELS, EMOJI_FACE_4 } from "../shared/constants";
import { EmojiRating } from "../csat/shared/EmojiRating";

export function Csat4Emoji(props: RendererProps) {
  return (
    <EmojiRating
      appearance="csat"
      defaults={DEFAULT_EMOJI_4_LABELS}
      emojis={EMOJI_FACE_4}
      onChange={props.onChange}
      question={props.question}
      value={props.value}
    />
  );
}

