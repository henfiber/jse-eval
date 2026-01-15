
import JseEval, { registerPlugin, parse } from './dist/jse-eval.module.js';
import jsepNew from '@jsep-plugin/new';

// Verifies that the evaluator works with both jsep new plugin v1.0.2 (first test case) and 1.0.3+ (second test case)

registerPlugin(jsepNew);

const context = {
  Date: Date,
  sub: { sub2: { Date: Date } },
};

async function test() {
    console.log('--- Test 1 (jse-eval test case) ---');
    const jse = new JseEval(context);
    const expr1 = '(new sub.sub2["Date"](2021, 8)).getFullYear()';
    try {
        const res1 = jse.eval(parse(expr1));
        console.log('Result 1:', res1);
        if (res1 === 2021) console.log('PASS 1'); else console.log('FAIL 1');
    } catch (e) {
        console.error('FAIL 1', e);
    }

    console.log('\n--- Test 2 (jsep issue case) ---');
    const expr2 = 'new Date(new Date().setDate(new Date().getDate()-5))';
    try {
        const res2 = jse.eval(parse(expr2));
        console.log('Result 2:', (res2 instanceof Date) ? res2.toISOString() : res2);
        console.log('PASS 2');
    } catch (e) {
        console.error('FAIL 2', e);
    }
}
test();
