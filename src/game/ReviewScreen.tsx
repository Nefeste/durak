// Разбор партии (docs/09-game-design.md, «Итог партии и разбор»): решения игрока по одному — на столе той минуты
// (`ReviewBoard`: что игрок видел, метки «Сыграно» и «Лучше»), под ним — оценка, лучший ход и одна строка «почему»,
// внизу — переход между решениями. Что открыто — решает `reviewAccess` (src/money): бесплатно — главная ошибка каждой
// партии и полный разбор последней партии дня; любой — «Про» или один просмотр рекламы. Онлайн разбора нет (ADR 0006).
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { markOf, positionAt, reviewGame } from './review';
import type { Decision, Level, Review } from '../bot';
import type { GameRecord } from '../engine';
import { setReview } from '../state/history';
import { thinkSliced } from './think';
import { YOU } from './table';
import { T } from '../i18n';
import { isPro, isUnlocked, onRights, prepareRewarded, reviewAccess, rewardedReady, watchForReview } from '../money';
import { Button } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { Header } from '../ui/Header';
import { Toggle } from '../ui/Toggle';
import { C, SPACE, TYPE } from '../ui/theme';
import { actionText, whyText, worstText } from './words';
import { ReviewBoard } from './ReviewBoard';

const NO_LEVELS: Level[] = [];

/** `done` — на столе всё покрыто: «пас» ходящего здесь значит «Бито», как на плашке стола. */
function Panel({ d, i, n, main, done }: { d: Decision; i: number; n: number; main: boolean; done: boolean }) {
  const tone = d.grade === 'error' ? C.danger : d.grade === 'inaccurate' ? C.accent : C.dim;
  return (
    <Glass style={styles.row} testID={`decision-${d.at}`}>
      <View style={styles.rowHead}>
        <Text style={styles.bout} testID="review-step">{n > 1 ? T.review.step(d.bout, i, n) : T.review.bout(d.bout)}</Text>
        <Text style={[styles.grade, { color: tone }]} testID="review-grade">{T.review.grade[d.grade]}</Text>
      </View>
      {main ? <Text style={styles.main}>{T.review.main}</Text> : null}
      <Text style={styles.text}>{T.review.played(actionText(d.played, done))}</Text>
      {d.grade !== 'ok' ? (
        <>
          <Text style={styles.text}>{T.review.best(actionText(d.best, done))}</Text>
          <Text style={styles.why}>{whyText(d, done)}</Text>
          <Text style={styles.small}>{d.exact ? T.review.exact(d.playedChance) : T.review.chance(d.bestChance, d.playedChance)}</Text>
        </>
      ) : null}
    </Glass>
  );
}

/** `at` — начало партии (им разбор открывается рекламой); `lastToday` — это последняя партия дня; `counting` — разбор
 *  ещё считает экран партии (тогда здесь его не считать второй раз). Запись нужна для стола. */
export function ReviewScreen({ review: given, record, levels, at, lastToday, counting, onBack, onStore }: {
  /** `levels` — уровни ботов партии по местам: имена и портреты на плашках стола разбора. */
  review: Review | null; record?: GameRecord; levels?: readonly Level[]; at: number; lastToday: boolean; counting?: boolean; onBack: () => void; onStore: () => void;
}) {
  const insets = useInsets();
  const { height } = useWindowDimensions();
  // разбор старой партии, который не успел досчитаться, — досчитать здесь и сохранить
  const [local, setLocal] = useState<Review | null>(null);
  const review = given ?? local;
  useEffect(() => {
    if (given || !record || counting) return;
    const job = thinkSliced(reviewGame(record, YOU), 1e9);
    job.promise.then(r => { setLocal(r); void setReview(at, r); }, () => {});
    return () => job.cancel();
  }, [given, record, at, counting]);
  const [, bump] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => onRights(() => bump(n => n + 1)), []);
  const access = reviewAccess(isPro(), isUnlocked(at), lastToday);
  useEffect(() => { if (access !== 'full') prepareRewarded(() => setReady(true)); }, [access]);
  const watch = async () => {
    setFailed(false);
    const ok = await watchForReview(at);
    if (ok) bump(n => n + 1); else setFailed(true);
  };

  // лента решений: полный разбор — все, иначе только главная ошибка; «Только неточности и ошибки» — без «точно»
  const [only, setOnly] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const all = useMemo(() => (!review ? [] : access === 'full' ? review.decisions : review.worst ? [review.worst] : []), [review, access]);
  const shown = only ? all.filter(d => d.grade !== 'ok') : all;
  const want = sel ?? review?.worst?.at ?? shown[0]?.at ?? -1;
  // выбранное решение скрыто переключателем — ближайшее следующее из видимых
  const idx = shown.length ? Math.max(0, shown.findIndex(d => d.at >= want) < 0 ? shown.length - 1 : shown.findIndex(d => d.at >= want)) : -1;
  const d = idx >= 0 ? shown[idx] : null;
  const o = useMemo(() => (d && record ? positionAt(record, d.at, review?.seat ?? YOU) : null), [d, record, review]);
  const marks = useMemo(() => (d && o ? markOf(d, o) : null), [d, o]);
  const go = (k: number) => { const x = shown[idx + k]; if (x) setSel(x.at); };
  // плашка соперника — как в партии, с портретом и уровнем: она выше прежней на строку (вчетвером — на две), и стол
  // разбора получает эту высоту обратно, сукно не становится ниже
  const boardH = Math.round(Math.max(300, Math.min(520, height * 0.5))) + (record && record.seats > 3 ? SPACE.xxl : SPACE.l);

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m }]} testID="review">
      <Header title={T.review.title} back={T.review.back} onBack={onBack} backTestID="review-back" />
      {!review ? <Text style={styles.text}>{T.result.counting}</Text> : (
        <>
          {o && marks ? <View style={{ height: boardH }}><ReviewBoard o={o} marks={marks} levels={levels ?? NO_LEVELS} /></View> : null}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {!review.worst || !d ? <Text style={styles.head} testID="review-worst">{review.worst ? worstText(review.worst) : T.result.clean}</Text> : null}
            {d ? <Panel d={d} i={idx + 1} n={shown.length} main={d.at === review.worst?.at}
              done={!!o && o.table.length > 0 && o.table.every(([, x]) => x !== null)} />
              : access === 'full' ? <Text style={styles.text}>{only && all.length ? T.review.noMisses : T.review.none}</Text> : null}
            {access === 'full' && all.length > 1 ? <Toggle id="review-only" title={T.review.onlyMisses} value={only} onChange={setOnly} /> : null}
            {access !== 'full' ? (
              <Glass style={styles.locked} testID="review-locked">
                <Text style={styles.head}>{T.review.lockedTitle}</Text>
                <Text style={styles.text}>{T.review.lockedText}</Text>
                {ready || rewardedReady() ? <Button label={T.review.watch} onPress={watch} testID="review-watch" /> : null}
                {failed ? <Text style={styles.small}>{T.review.watchFailed}</Text> : null}
                <Button label={T.review.toStore} kind="ghost" onPress={onStore} testID="review-store" />
              </Glass>
            ) : null}
          </ScrollView>
          {access === 'full' && shown.length > 1 ? (
            <View style={styles.nav}>
              <View style={styles.cell}><Button label={T.review.prev} kind="ghost" disabled={idx <= 0} onPress={() => go(-1)} testID="review-prev" /></View>
              <View style={styles.cell}><Button label={T.review.next} kind="ghost" disabled={idx >= shown.length - 1} onPress={() => go(1)} testID="review-next" /></View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SPACE.l, gap: SPACE.m },
  scroll: { flex: 1 },
  list: { gap: SPACE.m, paddingBottom: SPACE.s },
  head: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  row: { gap: SPACE.xs, padding: SPACE.m,  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.s },
  bout: { color: C.dim, fontSize: TYPE.caption, flexShrink: 1 },
  grade: { fontSize: TYPE.caption, fontWeight: '700' },
  main: { color: C.danger, fontSize: TYPE.caption, fontWeight: '700' },
  text: { color: C.text, fontSize: TYPE.body },
  why: { color: C.text, fontSize: TYPE.body },
  small: { color: C.dim, fontSize: TYPE.caption },
  locked: { gap: SPACE.m, padding: SPACE.l,  },
  nav: { flexDirection: 'row', gap: SPACE.s },
  cell: { flex: 1 },
});
