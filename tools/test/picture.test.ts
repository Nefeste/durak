// Картинки «Правил» (docs/09-game-design.md, «Первая партия»): каждая карта в своей полоске сукна, у каждого места
// своя подпись, примеры не противоречат своду — покрытая карта бита по п. 4.2 docs/08-rules.md, подкинутая — того
// достоинства, что на столе (п. 4.3), переведённая — того же (п. 6.1). Козырь примеров — червы.
import { describe, expect, test } from 'bun:test';
import { beats, rankOf } from '../../src/engine';
import { placePicture } from '../../src/render/picture';
import { RULES_PICTURES } from '../../src/game/rulesPictures';
import { RULES_SECTIONS, T } from '../../src/i18n';

const HEARTS = 3;

describe('картинки правил', () => {
  for (const [key, slots] of Object.entries(RULES_PICTURES)) {
    test(`${key}: карты внутри полоски на узком и широком экране`, () => {
      for (const width of [280, 348, 528]) {
        const p = placePicture(slots, width);
        for (const c of p.cards) {
          // повёрнутая на 90° карта лежит поперёк
          const [hw, hh] = c.rot === 90 ? [p.ch / 2, p.cw / 2] : [p.cw / 2 + 4, p.ch / 2 + 4];
          expect(c.x - hw).toBeGreaterThanOrEqual(0);
          expect(c.x + hw).toBeLessThanOrEqual(width);
          expect(c.y - hh).toBeGreaterThanOrEqual(0);
          expect(c.y + hh).toBeLessThanOrEqual(p.height);
        }
        expect(p.cw).toBeGreaterThanOrEqual(34);
      }
    });
    test(`${key}: подпись под каждым местом`, () => {
      const labels = (T.rules.pictures as Record<string, string[]>)[key];
      expect(labels?.length).toBe(slots.length);
    });
  }
  test('разделы — из списка, у каждого текст', () => {
    for (const k of Object.keys(RULES_PICTURES)) expect(RULES_SECTIONS as readonly string[]).toContain(k);
    for (const k of RULES_SECTIONS) expect(T.rules.sections[k].text.length).toBeGreaterThan(20);
  });
  test('покрытые карты биты по своду', () => {
    for (const slots of Object.values(RULES_PICTURES)) {
      for (const s of slots) if (s.kind === 'pair' && s.over !== null) expect(beats(s.over, s.attack, HEARTS)).toBe(true);
    }
  });
  test('подкидывают достоинство со стола, переводят тем же', () => {
    const [pair, ...thrown] = RULES_PICTURES.throw ?? [];
    if (pair?.kind !== 'pair' || pair.over === null) throw new Error('throw: сначала пара');
    for (const s of thrown) if (s.kind === 'card') expect([rankOf(pair.attack), rankOf(pair.over)]).toContain(rankOf(s.card));
    const [a, b] = RULES_PICTURES.transfer ?? [];
    if (a?.kind !== 'card' || b?.kind !== 'card') throw new Error('transfer: две карты');
    expect(rankOf(a.card)).toBe(rankOf(b.card));
  });
});
