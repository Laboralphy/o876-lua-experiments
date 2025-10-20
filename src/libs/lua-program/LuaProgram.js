const fengari = require('fengari');

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
        lua_pushboolean,
        lua_pushnumber,
        lua_pushnil,
        lua_pushcfunction,
        lua_pushliteral,
        lua_pushstring,
        lua_pushvalue,
        lua_len,
        lua_rawgeti,
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
        this.pendingResolvers = new Map();
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
                    value = '{table ' + ptr.id + '}';
                    break;
                }
                default: {
                    value = `unknown type: ${typeName}`;
                    break;
                }
            }
            output.stack.push({ typename: typeName, value });
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

        // Itération
        lua_pushnil(L); // [..., table, nil]
        let iter = 0;
        while (lua_next(L, -2)) {
            // [..., table, key, value]
            const key = lua_isnumber(L, -2) ? lua_tonumber(L, -2) : this._decodeStackString(L, -2);
            objectEntries.push([key, this._peekValue(L, -1)]);
            lua_pop(L, 1); // [..., table, key]
            ++iter;
        }
        // Nettoyage : pop la clé résiduelle et la copie de la table
        // lua_pop(L, 1); // [..., table] → pop la clé
        lua_pop(L, 1); // [...] → pop la copie de la table
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
     * An error occurred in the specified coroutine, extract error,
     * clean stack and return error.
     * @param co the coroutine instance
     * @returns {string} error message
     * @private
     */
    _handleCoroutineError(co) {
        const error = this._decodeStackString(co, -1); // read top stack value
        lua_pop(co, 1); // ... and removes it
        this.pendingResolvers.delete(co); // this coroutine is over
        return error; // return error message
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
            const nargs = lua_gettop(L); // top stack element is the number of args
            const args = []; // args for js function
            for (let i = 1; i <= nargs; i++) {
                args.push(this._peekValue(L, i)); // copy stacks values to js parameters array
            }
            const result = func(...args); // call js function with args parameters array
            this._pushValue(L, result); // push value
            return 1;
        });
        lua_setglobal(this.L, name);
    }

    /**
     * Calls a lua function by its name
     * @param {string} funcName
     * @param {Array} args
     * @returns {any}
     */
    callFunction(funcName, args = []) {
        const L = this.L;
        lua_getglobal(L, funcName);
        args.forEach((arg) => {
            if (typeof arg === 'number') {
                lua_pushnumber(L, arg);
            } else if (typeof arg === 'string') {
                lua_pushstring(L, arg);
            } else if (typeof arg === 'boolean') {
                lua_pushboolean(L, arg);
            } else if (arg === null) {
                lua_pushnil(L);
            } else throw new Error(`Unsupported argument type: ${typeof arg}`);
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

// async function main() {
//     const program = new LuaProgram();
//
//     program.loadPackage([
//         { name: 'math_utils_package', code: 'function square(x) return x * x end' },
//         {
//             name: 'greet_package',
//             code: "function greet(name) return 'Hello, ' .. name .. '! Square of 5 is ' .. square(5) end",
//         },
//     ]);
//
//     program.bindFunction('log', console.log);
// }
//
// main().then(() => console.log('done.'));

module.exports = LuaProgram;
