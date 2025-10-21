const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;
const LuaProgram = require('./LuaProgram');

function set (L, funcName, func) {
    const wrapped = (L) => {
        args = [...]; // read args from stack
        res = func.call(null, ...args);
        if (res instance of Promise && lua.lua_isyieldable(L)) { // if return a Promise and currently in a coroutine
            // if not in a coroutine, yield will throw an error about 'yield outside coroutine'
            Promise.resolve(res).then(r => {
                if (r === undefined) lua.lua_resume(L, from, 0);  // no return value
                else {
                    pushStack(L, r)
                    lua.lua_resume(L, from, 1);  // only one return value
                }
            });
            return lua.lua_yield(L, 0);  // yield from outside to pause Lua code
        } else {
            pushStack(L, res);
            return resNumber;  // push the res to stack and return res number
        }
    };
    lua.lua_pushjsfunction(L, wrapped);
    lua.lua_setglobal(L, funcName);
};

set('add', async (a, b) => {
    await waitFor(10);  // wait for 10ms, which makes this function async and return a promise, Lua call will pause here to wait for return
    return a + b;
});

/**
 * Crée une coroutine Lua à partir d'une fonction Lua et retourne une fonction JS pour la reprendre.
 * @param {fengari.lua.State} L - L'état Lua
 * @param {Function} luaFunction - La fonction Lua à envelopper (doit être sur le sommet de la stack)
 * @returns {Function} Une fonction JS qui reprend la coroutine
 */
function wrapLuaCoroutine(L) {
    // 1. Crée un nouveau thread (coroutine) à partir de la fonction Lua
    const co = fengari.lua.lua_newthread(L);

    // 2. Place la fonction Lua dans la stack du nouveau thread
    fengari.lua.lua_pushvalue(L, -1); // Copie la fonction (supposée être sur le sommet de la stack)
    fengari.lua.lua_xmove(L, co, 1); // Déplace la fonction vers le thread

    return function (...args) {
        console.log('x1');
        // 3. Place les arguments sur la stack du thread
        for (const arg of args) {
            if (typeof arg === 'number') {
                fengari.lua.lua_pushnumber(co, arg);
            } else if (typeof arg === 'string') {
                fengari.lua.lua_pushstring(co, arg);
            }
            // Ajoute d'autres types si nécessaire
        }
        console.log('x2');

        // 4. Reprend la coroutine
        const status = fengari.lua.lua_resume(co, L, args.length);
        console.log('x3', status);

        // 5. Récupère les résultats ou l'erreur
        if (status === fengari.lua.LUA_YIELD) {
            // La coroutine a yieldé : récupère les valeurs retournées
            const results = [];
            const nResults = fengari.lua.lua_gettop(co);
            for (let i = 1; i <= nResults; i++) {
                const type = fengari.lua.lua_type(co, i);
                if (type === fengari.lua.LUA_TNUMBER) {
                    results.push(fengari.lua.lua_tonumber(co, i));
                } else if (type === fengari.lua.LUA_TSTRING) {
                    results.push(fengari.lua.lua_tostring(co, i));
                }
                // Ajoute d'autres types si nécessaire
            }
            fengari.lua.lua_pop(co, nResults); // Nettoie la stack
            return results.length > 0 ? results : undefined;
        } else if (status === fengari.lua.LUA_OK) {
            // La coroutine a terminé : récupère les valeurs de retour
            const results = [];
            const nResults = fengari.lua.lua_gettop(co);
            for (let i = 1; i <= nResults; i++) {
                const type = fengari.lua.lua_type(co, i);
                if (type === fengari.lua.LUA_TNUMBER) {
                    results.push(fengari.lua.lua_tonumber(co, i));
                } else if (type === fengari.lua.LUA_TSTRING) {
                    results.push(fengari.lua.lua_tostring(co, i));
                }
            }
            fengari.lua.lua_pop(co, nResults);
            return results.length > 0 ? results : undefined;
        } else {
            // Erreur
            const err = fengari.lua.lua_tostring(co, -1);
            fengari.lua.lua_pop(co, 1);
            throw new Error(`Erreur dans la coroutine Lua: ${LuaProgram.decodeUint8Array(err)}`);
        }
    };
}

describe('test-coroutine', () => {
    it('should successfully run a function in a coroutine', () => {
        const L = lauxlib.luaL_newstate();
        lauxlib.luaL_dostring(
            L,
            `
    function ma_fonction(a, b)
        coroutine.yield(a + b)
        coroutine.yield(a * b)
        return a - b
    end
`
        );
        const wrapped = wrapLuaCoroutine(L, null); // La fonction est déjà sur la stack

        // Appels successifs
        console.log(wrapped(2, 3)); // [5]
        console.log(wrapped()); // [6]
        console.log(wrapped()); // [-1]
        console.log(wrapped()); // undefined
    });
});
