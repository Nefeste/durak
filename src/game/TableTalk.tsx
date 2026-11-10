// Реплики соперников поверх их вееров и «думает…» у решающего бота (docs/09-game-design.md, «Живой стол»). Своя
// реплика стоит над рукой — её ставит экран в строку подсказки (`MyBubble`).
import React from 'react';
import { T } from '../i18n';
import type { Layout } from '../render/layout';
import { Bubble } from './Bubble';
import type { Bubble as Said } from './useSpeech';

export function Speech({ layout, bubbles, thinking, less }: {
  layout: Layout; bubbles: Said[];
  /** Место бота, который сейчас решает дольше THINK_SHOW; `null` — никто (и всегда онлайн). */
  thinking: number | null; less: boolean;
}) {
  return (
    <>
      {layout.opponents.map(p => {
        const b = bubbles.find(x => x.seat === p.seat);
        if (b) return <Bubble key={`s${b.id}`} text={T.game.say[b.word]} x={p.x} y={p.y} less={less} testID={`say-${p.seat}`} />;
        if (thinking === p.seat) return <Bubble key={`t${p.seat}`} quiet text={T.game.botThinking} x={p.x} y={p.y} less={less} testID={`thinks-${p.seat}`} />;
        return null;
      })}
    </>
  );
}

/** Своя реплика — посередине строки подсказки над рукой (строка шириной `width`). */
export function MyBubble({ bubbles, seat, width, less }: { bubbles: Said[]; seat: number; width: number; less: boolean }) {
  const b = bubbles.find(x => x.seat === seat);
  return b ? <Bubble key={`s${b.id}`} text={T.game.say[b.word]} x={width / 2} y={14} less={less} testID={`say-${seat}`} /> : null;
}
