var cls = require('continuation-local-storage');
var domain = require('domain');

var endomain = module.exports = {};

/**
 * Get the current context object. The context is preserved
 * across async calls, it behaves like a thread-local storage.
 *
 * @returns {ChainedContext} The context object or null.
 */
endomain.getCurrentContext = function () {
    // A placeholder method, see endomain.createContext() for the real version
    return null;
};

/**
 * Run the given function in such way that
 * `endomain.getCurrentContext` returns the
 * provided context object.
 *
 * **NOTE**
 *
 * The method is supported on the server only, it does not work
 * in the browser at the moment.
 *
 * @param {Function} fn The function to run, it will receive arguments
 * (currentContext, currentDomain).
 * @param {ChainedContext} [context] An optional context object.
 *   When no value is provided, then the default global context is used.
 */
endomain.runInContext = function (fn, context) {
    var currentDomain = domain.create();
    currentDomain.oldBind = currentDomain.bind;
    currentDomain.bind = function (callback, context) {
        return currentDomain.oldBind(ns.bind(callback, context), context);
    };

    var ns = context || endomain.createContext('endomain');

    currentDomain.run(function () {
        ns.run(function executeInContext(context) {
            fn(ns, currentDomain);
        });
    });
};

/**
 * Create a new EndomainContext instance that can be used
 * for `endomain.runInContext`.
 *
 * **NOTES**
 *
 * At the moment, `endomain.getCurrentContext` supports
 * a single global context instance only. If you call `createContext()`
 * multiple times, `getCurrentContext` will return the last context
 * created.
 *
 * The method is supported on the server only, it does not work
 * in the browser at the moment.
 *
 * @param {String} scopeName An optional scope name.
 * @param {Array|Object} [chains] The objects to be chained.
 * @return {ChainedContext} The new context object.
 */
endomain.createContext = function (scopeName, chains) {
    // Make the namespace globally visible via the process.context property
    process.context = process.context || {};
    var ns = process.context[scopeName];
    if (!ns) {
        ns = cls.createNamespace(scopeName);
        process.context[scopeName] = ns;
        // Set up endomain.getCurrentContext()
        endomain.getCurrentContext = function () {
            return ns && ns.active ? ns : null;
        };

        if (chains) {
            chains = Array.isArray(chains) ? chains : [chains];
            chains.forEach(function (obj) {
                chain(obj);
            });
        }
    }
    return ns;
};

endomain.chain = chain;

/**
 * Create a chained context
 * @param {Object} child The child context
 * @param {Object} parent The parent context
 * @private
 * @constructor
 */
function ChainedContext(child, parent) {
    this.child = child;
    this.parent = parent;
}

/**
 * Get the value by name from the context. If it doesn't exist in the child
 * context, try the parent one
 * @param {String} name Name of the context property
 * @returns {*} Value of the context property
 * @private
 */
ChainedContext.prototype.get = function (name) {
    var val = this.child && this.child.get(name);
    if (val === undefined) {
        return this.parent && this.parent.get(name);
    }
};

ChainedContext.prototype.set = function (name, val) {
    if (this.child) {
        return this.child.set(name, val);
    } else {
        return this.parent && this.parent.set(name, val);
    }
};

ChainedContext.prototype.reset = function (name, val) {
    if (this.child) {
        return this.child.reset(name, val);
    } else {
        return this.parent && this.parent.reset(name, val);
    }
};

function chain(child) {
    if (typeof child.getCurrentContext === 'function') {
        var childContext = new ChainedContext(child.getCurrentContext(),
            endomain.getCurrentContext());
        child.getCurrentContext = function () {
            return childContext;
        };
    } else {
        child.getCurrentContext = endomain.getCurrentContext;
    }
}
