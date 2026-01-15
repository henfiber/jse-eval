import JseEval, { addEvaluator, registerPlugin, parse } from './dist/jse-eval.module.js';
import jsepArrow from '@jsep-plugin/arrow';
import jsepAssignment from '@jsep-plugin/assignment';
import jsepObject from '@jsep-plugin/object';
import jsepSpread from '@jsep-plugin/spread';

// Run as: `node ./modules/jse-eval/test.sequenceExpr.js`

registerPlugin(jsepArrow, jsepAssignment, jsepObject, jsepSpread);


addEvaluator('SequenceExpression', function sequenceExpressionEvaluator(node) {
  const result = this.evalCompoundExpression({ type: 'Compound', body: node.expressions });
  return result;
});

const expr = `
((_) => (
  isObj = (x) => ({ }.toString.call(x) === "[object Object]"),
  flattenObj = (obj, delim = ".") => (path = { },
    iter = (o, p) => (((o && isObj(o)) && !Array.isArray(o)) ? Object.keys(o).forEach((k) => iter(o[k], p.concat(k))) : (path[p.join(delim)] = o)),
    iter(obj, []),
    path
  )
))()
`;

const jse = new JseEval({ Object, Array });
const ast = parse(expr);
const myFunc = jse.eval(ast);
const input = { a: { b: { c: 3 } } };

try {
    const result = myFunc(input);
    console.log('Result:', JSON.stringify(result));
    
    if (JSON.stringify(result) === '{"a.b.c":3}') {
        console.log('SUCCESS');
    } else {
        console.error('FAILURE');
        process.exit(1);
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}
