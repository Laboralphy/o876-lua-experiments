const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;
const LuaProgram = require('./LuaProgram');

function set(luaState, funcName, func, promiseRegistry) {
    const wrapped = (L) => {
        console.log('wrapper: running function', funcName);
        const nargs = lua.lua_gettop(L); // top stack element is the number of args
        const args = []; // args for js function
        for (let i = 1; i <= nargs; i++) {
            args.push(lua.lua_tonumber(L, i)); // copy stacks values to js parameters array
        }
        const res = func(...args);
        if (res instanceof Promise && lua.lua_isyieldable(L)) {
            // if return a Promise and currently in a coroutine
            // if not in a coroutine, yield will throw an error about 'yield outside coroutine'
            console.log('wrapper: waiting for promise to resolve');
            promiseRegistry.set(L, res);
            res.then((r) => {
                console.log('wrapper: promise has resolved, result is', r);
                if (r === undefined) {
                    console.log('wrapper: lua_resume');
                    lua.lua_resume(L, luaState, 0);
                } // no return value
                else {
                    lua.lua_pushnumber(L, r);
                    console.log('wrapper: lua_resume');
                    lua.lua_resume(L, luaState, 1); // only one return value
                }
            });
            console.log('wrapper: lua_yield');
            return lua.lua_yield(L, 0); // yield from outside to pause Lua code
        } else {
            console.log('push imm value', res);
            lua.lua_pushnumber(L, res);
            return res; // push the res to stack and return res number
        }
    };
    lua.lua_pushjsfunction(luaState, wrapped);
    lua.lua_setglobal(luaState, funcName);
}

async function add(a, b) {
    return new Promise((resolve) => {
        console.log('add: in promise, will add', a, '+', b);
        setTimeout(() => {
            console.log('add: resolved promise');
            resolve(a + b);
        }, 100);
    });
}

describe('test coroutine 1', () => {
    it('should work 1', async () => {
        const L = lauxlib.luaL_newstate();
        const promRegistry = new Map();
        lualib.luaL_openlibs(L);
        let RESULT;
        set(
            L,
            'exportResult',
            (n) => {
                console.log('exportResult', n);
                RESULT = n;
            },
            promRegistry
        );
        set(L, 'add', add, promRegistry);
        lauxlib.luaL_loadstring(
            L,
            `

        function main(a, b)
            local r = add(33, 44)
            exportResult(r)
        end

        `
        );
        const co = lua.lua_newthread(L);
        let result = 'uninitialized';

        // lua.lua_getglobal(co, 'add');
        // lua.lua_pushnumber(co, 10);
        // lua.lua_pushnumber(co, 20);
        // const status = lua.lua_resume(co, L, 2);
        lua.lua_getglobal(co, 'add');
        lua.lua_pushnumber(co, 10);
        lua.lua_pushnumber(co, 20);
        const status = lua.lua_resume(co, L, 2);
        if (status === lua.LUA_YIELD) {
            const prom = promRegistry.get(co);
            if (prom) {
                console.log('main: we got the promise');
                await prom;
            } else {
                console.log('main: no promise gotten');
            }
            console.log('main: status = yield');
            // Récupérer le résultat (suppose une seule valeur de retour)
            if (lua.lua_gettop(co) > 0) {
                result = lua.lua_tonumber(co, -1); // Récupère la valeur au sommet de la pile
                lua.lua_pop(co, 1); // Nettoie la pile
                console.log('main: got yield with return value', result);
            } else {
                console.log('main: got yield with no return value');
            }
        } else if (status === lua.LUA_OK) {
            console.log('main: status = ok');
            console.log('main: result =', result);
        } else {
            // Gérer l'erreur
            const errorMessage = lua.lua_tojsstring(co, -1);
            lua.lua_pop(co, 1); // Nettoie la pile
            throw new Error('Erreur dans la coroutine :' + errorMessage);
        }
    });
});

describe('test coroutine 2', () => {
    it('should work 2', () => {
        const code = `

        function main()
            local x = 10 + 20
            exportResult(x)
        end

        main();
        `;
        const l = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(l);

        set(l, 'exportResult', (x) => {
            RESULT = x;
        });

        lauxlib.luaL_loadstring(l, code);

        const co = lua.lua_newthread(l);

        let RESULT;
        const status = lua.lua_resume(co, l, 0);
        console.log(RESULT, status);
    });
});
