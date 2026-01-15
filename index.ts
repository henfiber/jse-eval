import { ArrowExpression } from '@jsep-plugin/arrow';
import { AssignmentExpression, UpdateExpression } from '@jsep-plugin/assignment';
import { AwaitExpression } from '@jsep-plugin/async-await';
import { NewExpression } from '@jsep-plugin/new';
import { ObjectExpression, Property } from '@jsep-plugin/object';
import { SpreadElement } from '@jsep-plugin/spread';
import { TaggedTemplateExpression, TemplateLiteral } from '@jsep-plugin/template';
import jsep from 'jsep';

/**
 * Evaluation code from JSEP project, under MIT License.
 * Copyright (c) 2013 Stephen Oney, http://jsep.from.so/
 */

export declare type Context = Record<string, unknown>;
export declare type operand = any;
export declare type unaryCallback = (a: operand) => operand;
export declare type binaryCallback = (a: operand, b: operand) => operand;
export declare type assignCallback = (obj: Record<string, operand>, key: string, val: operand) => operand;
export declare type evaluatorCallback<T extends AnyExpression> = (this: ExpressionEval, node: T, context?: Context) => unknown;

export type AnyExpression = jsep.Expression;

export type JseEvalPlugin = Partial<jsep.IPlugin> & {
  initEval?: (this: typeof ExpressionEval, jseEval: typeof ExpressionEval) => void;
}


const DEFERRED_NEW = Symbol('DEFERRED_NEW');
interface DeferredNew {
   [DEFERRED_NEW]: true;
   value: any;
}

export default class ExpressionEval {
  static jsep = jsep;
  static parse = jsep;
  static evaluate = ExpressionEval.eval;

  // static flag to toggle debug mode - disabled by default due to performance impact
  // enables the _value property which allows code regeneration tools to utilize the intermediate values of each node
  // see: https://github.com/6utt3rfly/jse-eval/commit/0a3067b8af107ae677bee55efd69995d15721dca
  // static debugMode = false;

  static evaluators: Record<string, evaluatorCallback<AnyExpression>> = {
    'ArrayExpression': ExpressionEval.prototype.evalArrayExpression,
    'LogicalExpression': ExpressionEval.prototype.evalBinaryExpression,
    'BinaryExpression': ExpressionEval.prototype.evalBinaryExpression,
    'CallExpression': ExpressionEval.prototype.evalCallExpression,
    'Compound': ExpressionEval.prototype.evalCompoundExpression,
    'SequenceExpression': ExpressionEval.prototype.evalSequenceExpression,
    'ConditionalExpression': ExpressionEval.prototype.evalConditionalExpression,
    'Identifier': ExpressionEval.prototype.evalIdentifier,
    'Literal': ExpressionEval.evalLiteral,
    'OptionalMemberExpression': ExpressionEval.prototype.evalMemberExpression, // acorn uses this
    'MemberExpression': ExpressionEval.prototype.evalMemberExpression,
    'ThisExpression': ExpressionEval.prototype.evalThisExpression,
    'UnaryExpression': ExpressionEval.prototype.evalUnaryExpression,
    'ArrowFunctionExpression': ExpressionEval.prototype.evalArrowFunctionExpression,
    'AssignmentExpression': ExpressionEval.prototype.evalAssignmentExpression,
    'UpdateExpression': ExpressionEval.prototype.evalUpdateExpression,
    'AwaitExpression': ExpressionEval.prototype.evalAwaitExpression,
    'NewExpression': ExpressionEval.prototype.evalNewExpression,
    'ObjectExpression': ExpressionEval.prototype.evalObjectExpression,
    'SpreadElement': ExpressionEval.prototype.evalSpreadElement,
    'TaggedTemplateExpression': ExpressionEval.prototype.evalTaggedTemplateExpression,
    'TemplateLiteral': ExpressionEval.prototype.evalTemplateLiteral,
  };

  // Default operator precedence from https://github.com/EricSmekens/jsep/blob/master/src/jsep.js#L937
  static DEFAULT_PRECEDENCE: Record<string, number> = {
    '||': 1,
    '??': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6,
    '!=': 6,
    '===': 6,
    '!==': 6,
    '<': 7,
    '>': 7,
    '<=': 7,
    '>=': 7,
    '<<': 8,
    '>>': 8,
    '>>>': 8,
    '+': 9,
    '-': 9,
    '*': 10,
    '/': 10,
    '%': 10,
    '**': 11,
  };

  static binops: Record<string, binaryCallback> = {
    '||': function (a, b) { return a || b; },
    '??': function (a, b) { return a ?? b; },
    '&&': function (a, b) { return a && b; },
    '|': function (a, b) { return a | b; },
    '^': function (a, b) { return a ^ b; },
    '&': function (a, b) { return a & b; },
    '==': function (a, b) { return a == b; }, // jshint ignore:line
    '!=': function (a, b) { return a != b; }, // jshint ignore:line
    '===': function (a, b) { return a === b; },
    '!==': function (a, b) { return a !== b; },
    '<': function (a, b) { return a < b; },
    '>': function (a, b) { return a > b; },
    '<=': function (a, b) { return a <= b; },
    '>=': function (a, b) { return a >= b; },
    '<<': function (a, b) { return a << b; },
    '>>': function (a, b) { return a >> b; },
    '>>>': function (a, b) { return a >>> b; },
    '+': function (a, b) { return a + b; },
    '-': function (a, b) { return a - b; },
    '*': function (a, b) { return a * b; },
    '/': function (a, b) { return a / b; },
    '%': function (a, b) { return a % b; },
    '**': function (a, b) { return a ** b; },
  };

  static unops: Record<string, unaryCallback> = {
    '-': function (a) { return -a; },
    '+': function (a) { return +a; },
    '~': function (a) { return ~a; },
    '!': function (a) { return !a; },
  };

  static assignOps: Record<string, assignCallback> = {
    '=': function(obj, key, val) { return obj[key] = val; },
    '*=': function(obj, key, val) { return obj[key] *= val; },
    '**=': function(obj, key, val) { return obj[key] **= val; },
    '/=': function(obj, key, val) { return obj[key] /= val; },
    '%=': function(obj, key, val) { return obj[key] %= val; },
    '+=': function(obj, key, val) { return obj[key] += val; },
    '-=': function(obj, key, val) { return obj[key] -= val; },
    '<<=': function(obj, key, val) { return obj[key] <<= val; },
    '>>=': function(obj, key, val) { return obj[key] >>= val; },
    '>>>=': function(obj, key, val) { return obj[key] >>>= val; },
    '&=': function(obj, key, val) { return obj[key] &= val; },
    '^=': function(obj, key, val) { return obj[key] ^= val; },
    '|=': function(obj, key, val) { return obj[key] |= val; },
  };

  // inject Custom Unary Operators (and override existing ones)
  static addUnaryOp(operator: string, _function: unaryCallback): void {
    jsep.addUnaryOp(operator);
    ExpressionEval.unops[operator] = _function;
  }

  // inject Custom Binary Operators (and override existing ones)
  static addBinaryOp(
    operator: string,
    precedence_or_fn: number | binaryCallback,
    _ra_or_callback?: boolean | binaryCallback,
    _function?: binaryCallback)
    : void {
    let precedence, ra, cb;
    if (typeof precedence_or_fn === 'function') {
      cb = precedence_or_fn;
    } else {
      precedence = precedence_or_fn;
      if (typeof _ra_or_callback === 'function') {
        cb = _ra_or_callback;
      } else {
        ra = _ra_or_callback;
        cb = _function;
      }
    }

    jsep.addBinaryOp(operator, precedence || 1, ra);
    ExpressionEval.binops[operator] = cb;
  }

  // inject custom node evaluators (and override existing ones)
  static addEvaluator<T extends AnyExpression>(nodeType: string, evaluator: evaluatorCallback<T>): void {
    ExpressionEval.evaluators[nodeType] = evaluator;
  }

  static registerPlugin(...plugins: Array<JseEvalPlugin>) {
    plugins.forEach((p) => {
      if (p.init) {
        ExpressionEval.parse.plugins.register(p as jsep.IPlugin);
      }
      if (p.initEval) {
        p.initEval.call(ExpressionEval, ExpressionEval);
      }
    });
  }

  // main evaluator method
  static eval(ast: jsep.Expression, context?: Context): unknown {
    return (new ExpressionEval(context)).eval(ast);
  }
  static async evalAsync(ast: jsep.Expression, context?: Context): Promise<unknown> {
    return (new ExpressionEval(context, true)).eval(ast);
  }

  // compile an expression and return an evaluator
  static compile(expression: string): (context?: Context) => unknown {
    return ExpressionEval.eval.bind(null, ExpressionEval.jsep(expression));
  }
  static compileAsync(expression: string): (context?: Context) => Promise<unknown> {
    return ExpressionEval.evalAsync.bind(null, ExpressionEval.jsep(expression));
  }

  // compile and evaluate
  static evalExpr(expression: string, context?: Context): unknown {
    return ExpressionEval.compile(expression)(context);
  }
  static evalExprAsync(expression: string, context?: Context): unknown {
    return ExpressionEval.compileAsync(expression)(context);
  }


  context?: Context;
  isAsync?: boolean;

  constructor(context?: Context, isAsync?: boolean) {
    this.context = context || Object.create(null);
    this.isAsync = isAsync;
  }

  public eval(node: unknown, cb?: (v: unknown) => unknown): unknown {
    if (!node) { return cb ? cb(undefined) : undefined; }
    
    // Fast-path for common leaf nodes to avoid function call overhead in tight loops (e.g. MemberExpression, BinaryExpression)
    const type = (node as jsep.Expression).type;
    if (type === 'Identifier') {
      const val = this.context[(node as jsep.Identifier).name];
      return cb ? cb(val) : val;
    }
    if (type === 'Literal') {
      const val = (node as jsep.Literal).value;
      return cb ? cb(val) : val;
    }

    const evaluator = ExpressionEval.evaluators[type] || ExpressionEval.evaluators.default;
    if (!evaluator) {
      throw new Error(`unknown node type: ${JSON.stringify(node, null, 2)}`);
    }
    // Use .call(this) instead of .bind(this) to avoid function allocation on every node
    const res = evaluator.call(this, node, this.context);
    
    // Optim: Inline evalSyncAsync logic to avoid creating closure wrappers
    if (this.isAsync) {
      return Promise.resolve(res).then(cb);
      // currently this feature is disabled due to performance impact - kept commented for future reference
      // return Promise.resolve(res).then((val) => {
      //   if (ExpressionEval.debugMode) { (node as any)._value = res; } 
      //   return cb ? cb(val) : val;
      // });
    }

    // currently this feature is disabled due to performance impact - kept commented for future reference
    // if (ExpressionEval.debugMode) { (node as any)._value = res; }
    
    // Return direct result if no callback (common case for synchronous internal recursion)
    return cb ? cb(res) : res;
  }

  /*
   * `evalSyncAsync` is a helper to wrap sync/async calls into one so that
   * we don't have to duplicate all of our node type parsers.
   * It's basically like old node callback (hell?), but it works because:
   * for sync:
   *   an expression like `[1].map(v => v + 1)` returns the result
   *   after running the callback
   * for async:
   *   an expression like `const a = (await x) + 1` is equivalent to
   *   `Promise.resolve(x).then(res => res + 1)`
   *
   * Note: For optimization, there are a few places where it makes sense
   * to directly check `this.isAsync` to use Promise.all(),
   * `promisesOrResults = expressions.map(v => this.eval(v))`
   *   could result in an array of results (sync) or promises (async)
   */
  evalSyncAsync(val: unknown, cb: (unknown) => unknown): Promise<unknown> | unknown {
    if (this.isAsync) {
      return Promise.resolve(val).then(cb);
    }
    return cb(val);
  }

  private evalArrayExpression(node: jsep.ArrayExpression) {
    return this.evalArray(node.elements);
  }

  protected evalArray(list: jsep.Expression[]): any {
    // Pre-calculate mapped results using a for-loop to avoid creating map callbacks
    const len = list.length;
    if ( len === 0 ) { return []; }
    const mapped: unknown[] = new Array(len);
    for (let i = 0; i < len; i++) {
      mapped[i] = this.eval(list[i]);
    }
    if (this.isAsync) {
      return Promise.all(mapped).then(res => this.finishEvalArray(res, list));
    }
    return this.finishEvalArray(mapped, list);
  }

  private finishEvalArray(mapped: unknown[], list: jsep.Expression[]): unknown[] {
    let hasSpread = (list as any)._hasSpread;
    if (hasSpread === undefined) {
      hasSpread = false;
      for (let i = 0; i < list.length; i++) {
        if ((list[i] as AnyExpression).type === 'SpreadElement') {
          hasSpread = true;
          break;
        }
      }
      (list as any)._hasSpread = hasSpread;
    }

    if (!hasSpread) return mapped;

    return mapped.reduce((arr: unknown[], v, i) => {
      if ((list[i] as AnyExpression).type === 'SpreadElement') {
        if (Array.isArray(v)) {
           arr.push(...v);
        } else if (v != null && typeof (v as any)[Symbol.iterator] === 'function') {
           // Fallback for generic iterables: spread by iterating
           for (const item of v as any) {
             arr.push(item);
           }
        } else {
           // Non-iterable: push as single element to avoid runtime error
           arr.push(v);
        }
        return arr;
      }
      arr.push(v);
      return arr;
    }, []) as unknown[];
  }

  private evalBinaryExpression(node: jsep.BinaryExpression) {
    const op = node.operator;
    // Optim: separate sync/async to avoid closures and array allocations
    if (this.isAsync) {
        if (op === '||') {
            return this.eval(node.left, left => left || this.eval(node.right));
        } else if (op === '&&') {
            return this.eval(node.left, left => left && this.eval(node.right));
        }
        return Promise.all([this.eval(node.left), this.eval(node.right)])
            .then(([left, right]) => ExpressionEval.binops[op](left, right));
    }
    
    // Sync fast-path
    // Standard always-present operators are handled inline
    if (op === '===' || op === '==') {
        const left = this.eval(node.left);
        const right = this.eval(node.right); // no short-circuit in equality
        return op === '===' ? left === right : left == right;
    }

    if (op === '||') {
      const left = this.eval(node.left);
      return left || this.eval(node.right);
    }
    if (op === '&&') {
      const left = this.eval(node.left);
      return left && this.eval(node.right);
    }
    
    if (op === '!==' || op === '!=') {
        const left = this.eval(node.left);
        const right = this.eval(node.right);
        return op === '!==' ? left !== right : left != right;
    }

    return ExpressionEval.binops[op](
        this.eval(node.left), 
        this.eval(node.right)
    );
  }

  private evalCompoundExpression(node: jsep.Compound) {
    if (this.isAsync) {
      return node.body.reduce((p: Promise<any>, node) => p.then(() => this.eval(node)), Promise.resolve());
    }
    // Optim: Use loop to avoid allocating result array with .map()
    const len = node.body.length;
    for (let i = 0; i < len - 1; i++) {
      this.eval(node.body[i]);
    }
    return this.eval(node.body[len - 1]);
  }


 /**
  * Handling comma-separated expressions
  *
  *  allows to use assignments and multiple expressions in arrow functions
  *  e.g.:  (x) => (a = x + 1, b = a * 2, b - 3)  // The last expression's value is returned.
  *
  *  Note: This is similar to CompoundExpression, but uses 'expressions' property.
  */  
  private evalSequenceExpression(node: jsep.SequenceExpression) {
    if (this.isAsync) {
      return node.expressions.reduce((p: Promise<any>, node) => p.then(() => this.eval(node)), Promise.resolve());
    }
    // Optim: Use loop to avoid allocating result array with .map()
    const len = node.expressions.length;
    for (let i = 0; i < len - 1; i++) {
      this.eval(node.expressions[i]);
    }
    return this.eval(node.expressions[len - 1]);
  }

  private evalCallExpression(node: jsep.CallExpression) {
    if (this.isAsync) {
        return this.evalSyncAsync(this.evalCall(node.callee), ([fn, caller]) => this
            .evalSyncAsync(this.evalArray(node.arguments), args => fn
                .apply(caller === node.callee ? this.context : caller, args)));
    }
    // Sync fast-path
    const [fn, caller] = this.evalCall(node.callee) as [Function, any];
    const args = this.evalArray(node.arguments) as any[];
    return fn.apply(caller === node.callee ? this.context : caller, args);
  }

  protected evalCall(callee: jsep.Expression): unknown {
    if (callee?.type === 'MemberExpression') {
      return this.evalSyncAsync(
        this.evaluateMember(callee as jsep.MemberExpression),
        ([caller, fn]) => ExpressionEval.validateFnAndCall(fn, caller, callee as AnyExpression)
      );
    }

    return this.eval(callee, fn => ExpressionEval.validateFnAndCall(fn as () => unknown, callee as AnyExpression));
  }

  private evalConditionalExpression(node: jsep.ConditionalExpression) {
    return this.eval(node.test, v => v
      ? this.eval(node.consequent)
      : this.eval(node.alternate));
  }

  private evalIdentifier(node: jsep.Identifier) {
    return this.context[node.name];
  }

  private static evalLiteral(node: jsep.Literal) {
    return node.value;
  }

  private evalMemberExpression(node: jsep.MemberExpression) {
    // Optim: Inline logic to avoid array allocation [obj, val, key] from evaluateMember
    if (this.isAsync) {
        return this.evalSyncAsync(this.evaluateMember(node), ([, val]) => val);
    }

    // Sync fast-path
    const object: any = this.eval(node.object);
    const key: string = node.computed ? this.eval(node.property) as string : (node.property as jsep.Identifier).name;

    //Security check for fast-path
    if ((key === '__proto__' || key === 'prototype' || key === 'constructor')) {
         throw Error(`Access to member "${key}" disallowed.`);
    }

    // Handle DeferredNew: Propagate the deferral (inlined isDeferredNew check)
    if (object && (object as any)[DEFERRED_NEW]) {
        const val = (object as any).value?.[key];
        return { [DEFERRED_NEW]: true, value: val };
    }

    // Optim: Avoid allocating {} for optional chaining
    if (node.optional && object == null) {
        return undefined;
    }
    return object[key];
  }

  private evaluateMember(node: jsep.MemberExpression) {
    return this.eval(node.object, (object) => this
      .evalSyncAsync(
        node.computed
          ? this.eval(node.property)
          : (node.property as jsep.Identifier).name,
        (key: string) => {
          if ((key === '__proto__' || key === 'prototype' || key === 'constructor')) {
            throw Error(`Access to member "${key}" disallowed.`);
          }
          if (object && (object as any)[DEFERRED_NEW]) {
             return [object, { [DEFERRED_NEW]: true, value: (object as any).value?.[key] }, key];
          }
          return [object, (node.optional ? (object || Object.create(null)) : object)[key], key];
        })
    );
  }

  private evalThisExpression() {
    return this.context;
  }

  private evalUnaryExpression(node: jsep.UnaryExpression) {
    return this.eval(node.argument, arg => ExpressionEval
      .unops[node.operator](arg));
  }

  private evalArrowFunctionExpression(node: ArrowExpression) {
    if (this.isAsync !== node.async) {
      return ExpressionEval[node.async ? 'evalAsync' : 'eval'](node as any, this.context);
    }

    // Note: Caching param mappers and complexity flag which speeds up loops or repeated calls
    // The cache is stored on the node (AST) itself but it is a lexical definition (param names and types), 
    // it does not capture runtime values. The params accept the `args` array (see the return statement) 
    // as an argument at execution time.
    const cachedMappers = (node as any)._paramMappers as (((ctx: any, args: any[], _eval: any) => void) | null)[] | undefined;
    const paramMappers = cachedMappers ?? (
      (node as any)._paramMappers = node.params?.map((param, i) => {
        if (param.type === 'Identifier') {
          const name = (param as jsep.Identifier).name;
          return (ctx: any, args: any[], _eval: any) => {
            ctx[name] = args[i];
          };
        }
        if (param.type === 'SpreadElement') {
          const arg = (param as SpreadElement).argument;
          if (arg.type === 'Identifier') {
            const name = (arg as jsep.Identifier).name;
            return (ctx: any, args: any[], _eval: any) => {
              ctx[name] = args.slice(i);
            };
          }
        }
        // Fallback for complex destructuring/defaults
        return null;
      })
    );

    const cachedHasComplex = (node as any)._hasComplexParams as boolean | undefined;
    const hasComplexParams = cachedHasComplex ?? (
      (node as any)._hasComplexParams = !paramMappers || paramMappers.some(m => !m)
    );

    // Optim: Avoid allocating new ExpressionEval instances for synchronous loops
    if (!this.isAsync) {
        // Capture context at definition time to allow lexical scoping (closures)
        const definitionContext = this.context;
        return (...arrowArgs: any[]) => {
            // Optim: Use prototype chain instead of spread copy 
            // Must inherit from definitionContext, not current execution context
            const arrowContext = Object.create(definitionContext || null);
            
            // Swap context EARLY so that default parameter evaluation (if any) sets correctly
            // and has access to the definition scope (and previous parameters)
            const oldContext = this.context;
            this.context = arrowContext;
            try {
                if (hasComplexParams) {
                    // Slow path for complex params
                    this.populateArrowContext(arrowContext, node, arrowArgs);
                } else {
                     // Fast path: direct assignment
                     for (let i = 0; i < paramMappers.length; i++) {
                         paramMappers[i](arrowContext, arrowArgs, this);
                     }
                }
                return this.eval(node.body);
            } finally {
                this.context = oldContext;
            }
        };
    }

    const definitionContext = this.context;
    return (...arrowArgs) => {
      const arrowContext = Object.create(definitionContext || null);
      
      // Swap context for populateArrowContext (default params evaluation)
      const oldContext = this.context;
      this.context = arrowContext;
      try {
        if (hasComplexParams) {
          this.populateArrowContext(arrowContext, node, arrowArgs);
        } else {
          for (let i = 0; i < paramMappers.length; i++) {
              paramMappers[i](arrowContext, arrowArgs, null);
          }
        }
      } finally {
        this.context = oldContext;
      }

      return ExpressionEval.evalAsync(node.body, arrowContext);
    };
  }

  // Renamed from evalArrowContext to populateArrowContext as it modifies in-place now
  private populateArrowContext(arrowContext: Context, node: ArrowExpression, arrowArgs): void {
    const params = (node.params as AnyExpression[]) || [];
    
    // Optim: Use for loop instead of forEach to avoid function allocation
    for (let i = 0; i < params.length; i++) {
        let param = params[i];
        
        // Handle spread element first as it consumes remaining args
        if (param.type === 'SpreadElement') {
             const arg = (param as SpreadElement).argument;
             if (arg.type === 'Identifier') {
                 arrowContext[(arg as jsep.Identifier).name] = arrowArgs.slice(i);
             }
             continue; 
        }

        let val = arrowArgs[i];

        // Handle Default Value (Assignment)
        if (param.type === 'AssignmentExpression') {
             if (val === undefined) {
                 val = this.eval((param as AssignmentExpression).right);
             }
             param = (param as AssignmentExpression).left as AnyExpression;
        }

        // Now destruct 'val' into 'param'
        if (param.type === 'Identifier') {
            arrowContext[(param as jsep.Identifier).name] = val;
        } else if (param.type === 'ArrayExpression') { 
            // array destructuring using 'val'
            (param.elements as AnyExpression[]).forEach((el, j) => {
              let subVal = val[j]; 
              if (el.type === 'AssignmentExpression') {
                if (subVal === undefined) {
                  // default value
                  subVal = this.eval(el.right);
                }
                el = el.left as AnyExpression;
              }
    
              if (el.type === 'Identifier') {
                arrowContext[(el as jsep.Identifier).name] = subVal;
              } else {
                throw new Error('Unexpected arrow function argument');
              }
            });
        } else if (param.type === 'ObjectExpression') {
            // object destructuring using 'val'
            const keys = [];
            (param.properties as AnyExpression[]).forEach((prop) => {
              let p = prop;
              if (p.type === 'AssignmentExpression') {
                p = p.left as AnyExpression;
              }
    
              let key;
              if (p.type === 'Property') {
                key = (p.key as jsep.Expression).type === 'Identifier'
                  ? (p.key as jsep.Identifier).name
                  : this.eval(p.key).toString();
              } else if (p.type === 'Identifier') {
                key = p.name;
              } else if (p.type === 'SpreadElement' && (p.argument as jsep.Expression).type === 'Identifier') {
                key = (p.argument as jsep.Identifier).name;
              } else {
                throw new Error('Unexpected arrow function argument');
              }
    
              let subVal = val[key]; 
              
              if (p.type === 'SpreadElement') {
                // all remaining object properties. Copy arg obj, then delete from our copy
                subVal = { ...val }; 
                keys.forEach((k) => {
                  delete subVal[k];
                });
              } else if (subVal === undefined && prop.type === 'AssignmentExpression') {
                // default value
                subVal = this.eval(prop.right);
              }
    
              arrowContext[key] = subVal;
              keys.push(key);
            });
        }
    }
  }

  private evalAssignmentExpression(node: AssignmentExpression) {
    return this.evalSyncAsync(
      this.getContextAndKey(node.left as AnyExpression),
      ([destObj, destKey]) => this.eval(node.right, right => ExpressionEval
        .assignOps[node.operator](destObj, destKey, right))
    );
  }

  private evalUpdateExpression(node: UpdateExpression) {
    return this.evalSyncAsync(
      this.getContextAndKey(node.argument as AnyExpression),
      ([destObj, destKey]) => ExpressionEval
        .evalUpdateOperation(node, destObj, destKey)
    );
  }

  private evalAwaitExpression(node: AwaitExpression) {
    return ExpressionEval.evalAsync(node.argument, this.context);
  }

  private static evalUpdateOperation(node: UpdateExpression, destObj, destKey) {
    if (node.prefix) {
      return node.operator === '++'
        ? ++destObj[destKey]
        : --destObj[destKey];
    }
    return node.operator === '++'
      ? destObj[destKey]++
      : destObj[destKey]--;
  }

  private getContextAndKey(node: AnyExpression) {
    if (node.type === 'MemberExpression') {
      return this.evalSyncAsync(
        this.evaluateMember(node as jsep.MemberExpression),
        ([obj, , key]) => [obj, key]
      );
    } else if (node.type === 'Identifier') {
      return [this.context, node.name];
    } else if (node.type === 'ConditionalExpression') {
      return this.eval(node.test, test => this
        .getContextAndKey((test
          ? node.consequent
          : node.alternate) as AnyExpression));
    } else {
      throw new Error('Invalid Member Key');
    }
  }

  private evalNewExpression(node: NewExpression) {
    const callee = node.callee || { type: 'Identifier', name: node.name } as jsep.Identifier;
    // Check if callee resolves to a function. If not, and it's an object/namespace, return a DeferredNew wrapper.
    // This handles the jsep-new-plugin confusing behavior on `new Namespace.Class()`.
    
    return this.evalSyncAsync(
        this.eval(callee),
        (ctor) => {
           if (typeof ctor !== 'function' && ctor && typeof ctor === 'object' && (!node.arguments || node.arguments.length === 0)) {
               // Defer instantiation if not a function and no arguments were passed (typical namespace pattern)
               return { [DEFERRED_NEW]: true, value: ctor };
           }
           return this.evalSyncAsync(
                this.evalArray(node.arguments || []),
                args => ExpressionEval.construct(ctor as any, args, node))
        });
  }

  private evalObjectExpression(node: ObjectExpression) {
    const obj = {};
    if (this.isAsync) {
        const props = node.properties;
        const arr = new Array(props.length);
        for (let i = 0; i < props.length; i++) {
          const prop = props[i] as Property | SpreadElement;
          if (prop.type === 'SpreadElement') {
            arr[i] = Promise.resolve(this.eval(prop.argument))
                .then(v => { Object.assign(obj, v); });
          } else if (prop.type === 'Property') {
            arr[i] = this.evalSyncAsync(
              prop.key.type === 'Identifier' && !prop.computed
                ? (prop.key as jsep.Identifier).name
                : this.eval(prop.key),
              key => this.eval(
                prop.shorthand ? prop.key : prop.value,
                val => { (obj as any)[key as string] = val; }
              )
            );
          }
        }
        return Promise.all(arr).then(() => obj);
    }

    // Sync fast-path: use cached mappers to avoid repetitive AST traversal/checks
    let mappers = (node as any)._objMappers;
    if (!mappers) {
      mappers = [];
      for (let i = 0; i < node.properties.length; i++) {
        const prop = node.properties[i] as (Property | SpreadElement);
        if (prop.type === 'SpreadElement') {
          const arg = prop.argument;
          mappers.push((evaluator: ExpressionEval, o: any) => Object.assign(o, evaluator.eval(arg)));
        } else if (prop.type === 'Property') {
          const valNode = prop.shorthand ? prop.key : prop.value;
          if (prop.key.type === 'Identifier' && !prop.computed) {
            const key = (prop.key as jsep.Identifier).name;
            mappers.push((evaluator: ExpressionEval, o: any) => {
              o[key] = evaluator.eval(valNode);
            });
          } else {
            const keyNode = prop.key;
            mappers.push((evaluator: ExpressionEval, o: any) => {
              const key = evaluator.eval(keyNode) as string | number;
              o[key] = evaluator.eval(valNode);
            });
          }
        }
      }
      (node as any)._objMappers = mappers;
    }

    for (let i = 0; i < mappers.length; i++) {
      mappers[i](this, obj);
    }
    return obj;
  }

  private evalSpreadElement(node: SpreadElement) {
    return this.eval(node.argument);
  }

  private evalTaggedTemplateExpression(node: TaggedTemplateExpression) {
    const fnAndArgs = [
      this.evalCall(node.tag),
      this.evalSyncAsync(
        this.evalArray(node.quasi.expressions),
        exprs => [
          node.quasi.quasis.map(q => q.value.cooked),
          ...exprs,
        ]
      ),
    ];
    const apply = ([[fn, caller], args]) => fn.apply(caller, args);
    return this.isAsync
      ? Promise.all(fnAndArgs).then(apply)
      : apply(fnAndArgs as [[() => unknown, AnyExpression], unknown]);
  }

  private evalTemplateLiteral(node: TemplateLiteral) {
    return this.evalSyncAsync(
      this.evalArray(node.expressions),
      expressions => node.quasis.reduce((str, q, i) => {
        str += q.value.cooked;
        if (!q.tail) {
          str += expressions[i];
        }
        return str;
      }, '')
    );
  }

  protected static construct(
    ctor: () => unknown,
    args: unknown[],
    node: jsep.CallExpression | jsep.Expression
  ): unknown {
    try {
      return new (Function.prototype.bind.apply(ctor, [null].concat(args)))();
    } catch (e) {
      throw new Error(`${ExpressionEval.nodeFunctionName(node.callee as AnyExpression)} is not a constructor`);
    }
  }

  protected static validateFnAndCall(
    fn: (() => unknown) | DeferredNew,
    callee?: AnyExpression,
    caller?: AnyExpression,
  ): [() => unknown, AnyExpression] {
    if (fn && (fn as any)[DEFERRED_NEW]) {
        // Unwrap deferred new, if we are here it means we are trying to Call a DeferredNew, so we should Construct it instead.
        const realFn = (fn as any).value;
        if (typeof realFn === 'function') {
            // Return a wrapper that forces construction using Reflect.construct (ignoring 'this'/caller)
            // 'args' will be passed by evalCall's fn.apply(..., args)
            return [ (...args: any[]) => Reflect.construct(realFn as Function, args), callee];
        } else if (callee?.type === 'MemberExpression') {
             // If we are here, `fn.value` is NOT a function.
             // fall through
        }
        
        // If unwrap is still not a function, fall through to error
        return ExpressionEval.validateFnAndCall(realFn, callee, caller);
    }
    
    if (typeof fn !== 'function') {
      if (!fn && caller && caller.optional) {
        return [() => undefined, callee];
      }
      const name = ExpressionEval.nodeFunctionName(caller || callee) || 'unknown';
      throw new Error(`'${name}' is not a function`);
    }
    return [fn, callee];
  }

  protected static nodeFunctionName(callee: AnyExpression): string {
    return callee
      && ((callee as jsep.Identifier).name
        || ((callee as jsep.MemberExpression).property
          && ((callee as jsep.MemberExpression).property as jsep.Identifier).name));
  }
}

/** NOTE: exporting named + default.
 * For CJS, these match the static members of the default export, so they still work.
 */
export { default as jsep, default as parse } from 'jsep';
export const DEFAULT_PRECEDENCE = ExpressionEval.DEFAULT_PRECEDENCE;
export const evaluators = ExpressionEval.evaluators;
export const binops = ExpressionEval.binops;
export const unops = ExpressionEval.unops;
export const assignOps = ExpressionEval.assignOps;
export const addUnaryOp = ExpressionEval.addUnaryOp;
export const addBinaryOp = ExpressionEval.addBinaryOp;
export const addEvaluator = ExpressionEval.addEvaluator;
export const registerPlugin = ExpressionEval.registerPlugin;
export const evaluate = ExpressionEval.eval;
export const evalAsync = ExpressionEval.evalAsync;
export const compile = ExpressionEval.compile;
export const compileAsync = ExpressionEval.compileAsync;
export const evalExpr = ExpressionEval.evalExpr;
export const evalExprAsync = ExpressionEval.evalExprAsync;
