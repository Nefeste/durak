// Портрет соперника-бота, нарисованный кодом (решение владельца #20; docs/13-art.md, §11): медальон — скруглённый
// квадрат тёмного сукна с кромкой стекла, в нём погрудный силуэт простыми формами: плечи цветом одежды, лицо, причёска
// и одна-две детали (очки, усы, кепка) — по ним персонажа узнают на плашке в 34 точки. Ни фото, ни картинок из
// генераторов (устав, ADR 0012): только фигуры react-native-svg и палитра `PORTRAIT` из src/ui/theme.ts.
// У человека портрета нет — в том же медальоне первая буква его имени. Подпись «бот» (`BotChip`) — всегда рядом
// с портретом бота: внахлёст на нижнюю кромку медальона (устав «Честность», ADR 0011).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { T } from '../i18n';
import { PLATE } from '../render/layout';
import { C, PORTRAIT as P, RADIUS, SPACE, TYPE } from '../ui/theme';
import type { Look, Rival } from './rivals';

/** Медальон в итоге, схеме мест и меню, dp; на плашке стола — `PLATE.side` (44, сбоку от имени) и `PLATE.top` (38, над именем). */
export const FACE = { tile: 36 } as const;

/** Шапка волос над лбом: от виска до виска. */
const CAP = 'M13.4 21.5 C12.6 9.5 19 8.2 24 8.2 C29 8.2 35.4 9.5 34.6 21.5 C33.6 17.5 31.5 15 24 15 C16.5 15 14.4 17.5 13.4 21.5 Z';

function hairBack(look: Look, color: string) {
  switch (look.hair) {
    case 'bob': return <Path d="M11.6 31.5 C10.4 14 15.5 8.4 24 8.4 C32.5 8.4 37.6 14 36.4 31.5 C36.4 33.4 33.6 33.4 33 31.5 L15 31.5 C14.4 33.4 11.6 33.4 11.6 31.5 Z" fill={color} />;
    case 'long': return <Path d="M12.2 43 C9.4 24 11.5 8.4 24 8.4 C36.5 8.4 38.6 24 35.8 43 C33 44.6 15 44.6 12.2 43 Z" fill={color} />;
    case 'tail': return <Path d="M32 12 C38.5 13 40.5 21 38.6 31.5 C38 34 35 33.5 35.2 31 C35.8 25 35 20 31.5 17 Z" fill={color} />;
    case 'pigtails': return (
      <G>
        <Path d="M14.5 20 C9.5 20.5 8.6 28 10.4 33.4 C11.2 35.4 13.8 34.6 13.6 32.4 C13.2 28.5 14 25 15.6 23 Z" fill={color} />
        <Path d="M33.5 20 C38.5 20.5 39.4 28 37.6 33.4 C36.8 35.4 34.2 34.6 34.4 32.4 C34.8 28.5 34 25 32.4 23 Z" fill={color} />
      </G>
    );
    case 'bun': return <Circle cx={24} cy={7.6} r={4.4} fill={color} />;
    default: return null;
  }
}

function hairFront(look: Look, color: string) {
  switch (look.hair) {
    case 'bald': return (
      <G>
        <Path d="M13.6 23.4 C12.6 20 13.2 17 14.8 15.4 C15.6 18 15.6 21 15.4 23.6 Z" fill={color} />
        <Path d="M34.4 23.4 C35.4 20 34.8 17 33.2 15.4 C32.4 18 32.4 21 32.6 23.6 Z" fill={color} />
      </G>
    );
    case 'curly': return (
      <G>
        {[[14.4, 17.4], [16.4, 12.6], [20.4, 9.6], [25.2, 8.8], [29.8, 10.4], [32.8, 13.8], [34, 18]].map(([x, y]) => <Circle key={x} cx={x} cy={y} r={3.7} fill={color} />)}
        <Path d="M15 16 C18 12.5 30 12.5 33 16 C30 14.6 18 14.6 15 16 Z" fill={color} />
      </G>
    );
    case 'part': return <Path d="M13.4 21.5 C12.6 9.5 19 8.2 25 8.2 C31 8.2 35.4 10.5 34.6 21.5 C33.4 17 31.6 14.6 27.4 13.6 C22.5 16.6 16.5 16.4 13.4 21.5 Z" fill={color} />;
    case 'swept': return <Path d="M13.6 20.5 C12.8 9.4 19 7.8 24 7.8 C29 7.8 35.2 9.4 34.4 20.5 C33.4 15.4 30.5 12.6 24 12.6 C17.5 12.6 14.6 15.4 13.6 20.5 Z" fill={color} />;
    case 'bob': return <Path d="M13.4 22.5 C12.6 9.5 19 8.2 24 8.2 C29 8.2 35.4 9.5 34.6 22.5 C33.8 19 32 17.4 24 17.4 C16 17.4 14.2 19 13.4 22.5 Z" fill={color} />;
    case 'long': return <Path d="M13.2 23 C12.4 9.5 19 8.2 25 8.2 C31 8.2 35.6 10.5 34.8 23 C33.6 17.6 31 14.6 28 13.4 C24 17 17 17.6 13.2 23 Z" fill={color} />;
    case 'pigtails': return <Path d="M13.4 21.5 C12.6 9.5 19 8.2 24 8.2 C29 8.2 35.4 9.5 34.6 21.5 C33.6 18 31.5 16.4 24 13 C16.5 16.4 14.4 18 13.4 21.5 Z" fill={color} />;
    case 'tail': return <Path d="M13.4 21.5 C12.6 9.5 19 8.2 24 8.2 C29 8.2 35.4 9.5 34.6 21.5 C33.6 17.5 32 15.6 29 14.6 C24 17.6 17.5 16.6 13.4 21.5 Z" fill={color} />;
    case 'bun': return <Path d="M13.6 20.5 C12.8 9.4 19 8.4 24 8.4 C29 8.4 35.2 9.4 34.4 20.5 C33.4 16 30.5 13.6 24 13.6 C17.5 13.6 14.6 16 13.6 20.5 Z" fill={color} />;
    default: return <Path d={CAP} fill={color} />;
  }
}

function extras(look: Look, hair: string, trim: string) {
  const has = (e: Look['extras'][number]) => look.extras.includes(e);
  return (
    <G>
      {has('freckles') ? [[18.2, 24.6], [19.8, 25.4], [17.4, 26], [29.8, 24.6], [28.2, 25.4], [30.6, 26]].map(([x, y]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.5} fill={P.shade[look.skin]} />) : null}
      {has('beard') ? <Path d="M14.8 23 C14.6 30.6 19 34.2 24 34.2 C29 34.2 33.4 30.6 33.2 23 C32.2 26.4 30 25.6 28 25 C26.4 24.5 25 24.6 24 25.2 C23 24.6 21.6 24.5 20 25 C18 25.6 15.8 26.4 14.8 23 Z M21.4 27.8 C23 29 25 29 26.6 27.8 C25 27.2 23 27.2 21.4 27.8 Z" fill={hair} fillRule="evenodd" /> : null}
      {has('goatee') ? <Path d="M21 29.4 C21.6 28.4 26.4 28.4 27 29.4 C27 32 25.6 33.4 24 33.4 C22.4 33.4 21 32 21 29.4 Z" fill={hair} /> : null}
      {has('moustache') || has('goatee') ? <Path d="M18.8 26.8 C20.6 24.6 23 24.8 24 25.8 C25 24.8 27.4 24.6 29.2 26.8 C27.2 27.6 25.2 27.4 24 26.8 C22.8 27.4 20.8 27.6 18.8 26.8 Z" fill={hair} /> : null}
      {has('earrings') ? <G><Circle cx={14.6} cy={26.4} r={1.3} fill={P.metal} /><Circle cx={33.4} cy={26.4} r={1.3} fill={P.metal} /></G> : null}
      {has('glasses') ? (
        <G stroke={P.ink} strokeWidth={1.2} fill="none">
          <Circle cx={19.9} cy={21.8} r={3.3} /><Circle cx={28.1} cy={21.8} r={3.3} /><Path d="M23.2 21.4 H24.8 M16.6 21.2 L14.6 20.4 M31.4 21.2 L33.4 20.4" />
        </G>
      ) : null}
      {has('specs') ? (
        <G stroke={P.ink} strokeWidth={1.2} fill="none">
          <Rect x={16.4} y={19.4} width={6.6} height={4.6} rx={1.2} /><Rect x={25} y={19.4} width={6.6} height={4.6} rx={1.2} /><Path d="M23 21.2 H25 M16.4 21 L14.6 20.4 M31.6 21 L33.4 20.4" />
        </G>
      ) : null}
      {has('headband') ? <Path d="M13.8 16.6 C17 11.4 31 11.4 34.2 16.6" stroke={trim} strokeWidth={2.4} strokeLinecap="round" fill="none" /> : null}
      {has('cap') ? <Path d="M13.2 17.6 C12.8 9.6 18.5 7 24 7 C29.5 7 35.2 9.6 34.8 17.6 C36.8 17.8 41 18.6 41.4 20 C41.6 21 36 20.6 32.5 19.4 C27 17.6 19 17.4 13.2 17.6 Z" fill={trim} /> : null}
      {has('flatcap') ? <Path d="M12.4 17.2 C11.6 10.6 17.5 7.4 25 7.6 C31.5 7.8 36 10.8 36.6 14.8 C38.6 15.2 41 16.4 41 17.6 C41 18.6 36 18.4 31.5 17.6 C25 16.6 17.5 16.6 12.4 17.2 Z" fill={trim} /> : null}
    </G>
  );
}

/** Погрудный силуэт в поле 48 × 48; поле сдвинуто на 2 вверх: подпись «бот» закрывает плечи, а не подбородок. */
function Bust({ look, size }: { look: Look; size: number }) {
  const skin = P.skin[look.skin], shade = P.shade[look.skin];
  const hair = P.hair[look.hairColor], cloth = P.cloth[look.cloth], trim = P.cloth[look.trim ?? look.cloth];
  const beard = look.extras.includes('beard') || look.extras.includes('moustache') || look.extras.includes('goatee');
  return (
    <Svg width={size} height={size} viewBox="0 2 48 48">
      {look.hair === 'long' || look.hair === 'bob' ? null : hairBack(look, hair)}
      <Path d="M3.5 52 V47 C3.5 40.5 12 36 24 36 C36 36 44.5 40.5 44.5 47 V52 Z" fill={cloth} />
      {look.hair === 'long' || look.hair === 'bob' ? hairBack(look, hair) : null}
      {look.extras.includes('shawl') ? <Path d="M6 42 C11 36.6 19 35.4 24 39.4 C29 35.4 37 36.6 42 42 C36 40.4 29.5 41.2 24 45 C18.5 41.2 12 40.4 6 42 Z" fill={trim} /> : null}
      {look.extras.includes('collar') ? <Path d="M18.4 35.6 L24 42.4 L29.6 35.6 L27.6 34.6 L24 38.4 L20.4 34.6 Z" fill={P.linen} /> : null}
      <Path d="M20.2 28 H27.8 V35.4 C26.6 37.6 21.4 37.6 20.2 35.4 Z" fill={shade} />
      <Ellipse cx={14.6} cy={22.6} rx={1.9} ry={2.5} fill={skin} />
      <Ellipse cx={33.4} cy={22.6} rx={1.9} ry={2.5} fill={skin} />
      <Path d="M14.6 20.6 C14.6 13.5 18.5 10.2 24 10.2 C29.5 10.2 33.4 13.5 33.4 20.6 C33.4 27.6 29.4 32.2 24 32.2 C18.6 32.2 14.6 27.6 14.6 20.6 Z" fill={skin} />
      {hairFront(look, hair)}
      <Circle cx={20} cy={21.8} r={1.15} fill={P.ink} />
      <Circle cx={28} cy={21.8} r={1.15} fill={P.ink} />
      {beard ? null : <Path d="M21.2 26.8 Q24 29.2 26.8 26.8" stroke={P.ink} strokeWidth={1.2} strokeLinecap="round" fill="none" />}
      {extras(look, hair, trim)}
    </Svg>
  );
}

/** Подпись «бот» у портрета: `over` — внахлёст на нижнюю кромку медальона. */
export function BotChip({ testID, over }: { testID?: string; over?: boolean }) {
  return (
    <View style={[styles.chip, over && styles.over]}>
      <Text style={styles.chipText} maxFontSizeMultiplier={1.3} testID={testID}>{T.game.botMark}</Text>
    </View>
  );
}

/** Число карт на узкой плашке: значок карты рубашкой и цифра; слова («6 карт») — голосом для чтения с экрана. */
export function CardCount({ n, label, testID }: { n: number; label: string; testID?: string }) {
  return (
    <View style={styles.count} accessible accessibilityLabel={label} aria-label={label} testID={testID}>
      <View style={styles.back} />
      <Text style={styles.countText} maxFontSizeMultiplier={1.3}>{n}</Text>
    </View>
  );
}

/** Медальон места: портрет бота (`rival`) с подписью «бот» внахлёст на нижнюю кромку (`chip={false}` — подпись ставит
 *  тот, кто медальон показывает) или первая буква имени человека. */
export function Face({ rival, name, size, chip = true, testID }: { rival?: Rival | null; name?: string; size: number; chip?: boolean; testID?: string }) {
  const letter = [...(name ?? '').trim()][0]?.toUpperCase() ?? '';
  return (
    <View style={styles.unit} pointerEvents="none" testID={testID}>
      {/* портрет и буква — украшение: имя, «бот» и уровень рядом читаются текстом */}
      <View style={[styles.medal, { width: size, height: size }, !rival && styles.human]}
        importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        {rival ? <Bust look={rival.look} size={size - 2} /> : <Text style={styles.letter} maxFontSizeMultiplier={1}>{letter}</Text>}
        <View style={styles.shine} />
      </View>
      {rival && chip ? <BotChip over testID={testID ? `${testID}-bot` : undefined} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  unit: { alignItems: 'center' },
  medal: {
    borderRadius: RADIUS.small, borderWidth: 1, borderColor: C.glassLine, backgroundColor: P.ground,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  human: { backgroundColor: C.glass },
  /** блик по верхней кромке — как у стекла плашки */
  shine: { position: 'absolute', top: 0, left: RADIUS.small, right: RADIUS.small, height: 1, backgroundColor: C.shine },
  letter: { color: C.dim, fontSize: TYPE.button, fontWeight: '700' },
  chip: { paddingHorizontal: SPACE.xs + 1, borderRadius: RADIUS.pill, backgroundColor: C.sheet, borderWidth: 1, borderColor: C.glassLine },
  over: { marginTop: -PLATE.over },
  count: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs - 1 },
  /** маленькая карта рубашкой — как в веере под плашкой */
  back: { width: 9, height: 12, borderRadius: SPACE.xs / 2, backgroundColor: C.back, borderWidth: 1, borderColor: C.backLine },
  countText: { color: C.text, fontSize: TYPE.caption, lineHeight: PLATE.line, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chipText: { color: C.dim, fontSize: TYPE.caption, lineHeight: PLATE.chip, fontWeight: '700' },
});
