import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMessage, SEPARATOR } from '../src/lib/message.js';

const line = (over = {}) => ({
  itemName: 'Milk',
  categoryName: 'Walmart',
  quantity: 0,
  needOnly: false,
  noStock: false,
  ...over,
});

test('order mode: counts, checks, no-stock suffix, category groups, separators', () => {
  const text = generateMessage({
    sectionName: 'Bar',
    mode: 'order',
    lines: [
      line({ itemName: 'Milk', quantity: 3 }),
      line({ itemName: 'Banana', quantity: 2, noStock: true }),
      line({ itemName: 'Brownies', needOnly: true, categoryName: "Sam's" }),
      line({ itemName: 'Coke', quantity: 1, needOnly: true, noStock: true, categoryName: "Sam's" }),
      line({ itemName: 'Sprite', noStock: true, categoryName: "Sam's" }), // renders nothing
    ],
  });

  assert.equal(text, [
    '*Bar Inventory*',
    'Items Needed:',
    '',
    '*Walmart*',
    'Milk - 3',
    'Banana - 2 (_No Stock_)',
    SEPARATOR,
    "*Sam's*",
    'Need Brownies',
    'Coke - 1 (_No Stock_)',
    SEPARATOR,
  ].join('\n'));
});

test('received mode: flat list, no headers, no separators, header without colon', () => {
  const text = generateMessage({
    sectionName: 'Bar',
    mode: 'received',
    lines: [
      line({ itemName: 'Milk', quantity: 3 }),
      line({ itemName: 'Brownies', needOnly: true, categoryName: "Sam's" }),
      line({ itemName: 'Sprite', noStock: true, categoryName: "Sam's" }),
    ],
  });

  assert.equal(text, [
    '*Bar Inventory*',
    'Items Received',
    '',
    'Milk - 3',
    'Need Brownies',
  ].join('\n'));
});

test('empty draft → No items selected.', () => {
  assert.equal(generateMessage({ sectionName: 'Bar', mode: 'order', lines: [] }), 'No items selected.');
  assert.equal(
    generateMessage({ sectionName: 'Bar', mode: 'received', lines: [line({ noStock: true })] }),
    'No items selected.'
  );
});

test('quantity beats need-only when both set (legacy precedence)', () => {
  const text = generateMessage({
    sectionName: 'Bar',
    mode: 'order',
    lines: [line({ quantity: 2, needOnly: true })],
  });
  assert.ok(text.includes('Milk - 2'));
  assert.ok(!text.includes('Need Milk'));
});

test('separator is exactly 24 dashes', () => {
  assert.equal(SEPARATOR.length, 24);
  assert.equal(SEPARATOR, '------------------------');
});
