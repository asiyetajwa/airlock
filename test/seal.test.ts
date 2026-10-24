import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abaValid, egressCheck, fillIn, ibanValid, luhn, ruleSpans, sealAll } from '../src/seal/index.js';

const kinds = (t: string) => ruleSpans(t).map((s) => `${s.kind}:${t.slice(s.start, s.end)}`);

test('checksums', () => {
  assert.ok(luhn('4111111111111111'));
  assert.ok(!luhn('4111111111111112'));
  assert.ok(abaValid('021000021'));
  assert.ok(!abaValid('021000022'));
  assert.ok(ibanValid('GB82 WEST 1234 5698 7654 32'));
  assert.ok(!ibanValid('GB82 WEST 1234 5698 7654 33'));
});

test('rules find secrets and numbers', () => {
  const t = 'Key AKIA4QX7PL2M9VK3ZR6T and password: Maple-Harbor-2026. Card 4111 1111 1111 1111, SSN 123-45-6789, routing 021000021, account ending 4417, call (415) 555-0132, mail megan.carter@example.com, $4,850.00 at 1428 Elm Street, Apt 3B.';
  const k = kinds(t);
  for (const want of ['KEY:AKIA4QX7PL2M9VK3ZR6T', 'PASSWORD:Maple-Harbor-2026', 'CARD:4111 1111 1111 1111', 'SSN:123-45-6789', 'ROUTING:021000021', 'ACCOUNT:4417', 'PHONE:(415) 555-0132', 'EMAIL:megan.carter@example.com', 'AMOUNT:$4,850.00', 'ADDRESS:1428 Elm Street, Apt 3B']) {
    assert.ok(k.includes(want), `missing ${want} in ${k.join(' | ')}`);
  }
});

test('rules see through hiding tricks', () => {
  const spelled = 'my social is one two three four five six seven eight nine';
  assert.ok(sealAll([spelled]).sealed[0]?.sealed.includes('SSN_1') || sealAll([spelled]).sealed[0]?.held.length, 'spelled digits held');
  const spaced = 'the key is A K I A 4 Q X 7 P L 2 M 9 V K 3 Z R 6 T ok';
  assert.ok(!sealAll([spaced]).sealed[0]?.sealed.includes('4 Q X 7'));
  const split = 'aws key: AKIA4QX7PL\n2M9VK3ZR6T thanks';
  assert.ok(!sealAll([split]).sealed[0]?.sealed.includes('2M9VK3ZR6T'));
});

test('ordinary prose is left alone', () => {
  const t = 'Your lease renews on the first of the month. Please water the plants and feed the cat twice a day.';
  assert.equal(sealAll([t]).sealed[0]?.sealed, t);
});

test('tokens are consistent across texts, names propagate, and fill-in restores values', () => {
  const email = 'Megan Carter sent $4,850 from account ending 4417.';
  const note = 'Remind Megan about the rent.';
  const { sealed, map } = sealAll([email, note], { names: [[{ start: 0, end: 12 }], []] });
  assert.equal(sealed[0]?.sealed, 'PERSON_1 sent AMOUNT_1 from account ending ACCOUNT_1.');
  assert.equal(sealed[1]?.sealed, 'Remind PERSON_1 about the rent.');
  const filled = fillIn('You paid AMOUNT_1 to PERSON_1.', map).map((p) => p.text).join('');
  assert.equal(filled, 'You paid $4,850 to Megan Carter.');
});

test('always-hold list', () => {
  const { sealed } = sealAll(['Project Bluebird ships Friday.'], { alwaysHold: ['Bluebird'] });
  assert.equal(sealed[0]?.sealed, 'Project HELD_1 ships Friday.');
});

test('egress check blocks a held value, exact or reformatted', () => {
  const values = [{ kind: 'SSN' as const, value: '123-45-6789' }, { kind: 'PERSON' as const, value: 'Megan Carter' }];
  assert.equal(egressCheck('nothing here', values).length, 0);
  assert.equal(egressCheck('ssn 123 45 6789', values)[0]?.how, 'normalised');
  assert.equal(egressCheck('dear megan carter', values)[0]?.how, 'exact');
});
