// Разбор партии (docs/09-game-design.md, «Итог партии и разбор»): лента решений игрока — оценка, лучший ход и одна
// строка «почему». Что открыто — решает `reviewAccess` (src/money): бесплатно — главная ошибка каждой партии и полный
// разбор последней партии дня; любой — «Про» или один просмотр рекламы. Онлайн разбора нет (ADR 0006).
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../ui/insets';
import { reviewGame } from './review';
import type { Decision, Review } from '../bot';
import type { GameRecord } from '../engine';
import { setReview } from '../state/history';
import { thinkSliced } from './think';
import { YOU } from './table';
import { T } from '../i18n';
import { isPro, isUnlocked, onRights, prepareRewarded, reviewAccess, rewardedReady, watchForReview } from '../money';
import { Button } from '../ui/Button';
import { C, RADIUS, SPACE, TYPE } from '../ui/theme';
import { actionText, whyText, worstText } from './words';

function Row({ d }: { d: Decision }) {
  const tone = d.grade === 'error' ? C.danger : d.grade === 'inaccurate' ? C.accent : C.dim;
  return (
    <View style={styles.row} testID={`decision-${d.at}`}>
      <View style={styles.rowHead}>
        <Text style={styles.bout}>{T.review.bout(d.bout)}</Text>
        <Text style={[styles.grade, { color: tone }]}>{T.review.grade[d.grade]}</Text>
      </View>
      <Text style={styles.text}>{T.review.played(actionText(d.played))}</Text>
      {d.grade !== 'ok' ? (
        <>
          <Text style={styles.text}>{T.review.best(actionText(d.best))}</Text>
          <Text style={styles.why}>{whyText(d)}</Text>
          <Text style={styles.small}>{d.exact ? T.review.exact(d.playedChance) : T.review.chance(d.bestChance, d.playedChance)}</Text>
        </>
      ) : null}
    </View>
  );
}

/** `at` — начало партии (им разбор открывается рекламой); `lastToday` — это последняя партия дня. */
export function ReviewScreen({ review: given, record, at, lastToday, onBack, onStore }: {
  review: Review | null; record?: GameRecord; at: number; lastToday: boolean; onBack: () => void; onStore: () => void;
}) {
  const insets = useInsets();
  // разбор старой партии, который не успел досчитаться, — досчитать здесь и сохранить
  const [local, setLocal] = useState<Review | null>(null);
  const review = given ?? local;
  useEffect(() => {
    if (given || !record) return;
    const job = thinkSliced(reviewGame(record, YOU), 1e9);
    job.promise.then(r => { setLocal(r); void setReview(at, r); }, () => {});
    return () => job.cancel();
  }, [given, record, at]);
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
  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.m, paddingBottom: insets.bottom + SPACE.m }]} testID="review">
      <View style={styles.top}>
        <Button label={T.review.back} kind="ghost" onPress={onBack} testID="review-back" />
        <Text style={styles.title}>{T.review.title}</Text>
      </View>
      {!review ? <Text style={styles.text}>{T.result.counting}</Text> : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.head} testID="review-worst">{review.worst ? worstText(review.worst) : T.result.clean}</Text>
          {access === 'full' ? (
            review.decisions.length ? review.decisions.map(d => <Row key={d.at} d={d} />) : <Text style={styles.text}>{T.review.none}</Text>
          ) : (
            <View style={styles.locked} testID="review-locked">
              <Text style={styles.head}>{T.review.lockedTitle}</Text>
              <Text style={styles.text}>{T.review.lockedText}</Text>
              {ready || rewardedReady() ? <Button label={T.review.watch} onPress={watch} testID="review-watch" /> : null}
              {failed ? <Text style={styles.small}>{T.review.watchFailed}</Text> : null}
              <Button label={T.review.toStore} kind="ghost" onPress={onStore} testID="review-store" />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: SPACE.l, gap: SPACE.m },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  title: { color: C.text, fontSize: TYPE.section, fontWeight: '700' },
  list: { gap: SPACE.m, paddingBottom: SPACE.xl },
  head: { color: C.text, fontSize: TYPE.body, fontWeight: '700' },
  row: { gap: SPACE.xs, padding: SPACE.m, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bout: { color: C.dim, fontSize: TYPE.caption },
  grade: { fontSize: TYPE.caption, fontWeight: '700' },
  text: { color: C.text, fontSize: TYPE.body },
  why: { color: C.text, fontSize: TYPE.body, fontStyle: 'italic' },
  small: { color: C.dim, fontSize: TYPE.caption },
  locked: { gap: SPACE.m, padding: SPACE.l, borderRadius: RADIUS.panel, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassLine },
});
