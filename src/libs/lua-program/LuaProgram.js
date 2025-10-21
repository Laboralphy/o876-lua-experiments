const fengari = require('fengari');
const { luaL_loadstring } = require('fengari/src/lauxlib');
const { LUA_ERRRUN, LUA_TTHREAD, LUA_TFUNCTION } = require('fengari/src/lua');

const {
    FENGARI_COPYRIGHT,
    to_jsstring,
    to_luastring,
    lua: {
        LUA_ERRSYNTAX,
        LUA_MULTRET,
        LUA_OK,
        LUA_REGISTRYINDEX,
        LUA_TSTRING,
        LUA_TNUMBER,
        LUA_TBOOLEAN,
        LUA_TNIL,
        LUA_TTABLE,
        LUA_YIELD,
        lua_createtable,
        lua_getglobal,
        lua_gettop,
        lua_gettable,
        lua_insert,
        lua_pcall,
        lua_newtable,
        lua_newthread,
        lua_isthread,
        lua_isnumber,
        lua_isstring,
        lua_isboolean,
        lua_isnil,
        lua_resume,
        lua_yield,
        lua_settable,
        lua_pop,
        lua_error,
        lua_pushboolean,
        lua_pushnumber,
        lua_pushnil,
        lua_pushcfunction,
        lua_pushliteral,
        lua_pushstring,
        lua_pushvalue,
        lua_pushthread,
        lua_len,
        lua_rawgeti,
        lua_register,
        lua_remove,
        lua_next,
        lua_setfield,
        lua_setglobal,
        lua_seti,
        lua_settop,
        lua_tojsstring,
        lua_tostring,
        lua_tonumber,
        lua_toboolean,
        lua_tonil,
        lua_tothread,
        lua_topointer,
        lua_tocfunction,
        lua_type,
        lua_typename,
        lua_close,
        lua_istable,
    },
    lauxlib: {
        luaL_callmeta,
        luaL_checkstack,
        luaL_error,
        luaL_len,
        luaL_loadbuffer,
        luaL_loadfile,
        luaL_newstate,
        luaL_traceback,
        luaL_typename,
        lua_writestringerror,
    },
    lualib: { LUA_VERSUFFIX, luaL_openlibs },
} = fengari;

class LuaProgram {
    constructor() {
        this.L = luaL_newstate();
        luaL_openlibs(this.L);
        this.pendingPromises = new Map();
    }

    /**
     * Converts an UTF8 buffer string to a JS UTF16 string
     * @param buffer {Buffer} input buffer, produced by lua
     * @returns {string} output string usable by js
     * @private
     */
    static decodeUint8Array(buffer) {
        if (buffer instanceof Uint8Array) {
            return Buffer.from(buffer).toString('utf8');
        }
        throw new TypeError(`type mismatch : expecting Uint8Array`);
    }

    /**
     * Returns true if the sepcified stack item is an array
     * A table with numeric values starting at 1
     * @param L {*} Lua state or coroutine
     * @param index {number} index
     * @returns {boolean}
     * @private
     */
    _isArray(L, index) {
        if (!lua_istable(L, index)) {
            // no need to continuer : this is not a table
            return false;
        }
        const top = lua_gettop(L);
        lua_pushvalue(L, index); // [table]
        lua_pushnil(L); // [table, nil]
        let maxKey = 0;
        let count = 0;

        while (lua_next(L, -2)) {
            // [table, key, value]
            const key = lua_tonumber(L, -2);
            if (!Number.isInteger(key) || key < 1) {
                // non-numeric key ou < 1 : this is not a numeric table
                lua_pop(L, 2); // Clean stack
                lua_settop(L, top); // Restore stack state
                return false;
            }
            if (key > maxKey) {
                maxKey = key;
            }
            ++count;
            lua_pop(L, 1); // Pop value and keep key for next iteration
        }
        lua_pop(L, 1); // Clean stack by popping out the table copy
        const isNumericArray = maxKey === count; // Checks maxKey == count (no missing index)
        lua_settop(L, top); // Clean stack
        return isNumericArray;
    }

    /**
     * Push a JS value on Lua stack
     * according to js variable type, we will use the proper stack-pusher
     */
    _pushValue(L, value) {
        if (value === null || value === undefined) {
            lua_pushnil(L);
            return;
        }
        switch (typeof value) {
            case 'number': {
                lua_pushnumber(L, value);
                break;
            }
            case 'string': {
                lua_pushstring(L, value);
                break;
            }
            case 'boolean': {
                lua_pushboolean(L, value);
                break;
            }
            case 'object': {
                if (Array.isArray(value)) {
                    // Array
                    lua_newtable(L);
                    for (let i = 0; i < value.length; i++) {
                        lua_pushnumber(L, i + 1); // Lua uses indices starting with 1
                        this._pushValue(L, value[i]);
                        lua_settable(L, -3);
                    }
                } else {
                    // Plain object
                    lua_newtable(L);
                    for (const [key, v] of Object.entries(value)) {
                        lua_pushstring(L, key);
                        this._pushValue(L, v);
                        lua_settable(L, -3);
                    }
                }
                break;
            }
            default: {
                // Push nil on unsupported type
                lua_pushnil(L);
                break;
            }
        }
    }

    /**
     * Returns an ordered list of numeric value.
     * Fails if input list contains non-number values or if numeric offset are missing
     * @param aList
     * @private
     */
    _convertEntriesToOrderedArray(aList) {
        if (aList.some((x) => typeof x[0] !== 'number')) {
            console.log('some keys are not numbers', aList);
            return null;
        }
        aList.sort((a, b) => a[0] - b[1]);
        return aList.map((x) => x[1]);
    }

    static debugStack(L, message = 'Stack size :') {
        const top = lua_gettop(L);
        const output = {
            message,
            size: top,
            stack: [],
        };
        for (let i = 1; i <= top; i++) {
            const type = lua_type(L, i);
            const typeName = LuaProgram.decodeUint8Array(lua_typename(L, type));
            let value;
            switch (type) {
                case LUA_TNUMBER: {
                    value = lua_tonumber(L, i);
                    break;
                }
                case LUA_TSTRING: {
                    value = `"${this._decodeStackString(L, i)}"`;
                    break;
                }
                case LUA_TBOOLEAN: {
                    value = lua_toboolean(L, i);
                    break;
                }
                case LUA_TNIL: {
                    value = 'nil';
                    break;
                }
                case LUA_TTABLE: {
                    const ptr = lua_topointer(L, i);
                    value = '{table #' + ptr.id + '}';
                    break;
                }
                case LUA_TTHREAD: {
                    const ptr = lua_tothread(L, i);
                    value = '{thread #' + ptr.id + '}';
                    break;
                }
                case LUA_TFUNCTION: {
                    const ptr = lua_tocfunction(L, i);
                    value = '{function ' + ptr.name + '()}';
                    break;
                }
                default: {
                    value = `unknown type: ${typeName}`;
                    break;
                }
            }
            output.stack.push({ index: i - top - 1, value });
        }
        return output;
    }

    _peekTable(L, index = -1) {
        if (!lua_istable(L, index)) {
            throw new TypeError(`index ${index} does not point toward a real lua table.`);
        }
        const bIsArray = this._isArray(L, index);

        const top = lua_gettop(L); // save stack state
        const objectEntries = [];

        lua_pushvalue(L, index); // [..., table]

        lua_pushnil(L); // [..., table, nil]
        let iter = 0;
        while (lua_next(L, -2)) {
            // [..., table, key, value]
            const key = lua_isnumber(L, -2) ? lua_tonumber(L, -2) : this._decodeStackString(L, -2);
            objectEntries.push([key, this._peekValue(L, -1)]);
            lua_pop(L, 1); // [..., table, key]
            ++iter;
        }
        lua_pop(L, 1); // [...] → popping table copy out
        lua_settop(L, top); // restore stack initial state

        if (bIsArray) {
            return this._convertEntriesToOrderedArray(objectEntries);
        } else {
            return Object.fromEntries(objectEntries);
        }
    }

    _decodeStackString(L, index = -1) {
        return LuaProgram.decodeUint8Array(lua_tostring(L, index));
    }

    /**
     * Retrieve a value on Lua stack at the specified index
     * @param L {*} Lua state
     * @param index {number} stack index
     * @returns {any}
     * @private
     */
    _peekValue(L, index = -1) {
        if (!lua_istable(L, index)) {
            switch (lua_type(L, index)) {
                case LUA_TNUMBER: {
                    return lua_tonumber(L, index);
                }
                case LUA_TSTRING: {
                    return this._decodeStackString(L, index);
                }
                case LUA_TBOOLEAN: {
                    return lua_toboolean(L, index);
                }
                case LUA_TNIL: {
                    return null;
                }
                default: {
                    return `[Lua ${lua_typename(L, lua_type(L, index))}]`;
                }
            }
        }
        return this._peekTable(L, index);
    }

    /**
     * Loads a Lua Chunk in VM
     * @param {string} chunkCode
     * @param {string} chunkName
     */
    loadChunk(chunkCode, chunkName = 'chunk') {
        if (luaL_loadbuffer(this.L, Buffer.from(chunkCode), chunkName) !== LUA_OK) {
            const error = this._decodeStackString(this.L, -1);
            throw new Error(`Chunk loading error "${chunkName}": ${error}`);
        }
        if (lua_pcall(this.L, 0, LUA_MULTRET, 0) !== LUA_OK) {
            const error = this._decodeStackString(this.L, -1);
            throw new Error(`Chunk execution error "${chunkName}": ${error}`);
        }
    }

    /**
     * Loads a set of chunks Lua
     * @param {Array<{code: string, name: string}>} chunks
     */
    loadPackage(chunks) {
        chunks.forEach(({ code, name }) => this.loadChunk(code, name));
    }

    /**
     * Binds a javascript function to a Lua name
     * @param {string} name
     * @param {Function} func
     */
    bindFunction(name, func) {
        lua_pushcfunction(this.L, (L) => {
            console.log('invoking', name);
            const nargs = lua_gettop(L); // top stack element is the number of args
            const args = []; // args for js function
            for (let i = 1; i <= nargs; i++) {
                args.push(this._peekValue(L, i)); // copy stacks values to js parameters array
            }
            const result = func(...args); // call js function with args parameters array
            if (result instanceof Promise) {
                // we should be inside a co routine
                if (!lua_isthread(L, 1)) {
                    // not in coroutine
                    throw new Error(`function ${name} must be invoked in a coroutine context`);
                }
                const co = lua_tothread(L, 1);
                // we are in coroutine and the promise is pending,
                // we should stop coroutine and wait for promise to either resolve or reject
                result
                    .then((result) => {
                        // resolve handling
                        this._pushValue(co, result);
                        lua_resume(co, this.L, 1);
                    })
                    .catch((err) => {
                        // error handling
                        this._pushValue(co, err.message);
                        lua_error(co); // Déclenche l'erreur
                    });
                lua_yield(L, 0);
            } else {
                this._pushValue(L, result); // push result
                return 1;
            }
        });
        lua_setglobal(this.L, name);
    }

    /**
     * A JS function has returns a promise,
     * we should check that we are in coroutine
     * @param co
     * @param prom
     * @private
     */
    _handleAsyncFunction(co, prom) {
        prom.then((result) => {
            // Reprend la coroutine avec le résultat
            lua_resume(co, null, result);
        }).catch((err) => {
            lua_resume(co, null, err);
        });
    }

    // Wrapper générique pour Lua
    bindAsyncFunctions(L) {
        // Expose une fonction Lua `call_async` qui prend :
        // - le nom de la fonction JS
        // - les arguments
        lua_pushstring(L, 'call_async');
        lua_pushcfunction(L, function (L) {
            const funcName = lua_tostring(L, 1);
            const args = [];
            // Récupère les arguments (simplifié ici)
            for (let i = 2; i <= lua.lua_gettop(L); i++) {
                args.push(lua.lua_tostring(L, i));
            }

            if (!asyncFunctions[funcName]) {
                lua.luaL_error(L, `Function ${funcName} not found`);
                return 0;
            }

            // Appelle la fonction JS asynchrone
            const promise = asyncFunctions[funcName](...args);
            lua.lua_pushlightuserdata(L, promise);
            return 1;
        });
        lua.lua_settable(L, lua.LUA_GLOBALSINDEX);

        // Le wrapper 'await' (inchangé)
        lua.lua_pushstring(L, 'await');
        lua.lua_pushcfunction(L, function (L) {
            const promise = lua.lua_touserdata(L, 1);
            const co = lua.lua_tothread(L, 2);
            promise
                .then((result) => {
                    lua.lua_pushthread(L, co);
                    lua.lua_pushstring(L, JSON.stringify(result));
                    lua.lua_resume(L, co, 1);
                })
                .catch((err) => {
                    lua.lua_pushthread(L, co);
                    lua.lua_pushstring(L, 'Error: ' + err.message);
                    lua.lua_resume(L, co, 1);
                });
            return lua.LUA_YIELD;
        });
        lua.lua_settable(L, lua.LUA_GLOBALSINDEX);
    }

    // *runCoroutineGenerator(chunkCode) {
    //     const co = lua_newthread(this.L);
    //     luaL_loadstring(co, 'print(35)'); // Pas besoin de lua_pushthread ici
    //
    //     const status = lua_resume(co, this.L, 0);
    //
    //     if (status !== LUA_OK) {
    //         const errorMessage = lua_tostring(co, -1); // Récupère le message d'erreur
    //         console.error('Erreur dans la coroutine :', LuaProgram.decodeUint8Array(errorMessage));
    //         lua_pop(co, 1); // Nettoie la pile
    //     } else {
    //         console.log('Coroutine exécutée avec succès.');
    //     }
    //
    //     return;
    //     while (true) {
    //         console.log(LuaProgram.debugStack(co, 'starting iteration'));
    //         const status = lua_resume(co, this.L, 0);
    //         switch (status) {
    //             case LUA_OK: {
    //                 console.log('case ok');
    //                 // coroutine has ended with an OK return code
    //                 const result = this._peekValue(co);
    //                 lua_pop(co, 1);
    //                 lua_close(co);
    //                 return result;
    //             }
    //             case LUA_YIELD: {
    //                 console.log('case yield');
    //                 // coroutine has invoked a yield
    //                 // this is caused by an async function call
    //                 console.log(LuaProgram.debugStack(co, 'coroutine stack'));
    //                 yield;
    //                 break;
    //             }
    //             default: {
    //                 console.log('case error');
    //                 // A runtime error occurred
    //                 const error = this._decodeStackString(co, -1); // read top stack value
    //                 lua_pop(co, 1); // ... and removes it
    //                 // this.pendingResolvers.delete(co); // this coroutine is over
    //                 lua_close(co);
    //                 throw new Error(error); // return error message
    //             }
    //         }
    //     }
    // }

    /**
     * Calls a lua function by its name
     * @param {string} funcName
     * @param {Array} args
     * @returns {any}
     */
    callFunction(funcName, ...args) {
        const L = this.L;
        lua_getglobal(L, funcName);
        args.forEach((arg) => {
            this._pushValue(L, arg);
        });
        if (lua_pcall(L, args.length, 1, 0) !== LUA_OK) {
            const error = this._decodeStackString(this.L, -1);
            throw new Error(`Call error "${funcName}": ${error}`);
        }
        const result = this._peekValue(L, -1);
        lua_pop(L, 1);
        return result;
    }

    pushValue(value) {
        return this._pushValue(this.L, value);
    }

    peekValue(index = -1) {
        return this._peekValue(this.L, index);
    }

    pop(count = 1) {
        return lua_pop(this.L, count);
    }

    isArray(index = -1) {
        return this._isArray(this.L, (index = -1));
    }

    getStackCount() {
        return lua_gettop(this.L);
    }

    /**
     * Close Lua state
     */
    close() {
        lua_close(this.L);
    }
}

module.exports = LuaProgram;
